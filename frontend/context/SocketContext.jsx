import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const resolveSocketUrl = () => {
  const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (configuredSocketUrl && configuredSocketUrl.trim()) {
    return configuredSocketUrl.trim();
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:5000";
};

export const SocketProvider = ({ token, children }) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(resolveSocketUrl(), {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
      autoConnect: true,
      auth: {
        token,
      },
    });

    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
    }),
    [connected]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};
