import mongoose from "mongoose";

function connect() {
  return mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("✅ Connected to MongoDB");
      return true;
    })
    .catch((err) => {
      console.error("❌ MongoDB Connection Error:", err.message);
      // Try to reconnect after 5 seconds
      setTimeout(connect, 5000);
      return false;
    });
}

export default connect;
