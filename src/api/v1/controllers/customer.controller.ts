import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Customer } from "@/api/v1/models/customer.model";
import { Booking } from "@/api/v1/models/booking.model";
import { CheckIn } from "@/api/v1/models/checkin.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE CUSTOMER
// ==========================================
export const createCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, phone, email, address, alternatePhone, altPhone, identityProof, idProof, preferences, customerCategory, companyName, companyGST, loyaltyTier, membershipTier, internalNotes } = req.body;

    const existingCustomer = await Customer.findOne({ phone, isActive: true }).session(session);
    if (existingCustomer) {
      throw new Error(`Customer with phone number ${phone} already exists`);
    }

    // Resolve fields/aliases
    const customerPayload = {
      name: name || req.body.fullName,
      phone,
      email,
      address: typeof address === "string" ? address : undefined,
      alternatePhone: alternatePhone || altPhone,
      identityProof: identityProof || (idProof ? {
        idType: idProof.type,
        idNumber: idProof.number,
        document: idProof.documentUrl ? { public_id: "", secure_url: idProof.documentUrl } : undefined
      } : undefined),
      preferences,
      customerCategory,
      companyName,
      companyGST,
      loyaltyTier: loyaltyTier || membershipTier,
      internalNotes,
    };

    const newCustomer = new Customer(customerPayload);
    await newCustomer.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Customer profile created successfully",
      newCustomer
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL CUSTOMER profiles (paginated + search)
// ==========================================
export const getAllCustomers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { query = "", page = "1", limit = "20" } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = Math.min(parseInt(limit as string, 10), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const filter: any = { isActive: true };

    if (query) {
      const searchRegex = new RegExp(query as string, "i");
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { customerId: searchRegex }
      ];
    }

    const [customers, totalCount] = await Promise.all([
      Customer.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNumber },
        {
          $lookup: {
            from: "bookings",
            let: { custId: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
              { $sort: { createdAt: -1 } }
            ],
            as: "bookings"
          }
        },
        {
          $addFields: {
            totalRevenue: { $sum: "$bookings.pricingSummary.grandTotal" },
            lastStayDate: { $arrayElemAt: ["$bookings.overallCheckInDate", 0] },
            lastStayType: { $arrayElemAt: ["$bookings.bookingCategory", 0] },
            lastBookingStatus: { $arrayElemAt: ["$bookings.status", 0] },
            bookingCount: { $size: "$bookings" }
          }
        },
        {
          $project: {
            bookings: 0 // Omit the large array of bookings
          }
        }
      ]),
      Customer.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    return httpResponse(req, res, 200, "Customers fetched successfully", {
      customers,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      }
    });
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET CUSTOMER BY ID (with histories)
// ==========================================
export const getCustomerById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findOne({ _id: id, isActive: true });
    if (!customer) {
      throw new Error("Customer profile not found");
    }

    // Retrieve booking and checkin history
    const bookings = await Booking.find({ customerId: id }).sort({ createdAt: -1 });
    const bookingIds = bookings.map(b => b._id);
    const checkins = await CheckIn.find({ bookingId: { $in: bookingIds } }).sort({ checkInTime: -1 });

    const customerData = {
      ...customer.toObject(),
      history: {
        bookings,
        checkins,
      }
    };

    return httpResponse(req, res, 200, "Customer profile retrieved successfully", customerData);
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE CUSTOMER
// ==========================================
export const updateCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updatePayload = req.body;

    const customer = await Customer.findOne({ _id: id, isActive: true }).session(session);
    if (!customer) {
      throw new Error("Customer profile not found");
    }

    if (updatePayload.phone) {
      const existingCustomer = await Customer.findOne({ phone: updatePayload.phone, isActive: true }).session(session);
      if (existingCustomer && existingCustomer._id.toString() !== id) {
        throw new Error(`Another customer already has phone number ${updatePayload.phone}`);
      }
    }

    // Map aliases
    if (updatePayload.fullName && !updatePayload.name) {
      updatePayload.name = updatePayload.fullName;
    }
    if (updatePayload.altPhone && !updatePayload.alternatePhone) {
      updatePayload.alternatePhone = updatePayload.altPhone;
    }
    if (updatePayload.membershipTier && !updatePayload.loyaltyTier) {
      updatePayload.loyaltyTier = updatePayload.membershipTier;
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();

    return httpResponse(req, res, 200, "Customer profile updated successfully", updatedCustomer);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE CUSTOMER (Soft Delete)
// ==========================================
export const deleteCustomer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const customer = await Customer.findOneAndUpdate(
      { _id: id, isActive: true },
      { isActive: false },
      { new: true, session }
    );

    if (!customer) {
      throw new Error("Customer profile not found");
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Customer profile soft-deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};
