const { verifyAccessToken } = require("../utils/jwt");

const extractToken = (headerValue) => {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const requireAuth = (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = verifyAccessToken(token);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = requireAuth;
