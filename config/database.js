const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;

    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB Connected Successfully");

    return mongoose.connection;
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    throw err;
  }
};

module.exports = { connectDB };
