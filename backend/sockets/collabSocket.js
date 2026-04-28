const mongoose = require("mongoose");
const Document = require("../models/Document");
const {
  toUint8Array,
  addSocketToDoc,
  addSocketToDocWithDiff,
  removeSocketFromDoc,
  applyIncomingUpdate,
} = require("../utils/docManager");
const {
  getUserDocumentRole,
  canRead,
  canEdit,
} = require("../utils/permissions");
const { createSocketRateLimiter } = require("../utils/socketRateLimiter");

const MAX_UPDATE_BYTES = Number(process.env.MAX_YJS_UPDATE_BYTES || 262144);
const MAX_AWARENESS_BYTES = Number(process.env.MAX_AWARENESS_UPDATE_BYTES || 32768);

const registerCollaborationSocket = (io, { yjsBus } = {}) => {
  const limiter = createSocketRateLimiter();

  io.on("connection", (socket) => {
    const joinedRooms = new Map();

    socket.on("join-room", async (payload = {}, ack = () => undefined) => {
      try {
        if (!limiter.isAllowed(socket.id, "join-room")) {
          return ack({ ok: false, message: "Rate limit exceeded." });
        }

        if (!socket.data?.user?.id) {
          return ack({ ok: false, message: "Unauthorized socket session." });
        }

        const docId = String(payload.docId || "").trim();

        if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
          return ack({ ok: false, message: "Invalid room join request." });
        }

        if (joinedRooms.has(docId)) {
          return ack({ ok: true, message: "Already joined." });
        }

        const doc = await Document.findById(docId, {
          owner: 1,
          collaborators: 1,
        }).lean();

        if (!doc) {
          return ack({ ok: false, message: "Document not found." });
        }

        const role = getUserDocumentRole(doc, socket.data.user.id);
        if (!canRead(role)) {
          return ack({ ok: false, message: "Not allowed to access this document." });
        }

        const userPayload = {
          ...payload.user,
          name: payload.user?.name || socket.data.user.name,
        };

        let update;
        let stateVector;
        let users;

        try {
          ({ update, stateVector, users } = await addSocketToDocWithDiff(
            docId,
            socket.id,
            userPayload,
            payload.stateVector
          ));
        } catch (error) {
          // If a stale or malformed vector is sent, fall back to full-state sync.
          const fallback = await addSocketToDoc(docId, socket.id, userPayload);
          update = fallback.encodedState;
          stateVector = fallback.stateVector;
          users = fallback.users;
          console.warn("join-room diff fallback:", error.message);
        }

        joinedRooms.set(docId, role);
        socket.join(docId);

        return ack({
          ok: true,
          role,
          update: Array.from(update),
          serverStateVector: Array.from(stateVector),
          users,
        });
      } catch (error) {
        console.error("join-room failed:", error.message);
        return ack({ ok: false, message: "Failed to join room." });
      }
    });

    socket.on("leave-room", (payload = {}) => {
      const docId = String(payload.docId || "").trim();
      if (!joinedRooms.has(docId)) {
        return;
      }

      joinedRooms.delete(docId);
      socket.leave(docId);

      removeSocketFromDoc(docId, socket.id)
        .then((users) => {
          io.to(docId).emit("presence-update", {
            docId,
            type: "remove-socket",
            socketId: socket.id,
            users,
          });
        })
        .catch((error) => {
          console.error("leave-room cleanup failed:", error.message);
        });
    });

    socket.on("yjs-update", async (payload = {}) => {
      const docId = String(payload.docId || "").trim();
      const role = joinedRooms.get(docId);
      if (!role) {
        return;
      }

      if (!canEdit(role)) {
        return;
      }

      if (!limiter.isAllowed(socket.id, "yjs-update")) {
        return;
      }

      try {
        const update = toUint8Array(payload.update);
        if (update.byteLength > MAX_UPDATE_BYTES) {
          return;
        }

        const accepted = await applyIncomingUpdate(docId, update, socket.id);

        if (!accepted) {
          return;
        }

        if (yjsBus?.enabled) {
          await yjsBus.publishUpdate(docId, update);
        }

        socket.to(docId).emit("yjs-update", {
          docId,
          update: Array.from(update),
        });
      } catch (error) {
        console.error("yjs-update failed:", error.message);
      }
    });

    socket.on("awareness-update", (payload = {}) => {
      const docId = String(payload.docId || "").trim();
      if (!joinedRooms.has(docId)) {
        return;
      }

      if (!limiter.isAllowed(socket.id, "awareness-update")) {
        return;
      }

      try {
        const update = toUint8Array(payload.update);
        if (update.byteLength > MAX_AWARENESS_BYTES) {
          return;
        }

        socket.to(docId).emit("awareness-update", {
          docId,
          update: Array.from(update),
          socketId: socket.id,
        });
      } catch (error) {
        console.error("awareness-update failed:", error.message);
      }
    });

    socket.on("disconnect", () => {
      joinedRooms.forEach((_role, docId) => {
        removeSocketFromDoc(docId, socket.id)
          .then((users) => {
            io.to(docId).emit("presence-update", {
              docId,
              type: "remove-socket",
              socketId: socket.id,
              users,
            });
          })
          .catch((error) => {
            console.error("disconnect cleanup failed:", error.message);
          });
      });

      joinedRooms.clear();
      limiter.clearSocket(socket.id);
    });
  });
};

module.exports = registerCollaborationSocket;
