const dotenv = require("dotenv");

const connectDB = require("./utils/db");
const { createConfiguredServer } = require("./app");

dotenv.config();

const port = Number(process.env.PORT || 5000);

const start = async () => {
  try {
    await connectDB();

    const { server } = await createConfiguredServer();

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Startup failure:", error.message);
    process.exit(1);
  }
};

start();
