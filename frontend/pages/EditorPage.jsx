import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";

import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { fetchDocument } from "../services/api";

const buildColorFromUserId = (userId) => {
  const palette = [
    "#dc2626",
    "#ea580c",
    "#65a30d",
    "#0891b2",
    "#2563eb",
    "#7c3aed",
    "#db2777",
  ];

  let hash = 0;
  const input = String(userId || "anonymous");
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return palette[Math.abs(hash) % palette.length];
};

const EditorPage = () => {
  const { id: docId } = useParams();
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [title, setTitle] = useState("Loading...");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState("");

  const ydoc = useMemo(() => new Y.Doc(), [docId]);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);

  const localUser = useMemo(
    () => ({
      name: user?.name || "Anonymous",
      color: buildColorFromUserId(user?.id),
    }),
    [user]
  );

  const awarenessProvider = useMemo(
    () => ({
      awareness,
      on: () => undefined,
      off: () => undefined,
    }),
    [awareness]
  );

  const joinedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider: awarenessProvider,
        user: localUser,
      }),
    ],
    editorProps: {
      attributes: {
        class: "rounded-2xl border border-slate-300 bg-white px-5 py-4 shadow-sm",
      },
    },
    autofocus: "start",
  });

  useEffect(() => {
    const run = async () => {
      try {
        const metadata = await fetchDocument(docId);
        setTitle(metadata.title);
        setRole(metadata.role || "viewer");
      } catch (apiError) {
        setError(apiError?.response?.data?.message || "Failed to fetch document.");
      }
    };

    run();
  }, [docId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(role !== "viewer");
  }, [editor, role]);

  useEffect(() => {
    awareness.setLocalStateField("user", localUser);

    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness, localUser]);

  useEffect(() => {
    if (!socket || !connected || joinedRef.current) {
      return;
    }

    joinedRef.current = true;

    const onRemoteYjsUpdate = (payload = {}) => {
      if (payload.docId !== docId || !payload.update) {
        return;
      }

      const update = Uint8Array.from(payload.update);
      Y.applyUpdate(ydoc, update, "remote");
    };

    const onRemoteAwarenessUpdate = (payload = {}) => {
      if (payload.docId !== docId || !payload.update) {
        return;
      }

      const update = Uint8Array.from(payload.update);
      applyAwarenessUpdate(awareness, update, "remote");
    };

    const onLocalYjsUpdate = (update, origin) => {
      if (origin === "remote") {
        return;
      }

      socket.emit("yjs-update", {
        docId,
        update: Array.from(update),
      });
    };

    const onLocalAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === "remote") {
        return;
      }

      const changedClients = [...added, ...updated, ...removed];
      if (!changedClients.length) {
        return;
      }

      const update = encodeAwarenessUpdate(awareness, changedClients);
      socket.emit("awareness-update", {
        docId,
        update: Array.from(update),
      });
    };

    socket.on("yjs-update", onRemoteYjsUpdate);
    socket.on("awareness-update", onRemoteAwarenessUpdate);
    ydoc.on("update", onLocalYjsUpdate);
    awareness.on("update", onLocalAwarenessUpdate);

    const clientStateVector = Array.from(Y.encodeStateVector(ydoc));

    socket.emit(
      "join-room",
      {
        docId,
        user: localUser,
        stateVector: clientStateVector,
      },
      (ack = {}) => {
        if (!ack.ok) {
          setError(ack.message || "Failed to join collaboration room.");
          return;
        }

        if (ack.update) {
          Y.applyUpdate(ydoc, Uint8Array.from(ack.update), "remote");
        }

        if (ack.serverStateVector) {
          const joinedRole = ack.role || role;
          const missingOnServer = Y.encodeStateAsUpdate(
            ydoc,
            Uint8Array.from(ack.serverStateVector)
          );

          if (missingOnServer.length > 0 && joinedRole !== "viewer") {
            socket.emit("yjs-update", {
              docId,
              update: Array.from(missingOnServer),
            });
          }
        }

        if (ack.role) {
          setRole(ack.role);
        }
      }
    );

    return () => {
      joinedRef.current = false;
      awareness.off("update", onLocalAwarenessUpdate);
      ydoc.off("update", onLocalYjsUpdate);
      socket.off("awareness-update", onRemoteAwarenessUpdate);
      socket.off("yjs-update", onRemoteYjsUpdate);
      socket.emit("leave-room", { docId });
    };
  }, [socket, connected, docId, ydoc, awareness, localUser]);

  useEffect(() => {
    return () => {
      awareness.destroy();
      ydoc.destroy();
    };
  }, [awareness, ydoc]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/documents" className="text-sm font-medium text-sky-700">
            Back to documents
          </Link>
          <h1 className="mt-1 font-heading text-2xl text-slate-900">{title}</h1>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
          {connected ? "Socket connected" : "Socket reconnecting"} | role: {role}
        </div>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <section className="min-h-[520px] rounded-2xl bg-white/70 p-4">
        <EditorContent editor={editor} />
      </section>
    </main>
  );
};

export default EditorPage;
