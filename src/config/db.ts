import mongoose from "mongoose";
import env from "@/config/env";


export const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI!);
    mongoose.set("strictPopulate", false);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error instanceof Error ? error.message : "MongoDB connection failed:",
    );
  }
};