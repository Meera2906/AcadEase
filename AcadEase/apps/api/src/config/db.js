import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set. Copy .env.example to .env and fill it in.");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);

  const { host, name } = mongoose.connection;
  console.log(`[db] connected -> host=${host} db=${name}`);

  mongoose.connection.on("error", (err) => {
    console.error("[db] connection error:", err.message);
  });
}

export default connectDB;
