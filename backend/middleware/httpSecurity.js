const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const createGeneralRateLimit = () =>
  rateLimit({
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.API_RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, slow down." },
  });

const createAuthRateLimit = () =>
  rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many auth requests, try again later." },
  });

const applyHttpSecurity = (app) => {
  app.use(helmet());
  app.use(createGeneralRateLimit());
};

module.exports = {
  applyHttpSecurity,
  createAuthRateLimit,
};
