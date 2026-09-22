import mongoose from "mongoose";
import { MONGODB_DB_NAME } from "./constant.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${MONGODB_DB_NAME}`
    );
    console.log(
      `MongoDB connected — host: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
