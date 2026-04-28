const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const registerCollaborationSocket = require("./sockets/collabSocket");
const socketAuthMiddleware = require("./middleware/socketAuth");
const { applyHttpSecurity, createAuthRateLimit } = require("./middleware/httpSecurity");
const { setupSocketRedisAdapter, createYjsRedisBus } = require("./utils/redis");
const { applyReplicatedUpdate } = require("./utils/docManager");

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CLIENT_ORIGIN || "http://localhost:5173";

  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const createConfiguredServer = async () => {
  const app = express();
  const server = http.createServer(app);

  const allowedOrigins = parseAllowedOrigins();
  const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);

  app.set("trust proxy", 1);
  applyHttpSecurity(app);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Not allowed by CORS"));
      },
      credentials: false,
    })
  );
  app.use(express.json({ limit: process.env.MAX_JSON_BODY || "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", createAuthRateLimit(), authRoutes);
  app.use("/documents", documentRoutes);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback("Origin not allowed", false);
      },
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.use(socketAuthMiddleware);

  const redisAdapter = await setupSocketRedisAdapter(io);
  const yjsBus = await createYjsRedisBus(async (docId, update) => {
    await applyReplicatedUpdate(docId, update);
  });

  registerCollaborationSocket(io, { yjsBus });

  const close = async () => {
    const closeServerSafely =
      typeof server.listening === "boolean" && server.listening
        ? new Promise((resolve) => server.close(() => resolve()))
        : Promise.resolve();

    await Promise.allSettled([
      redisAdapter.close(),
      yjsBus.close(),
      new Promise((resolve) => io.close(() => resolve())),
      closeServerSafely,
    ]);
  };

  return {
    app,
    server,
    io,
    close,
  };
};

module.exports = {
  createConfiguredServer,
};
