const crypto = require("crypto");
const debounce = require("lodash.debounce");
const Y = require("yjs");

const Document = require("../models/Document");

const docs = new Map();
const UPDATE_HASH_TTL_MS = 30000;

const DEFAULT_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#ec4899",
];

const toUint8Array = (input) => {
  if (!input) {
    return new Uint8Array();
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }

  if (Buffer.isBuffer(input.buffer)) {
    return new Uint8Array(input.buffer);
  }

  if (Array.isArray(input)) {
    return Uint8Array.from(input);
  }

  if (input.type === "Buffer" && Array.isArray(input.data)) {
    return Uint8Array.from(input.data);
  }

  throw new Error("Unsupported update format.");
};

const updateHash = (update) =>
  crypto.createHash("sha1").update(Buffer.from(update)).digest("hex");

const colorFromSocketId = (socketId) => {
  let hash = 0;
  for (let index = 0; index < socketId.length; index += 1) {
    hash = (hash << 5) - hash + socketId.charCodeAt(index);
    hash |= 0;
  }

  const paletteIndex = Math.abs(hash) % DEFAULT_COLOR_PALETTE.length;
  return DEFAULT_COLOR_PALETTE[paletteIndex];
};

const normalizeUser = (user, socketId) => {
  const safeName =
    typeof user?.name === "string" && user.name.trim()
      ? user.name.trim().slice(0, 40)
      : "Anonymous";

  const safeColor =
    typeof user?.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(user.color)
      ? user.color
      : colorFromSocketId(socketId);

  return {
    name: safeName,
    color: safeColor,
    socketId,
  };
};

const buildUsersPayload = (docState) => Array.from(docState.users.values());

const scheduleHashEviction = (docState, hash) => {
  const existingTimer = docState.hashTimers.get(hash);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    docState.recentHashes.delete(hash);
    docState.hashTimers.delete(hash);
  }, UPDATE_HASH_TTL_MS);

  docState.hashTimers.set(hash, timer);
};

const cleanupDocState = (docId, docState) => {
  docState.debouncedSave.cancel();

  docState.hashTimers.forEach((timer) => clearTimeout(timer));
  docState.hashTimers.clear();
  docState.recentHashes.clear();
  docState.users.clear();
  docState.sockets.clear();

  docState.ydoc.destroy();
  docs.delete(docId);
};

const saveDocumentState = async (docId, ydoc) => {
  const binary = Y.encodeStateAsUpdate(ydoc);
  await Document.findByIdAndUpdate(
    docId,
    {
      content: Buffer.from(binary),
      updatedAt: new Date(),
    },
    {
      new: false,
      upsert: false,
    }
  );
};

const initializeDocState = async (docId) => {
  const existingDoc = await Document.findById(docId).select("content").lean();

  if (!existingDoc) {
    throw new Error("Document does not exist.");
  }

  const ydoc = new Y.Doc();

  const persisted = toUint8Array(existingDoc.content);
  if (persisted.byteLength > 0) {
    try {
      Y.applyUpdate(ydoc, persisted, "database");
    } catch (error) {
      console.error(`Failed to restore persisted Yjs state for ${docId}:`, error.message);
    }
  }

  const docState = {
    ydoc,
    sockets: new Set(),
    users: new Map(),
    recentHashes: new Set(),
    hashTimers: new Map(),
    debouncedSave: debounce(async () => {
      try {
        await saveDocumentState(docId, ydoc);
      } catch (error) {
        console.error(`Failed to persist document ${docId}:`, error.message);
      }
    }, 2000),
  };

  docs.set(docId, docState);
  return docState;
};

const ensureDocState = async (docId) => {
  const existing = docs.get(docId);
  if (existing) {
    return existing;
  }

  return initializeDocState(docId);
};

const addSocketToDoc = async (docId, socketId, user) => {
  const docState = await ensureDocState(docId);
  docState.sockets.add(socketId);
  docState.users.set(socketId, normalizeUser(user, socketId));

  return {
    encodedState: Y.encodeStateAsUpdate(docState.ydoc),
    stateVector: Y.encodeStateVector(docState.ydoc),
    users: buildUsersPayload(docState),
  };
};

const addSocketToDocWithDiff = async (docId, socketId, user, clientStateVector) => {
  const docState = await ensureDocState(docId);
  docState.sockets.add(socketId);
  docState.users.set(socketId, normalizeUser(user, socketId));

  const vector = toUint8Array(clientStateVector);
  let update;

  if (vector.byteLength === 0) {
    update = Y.encodeStateAsUpdate(docState.ydoc);
  } else {
    try {
      update = Y.encodeStateAsUpdate(docState.ydoc, vector);
    } catch (_error) {
      // Fall back to full-state sync for stale/malformed vectors from reconnecting clients.
      update = Y.encodeStateAsUpdate(docState.ydoc);
    }
  }

  return {
    update,
    stateVector: Y.encodeStateVector(docState.ydoc),
    users: buildUsersPayload(docState),
  };
};

const removeSocketFromDoc = async (docId, socketId) => {
  const docState = docs.get(docId);
  if (!docState) {
    return [];
  }

  docState.sockets.delete(socketId);
  docState.users.delete(socketId);

  const users = buildUsersPayload(docState);

  if (docState.sockets.size === 0) {
    try {
      await saveDocumentState(docId, docState.ydoc);
    } catch (error) {
      console.error(`Failed final save for ${docId}:`, error.message);
    }

    cleanupDocState(docId, docState);
  }

  return users;
};

const applyIncomingUpdate = async (docId, update, origin) => {
  const docState = await ensureDocState(docId);
  const binary = toUint8Array(update);
  const hash = updateHash(binary);

  if (docState.recentHashes.has(hash)) {
    return false;
  }

  docState.recentHashes.add(hash);
  scheduleHashEviction(docState, hash);

  // Remote updates are merged in CRDT space so operation order never causes data loss.
  Y.applyUpdate(docState.ydoc, binary, origin);
  docState.debouncedSave();

  return true;
};

const applyReplicatedUpdate = async (docId, update) => {
  const docState = docs.get(docId);
  if (!docState) {
    return false;
  }

  const binary = toUint8Array(update);
  const hash = updateHash(binary);

  if (docState.recentHashes.has(hash)) {
    return false;
  }

  docState.recentHashes.add(hash);
  scheduleHashEviction(docState, hash);

  Y.applyUpdate(docState.ydoc, binary, "redis");
  docState.debouncedSave();
  return true;
};

const getEncodedState = async (docId) => {
  const docState = await ensureDocState(docId);
  return Y.encodeStateAsUpdate(docState.ydoc);
};

const getEncodedStateVector = async (docId) => {
  const docState = await ensureDocState(docId);
  return Y.encodeStateVector(docState.ydoc);
};

const hasLoadedDoc = (docId) => docs.has(docId);

module.exports = {
  toUint8Array,
  normalizeUser,
  addSocketToDoc,
  addSocketToDocWithDiff,
  removeSocketFromDoc,
  applyIncomingUpdate,
  applyReplicatedUpdate,
  getEncodedState,
  getEncodedStateVector,
  hasLoadedDoc,
};
