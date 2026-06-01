import { Response } from "express";
import { type AuthRequest } from "../interfaces/auth";
import {
  getOccupancyReport,
  getRevenueReport,
  getBookingAnalytics,
  getDueAgingReport,
  getCustomerAnalytics,
  getGSTSummary,
} from "../services/reporting.service";
import httpResponse from "../utils/httpResponse";
import { httpError } from "../utils/httpError";

export const getOccupancyStats = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to dates are required" });
    }

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);

    const data = await getOccupancyReport(startDate, endDate);
    
    res.setHeader("Cache-Control", "private, max-age=60");
    return httpResponse(req, res, 200, "Occupancy report generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const getRevenueStats = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to dates are required" });
    }

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);

    const data = await getRevenueReport(startDate, endDate);

    res.setHeader("Cache-Control", "private, max-age=60");
    return httpResponse(req, res, 200, "Revenue report generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const getBookingStats = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to dates are required" });
    }

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);

    const data = await getBookingAnalytics(startDate, endDate);

    res.setHeader("Cache-Control", "private, max-age=60");
    return httpResponse(req, res, 200, "Booking analytics generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const getDueAgingStats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDueAgingReport();

    res.setHeader("Cache-Control", "private, max-age=60");
    return httpResponse(req, res, 200, "Due aging report generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const getCustomerStats = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const startDate = from ? new Date(from as string) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const endDate = to ? new Date(to as string) : new Date();

    const data = await getCustomerAnalytics(startDate, endDate);

    res.setHeader("Cache-Control", "private, max-age=60");
    return httpResponse(req, res, 200, "Customer analytics generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const getGstSummaryStats = async (req: AuthRequest, res: Response) => {
  try {
    const { period } = req.query;
    if (!period) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const data = await getGSTSummary(`${y}-${m}`);
      res.setHeader("Cache-Control", "private, max-age=300");
      return httpResponse(req, res, 200, "GST summary generated successfully", data);
    }

    const data = await getGSTSummary(period as string);

    res.setHeader("Cache-Control", "private, max-age=300");
    return httpResponse(req, res, 200, "GST summary generated successfully", data);
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};
