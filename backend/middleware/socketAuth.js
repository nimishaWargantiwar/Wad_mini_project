const { verifyAccessToken } = require("../utils/jwt");

const extractSocketToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const rawHeader = socket.handshake?.headers?.authorization;
  if (typeof rawHeader === "string") {
    const [scheme, token] = rawHeader.split(" ");
    if (scheme === "Bearer" && token) {
      return token;
    }
  }

  return null;
};

const socketAuthMiddleware = (socket, next) => {
  try {
    const token = extractSocketToken(socket);
    if (!token) {
      return next(new Error("Unauthorized socket: missing token"));
    }

    const decoded = verifyAccessToken(token);
    socket.data.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
    };

    return next();
  } catch (_error) {
    return next(new Error("Unauthorized socket: invalid token"));
  }
};

module.exports = socketAuthMiddleware;
