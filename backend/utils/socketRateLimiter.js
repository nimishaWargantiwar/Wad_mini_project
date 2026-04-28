const DEFAULT_WINDOW_MS = Number(process.env.SOCKET_RATE_WINDOW_MS || 10000);
const DEFAULT_MAX_EVENTS = Number(process.env.SOCKET_RATE_MAX_EVENTS || 120);

const createSocketRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  maxEvents = DEFAULT_MAX_EVENTS,
} = {}) => {
  const counters = new Map();

  const isAllowed = (socketId, eventName) => {
    const now = Date.now();
    const key = `${socketId}:${eventName}`;
    const existing = counters.get(key);

    if (!existing || now > existing.resetAt) {
      counters.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (existing.count >= maxEvents) {
      return false;
    }

    existing.count += 1;
    return true;
  };

  const clearSocket = (socketId) => {
    Array.from(counters.keys()).forEach((key) => {
      if (key.startsWith(`${socketId}:`)) {
        counters.delete(key);
      }
    });
  };

  return {
    isAllowed,
    clearSocket,
  };
};

module.exports = {
  createSocketRateLimiter,
};
