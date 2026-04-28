const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const connectDB = require("../../utils/db");
const { createConfiguredServer } = require("../../app");

const createTestServer = async () => {
  const mongo = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.ENABLE_REDIS = "false";

  await connectDB();

  const bundle = await createConfiguredServer();

  return {
    ...bundle,
    mongo,
    closeAll: async () => {
      await bundle.close();
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
};

module.exports = {
  createTestServer,
};
