const Redis = require("ioredis");
const { createAdapter } = require("@socket.io/redis-adapter");

const YJS_CHANNEL = process.env.YJS_REDIS_CHANNEL || "collab:yjs:update";

const shouldUseRedis = () =>
  String(process.env.ENABLE_REDIS || "false").toLowerCase() === "true";

const createRedisClient = (label) => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(`Missing REDIS_URL while redis is enabled (${label}).`);
  }

  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
};

const setupSocketRedisAdapter = async (io) => {
  if (!shouldUseRedis()) {
    return {
      enabled: false,
      close: async () => undefined,
    };
  }

  const pubClient = createRedisClient("socket-pub");
  const subClient = pubClient.duplicate();

  await pubClient.connect();
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));

  return {
    enabled: true,
    close: async () => {
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
};

const createYjsRedisBus = async (onUpdate) => {
  if (!shouldUseRedis()) {
    return {
      enabled: false,
      publishUpdate: async () => undefined,
      close: async () => undefined,
    };
  }

  const serverId = process.env.SERVER_ID || `${process.pid}`;
  const publisher = createRedisClient("yjs-publisher");
  const subscriber = createRedisClient("yjs-subscriber");

  await publisher.connect();
  await subscriber.connect();

  await subscriber.subscribe(YJS_CHANNEL, async (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.serverId === serverId) {
        return;
      }

      if (!parsed.docId || !parsed.updateBase64) {
        return;
      }

      const update = Uint8Array.from(Buffer.from(parsed.updateBase64, "base64"));
      await onUpdate(parsed.docId, update);
    } catch (error) {
      console.error("Failed to apply replicated Yjs update:", error.message);
    }
  });

  return {
    enabled: true,
    publishUpdate: async (docId, update) => {
      const payload = {
        serverId,
        docId,
        updateBase64: Buffer.from(update).toString("base64"),
      };

      await publisher.publish(YJS_CHANNEL, JSON.stringify(payload));
    },
    close: async () => {
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    },
  };
};

module.exports = {
  shouldUseRedis,
  setupSocketRedisAdapter,
  createYjsRedisBus,
};
