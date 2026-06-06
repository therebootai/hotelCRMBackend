import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import fileUpload from "express-fileupload";

import env from "@/config/env";
import { connectDB } from "@/config/db";
import { gracefullyShutdown } from "@/config/server";
// import { type tHttpError } from "@/api/v1/interfaces/http";
import { responseMessage } from "@/constant";
import { httpError } from "@/api/v1/utils/httpError";
import { globalErrorHandler } from "@/api/v1/middlewares/globarErrorHandler.middleware";
import httpResponse from "@/api/v1/utils/httpResponse";

import userRoutes from "@/api/v1/routes/user.route";
import roomTypeRoutes from "@/api/v1/routes/roomType.route";
import taxGstRoutes from "@/api/v1/routes/taxGst.route";
import amenityRoutes from "@/api/v1/routes/amenity.route";
import roomRoutes from "@/api/v1/routes/room.route";
import pricingRuleRoutes from "@/api/v1/routes/pricingRule.route";
import bookingRoutes from "@/api/v1/routes/booking.route";
import checkinRoutes from "@/api/v1/routes/checkin.route";
import facilityRoutes from "@/api/v1/routes/facility.route";
import extraServiceRoute from "@/api/v1/routes/extraService.route";
import billingRoute from "@/api/v1/routes/billing.route";
import accessPackageRoutes from "@/api/v1/routes/accessPackage.route";
import customerRoutes from "@/api/v1/routes/customer.route";
import notificationRoutes from "./api/v1/routes/notification.route";
import reportingRoutes from "./api/v1/routes/reporting.route";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "https://hotelcrmproto.netlify.app",
        "https://gallamart.com",
      ];
      if (
        !origin ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes ---
app.get("/", (req, res) => {
  return httpResponse(req, res, 200, "Server is running");
});

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/room-types", roomTypeRoutes);
app.use("/api/v1/tax-gst", taxGstRoutes);
app.use("/api/v1/amenities", amenityRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/pricing-rules", pricingRuleRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/checkin", checkinRoutes);
app.use("/api/v1/facilities", facilityRoutes);
app.use("/api/v1/extra-services", extraServiceRoute);
app.use("/api/v1/billing", billingRoute);
app.use("/api/v1/access-packages", accessPackageRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/reports", reportingRoutes);

//404 handller
app.use((req: Request, _: Response, next: NextFunction) => {
  try {
    throw new Error(responseMessage.NOT_FOUND("Route"));
  } catch (error) {
    httpError(next, error, req, 404);
  }
});

//global error handler
app.use(globalErrorHandler);

import { seedRBAC } from "./api/v1/utils/rbacSeed";

const startServer = async () => {
  await connectDB();
  await seedRBAC();

  const server = app.listen(env.PORT, () => {
    console.log(`[✔] Server running on port ${env.PORT} in ${env.ENV} mode`);
  });

  process.on("SIGINT", () => gracefullyShutdown(server, mongoose));
  process.on("SIGTERM", () => gracefullyShutdown(server, mongoose));

  process.on("uncaughtException", (error) => {
    console.error("[✖] Uncaught Exception:", error);
    gracefullyShutdown(server, mongoose);
  });
};

startServer();
