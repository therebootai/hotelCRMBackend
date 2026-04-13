import type { Server } from "http";
import type { Mongoose } from "mongoose";

export const gracefullyShutdown = async (
  server: Server | null,
  db: Mongoose | null,
) => {
  console.log("\n[•] Gracefully shutting down server...");

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          console.log("[✔] HTTP server closed");
          resolve();
        });
      });
    }

    if (db) {
      await db.connection.close();
      console.log("[✔] Database connection closed");
    }

    console.log("[✔] Server gracefully shutdown.");
    process.exit(0);
  } catch (error) {
    console.error("[✖] Error during shutdown:", error);
    process.exit(1);
  }
};
