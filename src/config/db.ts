import mongoose from "mongoose";
import env from "@/config/env";
import dns from "dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

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
