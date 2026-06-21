import { Request, Response } from "express";
import mongoose from "mongoose";
import { differenceInCalendarDays, differenceInDays, eachDayOfInterval, startOfDay } from "date-fns";

import { Customer, ICustomer } from "../models/customer.model";
import { Booking, IBooking, IBookedRoom } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { Billing, IBilling } from "../models/billing.model";
import { Room } from "../models/room.model";
import { RoomType } from "../models/roomType.model";
import { Amenity } from "../models/amenity.model";
import { PricingRule } from "../models/pricingRule.model";
import DayAccessPackage from "../models/accessPackage.model";
import { transitionBookingState } from "../services/bookingStateMachine.service";
import { recordCharge, recordPayment, recordRefund } from "../services/paymentLedger.service";
import { recordGstEntry } from "../services/gstLedger.service";
import { sendNotificationToRole, createNotification } from "../services/notification.service";
import { TaxGst } from "../models/taxGst.model";
import { waBridgeService } from "../services/wabridge.service";
import puppeteer from "puppeteer";
import { emailService } from "../services/email.service";
import { buildReceiptHtml } from "../../../utils/receiptHtmlBuilder";
import { PricingService } from "../services/pricing.service";

interface IRoomAvailabilitySearch {
  checkInDate: Date;
  checkOutDate: Date;
  adults?: number;
  children?: number;
  roomType?: mongoose.Types.ObjectId;
  amenities?: mongoose.Types.ObjectId[];
  priceRange?: { min?: number; max?: number };
  bedType?: string;
  smokingRoom?: boolean;
  highFloor?: boolean;
  nearLift?: boolean;
}

interface IPricingBreakdown {
  date: Date;
  basePrice: number;
  rulePrice?: number;
  finalPrice: number;
  isOverridden: boolean;
}

interface IRoomPricing {
  roomId: string;
  roomNumber: string;
  roomType: string;
  roomTypeId: mongoose.Types.ObjectId;
  basePrice: number;
  nightlyBreakdown: IPricingBreakdown[];
  totalNights: number;
  totalPrice: number;
  amenities: { _id: mongoose.Types.ObjectId; name: string; icon: string }[];
}

interface IAvailabilityResult {
  room: any;
  roomType: any;
  amenities: any[];
  pricing: IRoomPricing;
  isAvailable: boolean;
  unavailableReason?: string;
}

interface IPopulatedRoomType {
  _id: mongoose.Types.ObjectId;
  basePrice: number;
  name?: string;
}


export const checkRoomAvailability = async (
  roomId: mongoose.Types.ObjectId,
  checkInDate: Date,
  checkOutDate: Date,
  excludeBookingId?: mongoose.Types.ObjectId
): Promise<{ isAvailable: boolean; reason?: string }> => {
  const room = await Room.findById(roomId);
  if (!room) {
    return { isAvailable: false, reason: "Room not found" };
  }

  if (room.status === "Maintenance") {
    return { isAvailable: false, reason: "Room is under maintenance" };
  }
  if (room.status === "Blocked") {
    return { isAvailable: false, reason: "Room is blocked" };
  }

  const now = new Date();
  const bookingQuery: any = {
    status: { $in: ["Confirmed", "Checked-In"] },
    rooms: {
      $elemMatch: {
        roomId: new mongoose.Types.ObjectId(roomId as any),
        checkInDate: { $lt: checkOutDate },
        checkOutDate: { $gt: checkInDate },
      },
    },
  };

  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }

  const conflictingBooking = await Booking.findOne(bookingQuery);
  if (conflictingBooking) {
    return { isAvailable: false, reason: "Room is already booked for these dates" };
  }

  const conflictingCheckIn = await CheckIn.findOne({
    status: "Active",
    "roomDetails.roomId": roomId,
    $or: [
      {
        checkInTime: { $lt: checkOutDate },
        expectedCheckOutTime: { $gt: checkInDate },
      },
    ],
  });

  if (conflictingCheckIn) {
    return { isAvailable: false, reason: "Room is currently occupied" };
  }

  return { isAvailable: true };
};

export const checkRoomTypeAvailability = async (
  roomTypeId: mongoose.Types.ObjectId,
  checkInDate: Date,
  checkOutDate: Date,
  requestedCount: number,
  excludeBookingId?: mongoose.Types.ObjectId
): Promise<{ isAvailable: boolean; availableCount: number; reason?: string }> => {
  const totalRooms = await Room.countDocuments({
    roomType: roomTypeId,
    status: { $nin: ["Maintenance", "Blocked"] },
  });

  if (totalRooms === 0) {
    return { isAvailable: false, availableCount: 0, reason: "No bookable rooms of this type exist" };
  }

  const now = new Date();
  const matchStage: any = {
    status: { $in: ["Confirmed", "Checked-In"] },
  };
  if (excludeBookingId) {
    matchStage._id = { $ne: excludeBookingId };
  }

  const bookedResult = await Booking.aggregate([
    { $match: matchStage },
    { $unwind: "$rooms" },
    {
      $match: {
        "rooms.roomType": new mongoose.Types.ObjectId(roomTypeId),
        "rooms.checkInDate": { $lt: checkOutDate },
        "rooms.checkOutDate": { $gt: checkInDate },
      },
    },
    { $count: "count" },
  ]);

  const checkInResult = await CheckIn.aggregate([
    {
      $match: {
        status: "Active",
        bookingId: { $exists: false },
        "roomDetails.roomType": new mongoose.Types.ObjectId(roomTypeId),
        $or: [
          {
            checkInTime: { $lt: checkOutDate },
            expectedCheckOutTime: { $gt: checkInDate },
          },
        ],
      },
    },
    { $count: "count" },
  ]);
  const activeCheckInCount = (checkInResult[0]?.count as number | undefined) ?? 0;

  const bookedCount = (bookedResult[0]?.count as number | undefined) ?? 0;
  const availableCount = Math.max(0, totalRooms - bookedCount - activeCheckInCount);

  if (requestedCount > availableCount) {
    return {
      isAvailable: false,
      availableCount,
      reason: `Only ${availableCount} room(s) available for the selected dates (${requestedCount} requested)`,
    };
  }

  return { isAvailable: true, availableCount };
};

export const getRoomTypeAvailableCount = async (req: Request, res: Response) => {
  try {
    const { roomTypeId, checkIn, checkOut } = req.query as {
      roomTypeId?: string;
      checkIn?: string;
      checkOut?: string;
    };
    if (!roomTypeId || !checkIn || !checkOut) {
      return res.status(400).json({ success: false, message: "roomTypeId, checkIn, checkOut are required" });
    }

    const result = await checkRoomTypeAvailability(
      new mongoose.Types.ObjectId(roomTypeId),
      new Date(checkIn),
      new Date(checkOut),
      0
    );

    return res.json({
      success: true,
      data: { availableCount: result.availableCount },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// calculateDateWisePricing moved to PricingService


export const createOrUpdateBilling = async (
  bookingId: mongoose.Types.ObjectId,
  customerId: mongoose.Types.ObjectId,
  rooms: IBookedRoom[],
  checkInDate: Date,
  checkOutDate: Date,
  paymentAmount?: number,
  paymentMode?: string,
  userId?: mongoose.Types.ObjectId,
  bookingCategory?: string,
  packageId?: mongoose.Types.ObjectId,
  packageName?: string,
  packageType?: string,
  packageRate?: number,
  quantity?: number,
  taxPercentageArg?: number,
  addonsArg?: any[],
  paymentRemarks?: string,
  opts?: { session?: mongoose.ClientSession }
): Promise<IBilling> => {
  const session = opts?.session;
  // Check if billing already exists for this booking
  let billing = await Billing.findOne({ bookingId }).session(session || null);

  let subTotal = 0;
  let roomChargesBreakdown: any[] = [];
  let totalRoomCharges = 0;
  let packageCharges: any[] = [];

  if (bookingCategory === "Day Access" && packageId) {
    const rate = packageRate || 0;
    const qty = quantity || 1;
    const total = rate * qty;
    subTotal = total;
    packageCharges = [{
      packageId,
      packageName: packageName || "Day Access Package",
      packageType: packageType || "Premium Combo",
      quantity: qty,
      rate,
      total,
    }];
  } else {
    // Calculate room charges breakdown
    roomChargesBreakdown = await Promise.all(
      rooms.map(async (room) => {
        let roomName = "";
        let roomTypeName = "";
        let totalPrice = 0;
        let nights = 1;
        let finalRate = room.pricePerNight || 0;

        const checkIn = new Date(room.checkInDate);
        const checkOut = new Date(room.checkOutDate);
        nights = differenceInCalendarDays(checkOut, checkIn) || 1;

        if (room.roomId) {
          const roomInfo = await Room.findById(room.roomId).populate("roomType", "name basePrice discountPercentage");
          roomName = roomInfo?.roomNumber || "";
          roomTypeName = (roomInfo?.roomType as any)?.name || "";
          
          const pricing = await PricingService.calculateDateWisePricing(
            room.roomId!,
            checkIn,
            checkOut,
            (roomInfo?.roomType as any)?.basePrice || 0,
            (roomInfo?.roomType as any)?.discountPercentage || 0
          );
          totalPrice = pricing.totalPrice;
          finalRate = pricing.nightlyBreakdown[0]?.finalPrice || finalRate;
        } else {
          // If room is not yet assigned, calculate based on passed pricePerNight
          if (room.roomType) {
            const rt = await mongoose.model("RoomType").findById(room.roomType);
            roomTypeName = (rt as any)?.name || "";
          }
          totalPrice = finalRate * nights;
        }

        // Extra bed charge calculation
        const extraBedCharge = room.hasExtraBed ? (room.extraBedCharge || 0) * nights : 0;
        const totalRoomCharge = totalPrice + extraBedCharge;

        return {
          roomId: room.roomId,
          roomNumber: roomName,
          roomType: roomTypeName,
          checkInDate: room.checkInDate,
          checkOutDate: room.checkOutDate,
          nights,
          ratePerNight: finalRate,
          totalRoomCharge,
          extraBedCharge,
          hasExtraBed: room.hasExtraBed || false,
          stayType: "Original" as const,
        };
      })
    );

    totalRoomCharges = roomChargesBreakdown.reduce((sum, r) => sum + r.totalRoomCharge, 0);
    subTotal = totalRoomCharges;
  }

  let extraServices: any[] = [];
  let addonsTotal = 0;
  let serviceTaxAmount = 0;
  if (addonsArg && addonsArg.length > 0) {
    extraServices = addonsArg.map((a: any) => {
      const aTaxPercentage = Number(a.taxPercentage) || 0;
      const taxAmt = (Number(a.total) * aTaxPercentage) / 100;
      serviceTaxAmount += taxAmt;
      return {
        serviceId: a.serviceId,
        serviceName: a.serviceName || a.name,
        quantity: a.quantity,
        rate: a.rate,
        total: a.total,
        taxPercentage: aTaxPercentage,
        taxAmount: taxAmt,
        date: new Date(),
      };
    });
    addonsTotal = extraServices.reduce((sum, a) => sum + (Number(a.total) || 0), 0);
  }

  subTotal += addonsTotal;

  const roomTaxPercentage = taxPercentageArg ?? 12; // Use passed taxPercentage or default 12%
  const roomTaxAmount = ((bookingCategory === "Day Access" ? subTotal : totalRoomCharges) * roomTaxPercentage) / 100;
  const taxAmount = roomTaxAmount + serviceTaxAmount;
  
  const grandTotal = subTotal + taxAmount;
  const paidAmount = paymentAmount || 0;
  const dueAmount = Math.max(0, grandTotal - paidAmount);

  const paymentStatus = dueAmount <= 0 ? "Paid" : paidAmount > 0 ? "Partial" : "Unpaid";

  const billingPayload: any = {
    invoiceType: bookingCategory === "Day Access" ? "Day Access" : "Room",
    billingStatus: "Draft",
    settlementStatus: dueAmount <= 0 ? "Settled" : "Open",
    bookingId,
    customerId,
    roomChargesBreakdown,
    totalRoomCharges,
    packageCharges,
    extraServices,
    subTotal,
    taxBreakdown: {
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      serviceCharge: 0,
      cess: 0,
      totalTax: taxAmount,
    },
    taxPercentage: roomTaxPercentage,
    grandTotal,
    paidAmount,
    dueAmount,
    paymentStatus,
    paymentModeSummary: paymentMode
      ? {
          cash: paymentMode === "Cash" ? paidAmount : 0,
          upi: paymentMode === "UPI" ? paidAmount : 0,
          card: paymentMode === "Card" ? paidAmount : 0,
          bankTransfer: paymentMode === "Bank Transfer" ? paidAmount : 0,
          wallet: paymentMode === "Wallet" ? paidAmount : 0,
        }
      : { cash: 0, upi: 0, card: 0, bankTransfer: 0, wallet: 0 },
    payments: paymentAmount
      ? [
          {
            amount: paymentAmount,
            paymentMode: paymentMode || "Cash",
            paidAt: new Date(),
            note: paymentRemarks || "Advance payment at booking",
          },
        ]
      : [],
  };

  const isNew = !billing;
  if (isNew) {
    const count = await Billing.countDocuments().session(session || null);
    billingPayload.invoiceNumber = `INV-${Date.now()}-${count + 1}`;
    billingPayload.generatedBy = userId;
    billingPayload.generatedAt = new Date();
    billing = new Billing(billingPayload);
  } else {
    // Update existing billing
    Object.assign(billing, billingPayload);
  }

  await billing.save({ session });

  const operatorId = userId || new mongoose.Types.ObjectId();
  if (isNew) {
    await recordCharge(billing._id, bookingId, grandTotal, operatorId, { session });
  }

  if (paymentAmount && paymentAmount > 0) {
    await recordPayment(
      billing._id,
      bookingId,
      paymentAmount,
      (paymentMode || "Cash") as any,
      paymentRemarks || "Booking Advance",
      operatorId,
      "Advance payment at booking",
      { session }
    );
  }

  const customer = await Customer.findById(customerId).session(session || null);
  const { GstLedger } = await import("../models/gstLedger.model");
  const existingGstEntry = await GstLedger.findOne({ billingId: billing._id }).session(session || null);

  if (!existingGstEntry) {
    await recordGstEntry(billing, customer ? customer.name : "Guest", customer ? customer.companyGST : undefined, { session });
  }

  return billing;
};


// calculateBookingTotals moved to PricingService


export const getAvailableRooms = async (req: Request, res: Response) => {
  try {
    const {
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      roomType,
      amenities,
      minPrice,
      maxPrice,
      bedType,
      smokingRoom,
      highFloor,
      nearLift,
      floor,
      excludeBookingId,
    } = req.query;

    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: "checkIn and checkOut dates are required",
      });
    }

    const checkInDate = new Date(checkIn as string);
    const checkOutDate = new Date(checkOut as string);

    // Build room filter query
    const roomFilter: any = {
      status: "Active", // Only active rooms
    };

    if (roomType) {
      roomFilter.roomType = new mongoose.Types.ObjectId(roomType as string);
    }

    if (floor) {
      roomFilter.floor = floor;
    }

    // Capacity filtering
    if (adults) {
      roomFilter.maxAdults = { $gte: Number(adults) };
    }
    if (children) {
      roomFilter.maxChildren = { $gte: Number(children) };
    }

    // Amenity filtering
    if (amenities) {
      const amenityList = (amenities as string).split(",");
      roomFilter.amenities = { $all: amenityList.map((a) => new mongoose.Types.ObjectId(a)) };
    }

    // Fetch all matching rooms
    let rooms = await Room.find(roomFilter)
      .populate("roomType", "name description basePrice discountPercentage")
      .populate("amenities", "name icon")
      .lean();

    // Apply preference filters
    if (smokingRoom === "true") {
      rooms = rooms.filter((r: any) => r.smokingAllowed === true);
    }
    if (highFloor === "true") {
      // Filter high floors (assuming floor number is stored)
      rooms = rooms.filter((r: any) => {
        const floorNum = parseInt(r.floor || "0");
        return floorNum >= 3;
      });
    }
    if (nearLift === "true") {
      rooms = rooms.filter((r: any) => r.nearLift === true);
    }

    // Pre-compute type-level available counts once per unique room type
    const roomTypeIds = [...new Set(rooms.map((r: any) => r.roomType?._id?.toString()).filter(Boolean))];
    const typeAvailMap = new Map<string, number>();
    await Promise.all(
      roomTypeIds.map(async (rtId: string) => {
        const ta = await checkRoomTypeAvailability(
          new mongoose.Types.ObjectId(rtId),
          checkInDate,
          checkOutDate,
          0,
          excludeBookingId ? new mongoose.Types.ObjectId(excludeBookingId as string) : undefined
        );
        typeAvailMap.set(rtId, ta.availableCount);
      })
    );

    // Calculate availability and pricing for each room
    const availabilityResults: IAvailabilityResult[] = await Promise.all(
      rooms.map(async (room: any) => {
        // Check room-specific availability (specific-roomId conflicts)
        const availability = await checkRoomAvailability(
          room._id,
          checkInDate,
          checkOutDate,
          excludeBookingId ? new mongoose.Types.ObjectId(excludeBookingId as string) : undefined
        );

        // Also enforce type-level slot count (catches type-based bookings with no roomId)
        const typeAvailCount = typeAvailMap.get(room.roomType?._id?.toString()) ?? 0;
        const isAvailable = availability.isAvailable && typeAvailCount > 0;
        const unavailableReason = !availability.isAvailable
          ? availability.reason
          : typeAvailCount === 0
          ? "No remaining slots for this room type on these dates"
          : undefined;

        const roomTypeBasePrice = ((room.roomType as IPopulatedRoomType | null)?.basePrice ?? 0);
        const pricing = await PricingService.calculateDateWisePricing(
          room._id,
          checkInDate,
          checkOutDate,
          roomTypeBasePrice,
          (room.roomType as any)?.discountPercentage || 0
        );

        // Apply price range filter
        if (minPrice && pricing.totalPrice < Number(minPrice)) {
          return null;
        }
        if (maxPrice && pricing.totalPrice > Number(maxPrice)) {
          return null;
        }

        return {
          room: {
            _id: room._id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            maxAdults: room.maxAdults,
            maxChildren: room.maxChildren,
            basePrice: roomTypeBasePrice,
          },
          roomType: room.roomType,
          amenities: room.amenities,
          pricing: {
            roomId: room._id.toString(),
            roomNumber: room.roomNumber,
            roomType: room.roomType?.name || "",
            roomTypeId: room.roomType?._id,
            basePrice: roomTypeBasePrice,
            nightlyBreakdown: pricing.nightlyBreakdown,
            totalNights: pricing.totalNights,
            totalPrice: pricing.totalPrice,
            amenities: room.amenities,
          },
          isAvailable,
          unavailableReason,
        };
      })
    );

    const availableRooms = availabilityResults.filter((r) => r !== null && r.isAvailable);

    // Limit the number of available rooms per type to typeAvailCount to prevent frontend overcounting
    const currentCounts = new Map<string, number>();
    const finalAvailableRooms = [];
    for (const r of availableRooms) {
      const rtId = r!.pricing.roomTypeId.toString();
      const maxAllowed = typeAvailMap.get(rtId) ?? 0;
      const current = currentCounts.get(rtId) ?? 0;
      if (current < maxAllowed) {
        finalAvailableRooms.push(r);
        currentCounts.set(rtId, current + 1);
      }
    }

    // Sort by price (recommended)
    finalAvailableRooms.sort((a, b) => a!.pricing.totalPrice - b!.pricing.totalPrice);

    res.status(200).json({
      success: true,
      data: {
        checkInDate,
        checkOutDate,
        totalNights: differenceInDays(checkOutDate, checkInDate),
        searchCriteria: {
          adults,
          children,
          roomType,
          amenities,
        },
        availableRooms: finalAvailableRooms,
        totalAvailable: finalAvailableRooms.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const createBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      customerDetails,
      rooms,
      roomTypeData,
      roomTypesData,     // NEW: array of room-type entries with count
      advanceAmount = 0,
      paymentMode,
      source = "Walk-in",
      bookingType = "Individual",
      corporateDetails,
      bookingCategory = "Room Stay",
      mealPlan,
      status,
      expiresAt,
      externalBookingId,
      estimatedArrivalTime,
      pickupRequired,
      vehicleDetails,
      preferences,
      internalNotes,
      specialRequests,
      purposeOfVisit,
      selectedTaxId,
      addons = [],
      paymentRemarks,
    } = req.body;

    let customer = null;

    // Find or create customer
    if (customerDetails?.phone) {
      customer = await Customer.findOne({ phone: customerDetails.phone }).session(session);
    }

    if (!customer && customerDetails?.name && customerDetails?.phone) {
      customer = new Customer(customerDetails);
      await customer.save({ session });
    }

    if (!customer || !customer._id) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Customer is required. Please provide name and phone.",
      });
    }

    // Ensure customerId is set
    if (!customer.customerId) {
      customer.customerId = `CUST-${Date.now().toString().slice(-6)}`;
      await customer.save({ session });
    }


    const validatedRooms: IBookedRoom[] = [];
    let totals;
    let dayAccessPackage = null;

    // Global tax fallback removed - pricing completely relies on individual room/addon taxes

    if (bookingCategory === "Day Access") {
      const { accessPackageId, visitDate, adults = 1, children = 0 } = req.body;
      if (!accessPackageId || !visitDate) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "accessPackageId and visitDate are required for Day Access category",
        });
      }
      dayAccessPackage = await DayAccessPackage.findById(accessPackageId).session(session);
      if (!dayAccessPackage) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Day Access Package not found",
        });
      }

      const totalGuests = Number(adults) + Number(children);
      const pkgPrice = dayAccessPackage.adult_price || 0; 
      totals = await PricingService.calculateBookingTotals(
        [],
        bookingType,
        corporateDetails,
        bookingCategory,
        pkgPrice,
        Number(adults),
        Number(children),
        12, // Default 12% for Day Access packages
        addons
      );
    } else if (rooms && rooms.length > 0) {
      for (const room of rooms) {
        if (!room.roomId) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "Room ID is required",
          });
        }

        const availability = await checkRoomAvailability(
          room.roomId,
          new Date(room.checkInDate),
          new Date(room.checkOutDate),
          undefined // No excludeBookingId for new booking
        );

        if (!availability.isAvailable) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Room ${room.roomId} is not available: ${availability.reason}`,
          });
        }

        // Fetch room base price for calculation
        const roomInfo = await Room.findById(room.roomId).populate("roomType", "basePrice discountPercentage");
        const pricing = await PricingService.calculateDateWisePricing(
          room.roomId,
          new Date(room.checkInDate),
          new Date(room.checkOutDate),
          (roomInfo?.roomType as any)?.basePrice || 0,
          (roomInfo?.roomType as any)?.discountPercentage || 0,
          bookingType === "Corporate" ? corporateDetails?.negotiatedRate : undefined
        );

        // Use room's roomType or fall back to roomInfo's roomType
        const roomTypeId = room.roomType || roomInfo?.roomType;

        validatedRooms.push({
          roomType: roomTypeId,
          roomId: room.roomId,
          checkInDate: room.checkInDate,
          checkOutDate: room.checkOutDate,
          adults: room.adults || 1,
          children: room.children || 0,
          pricePerNight: pricing.nightlyBreakdown[0]?.finalPrice || room.pricePerNight || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          mealPlan: room.mealPlan || mealPlan,
        });
      }

      totals = await PricingService.calculateBookingTotals(validatedRooms, bookingType, corporateDetails, bookingCategory, undefined, undefined, undefined, 12, addons);
    } else if (roomTypesData?.length || roomTypeData) {
      // Normalize: old single-object format → array of 1
      const entries: any[] = roomTypesData?.length
        ? roomTypesData
        : [{ ...roomTypeData, count: 1 }];

      let overallCheckIn: Date | null = null;
      let overallCheckOut: Date | null = null;
      let roomTotal = 0;
      let totalAdultsCount = 0;
      let totalChildrenCount = 0;
      let totalRoomsCount = 0;

      for (const entry of entries) {
        if (!entry.roomTypeId) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "Each room type entry must include a roomTypeId",
          });
        }
        if (!entry.checkInDate || !entry.checkOutDate) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "Each room type entry must include checkInDate and checkOutDate",
          });
        }
        const entryNights =
          differenceInDays(
            new Date(entry.checkOutDate),
            new Date(entry.checkInDate),
          ) || 1;
        const countNum = Number(entry.count) || 1;
        const pricePerNight = Number(entry.basePrice) || 0;

        const checkInDt = new Date(entry.checkInDate);
        const checkOutDt = new Date(entry.checkOutDate);

        if (!overallCheckIn || checkInDt < overallCheckIn) {
          overallCheckIn = checkInDt;
        }
        if (!overallCheckOut || checkOutDt > overallCheckOut) {
          overallCheckOut = checkOutDt;
        }

        const typeAvailability = await checkRoomTypeAvailability(
          new mongoose.Types.ObjectId(entry.roomTypeId),
          checkInDt,
          checkOutDt,
          countNum
        );
        if (!typeAvailability.isAvailable) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: typeAvailability.reason,
          });
        }

        const allRoomsForType = await Room.find({
          roomType: entry.roomTypeId,
          status: { $nin: ["Maintenance", "Blocked"] }
        }).session(session);

        const assignedRoomIds: mongoose.Types.ObjectId[] = [];
        for (const r of allRoomsForType) {
          const avail = await checkRoomAvailability(r._id as mongoose.Types.ObjectId, checkInDt, checkOutDt);
          if (avail.isAvailable) {
            assignedRoomIds.push(r._id as mongoose.Types.ObjectId);
            if (assignedRoomIds.length === countNum) break;
          }
        }

        if (assignedRoomIds.length < countNum) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Could not strictly assign enough physical rooms for ${entry.roomTypeId}. Only ${assignedRoomIds.length} available.`,
          });
        }

        for (let i = 0; i < countNum; i++) {
          validatedRooms.push({
            roomType: new mongoose.Types.ObjectId(entry.roomTypeId),
            roomId: assignedRoomIds[i],
            checkInDate: checkInDt,
            checkOutDate: checkOutDt,
            adults: Number(entry.adults) || 1,
            children: Number(entry.children) || 0,
            pricePerNight,
            mealPlan: mealPlan,
          });
        }

        roomTotal += pricePerNight * countNum * entryNights;
        totalAdultsCount += (Number(entry.adults) || 1) * countNum;
        totalChildrenCount += (Number(entry.children) || 0) * countNum;
        totalRoomsCount += countNum;
      }

      const overallNights =
        differenceInDays(overallCheckOut!, overallCheckIn!) || 1;

      totals = await PricingService.calculateBookingTotals(validatedRooms, bookingType, corporateDetails, bookingCategory, undefined, undefined, undefined, 12, addons);
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Please provide room details for Room Stay booking",
      });
    }

    totals.dueAmount = Math.max(0, totals.grandTotal - advanceAmount);
    const bookingId = `BK-${Date.now().toString().slice(-6)}`;

    const newBooking = await Booking.create(
      [
        {
          bookingId,
          customerId: customer._id,
          bookingCategory,
          bookingType,
          rooms: bookingCategory === "Day Access" ? undefined : validatedRooms,
          overallCheckInDate: bookingCategory === "Day Access" ? req.body.visitDate : totals.overallCheckInDate,
          overallCheckOutDate: bookingCategory === "Day Access" ? req.body.visitDate : totals.overallCheckOutDate,
          totalNights: bookingCategory === "Day Access" ? 1 : totals.totalNights,
          totalAdults: totals.totalAdults,
          totalChildren: totals.totalChildren,
          totalGuests: totals.totalGuests,
          totalRooms: bookingCategory === "Day Access" ? undefined : totals.totalRooms,
          accessPackageId: bookingCategory === "Day Access" ? req.body.accessPackageId : undefined,
          visitDate: bookingCategory === "Day Access" ? req.body.visitDate : undefined,
          bookingContact: {
            name: customerDetails?.name || customer?.name || "Guest",
            mobile: customerDetails?.phone || customer?.phone || "",
            email: customerDetails?.email || customer?.email,
          },
          corporateDetails: bookingType === "Corporate" ? corporateDetails : undefined,
          mealPlan,
          status,
          source,
          externalBookingId,
          paymentStatus: advanceAmount > 0 ? "Partial" : "Pending",
          advanceAmount,
          paymentMode,
          paymentRemarks,
          pricingSummary: {
            roomTotal: totals.roomTotal,
            discountAmount: totals.discountAmount,
            taxAmount: totals.taxAmount,
            taxPercentage: 0,
            grandTotal: totals.grandTotal,
            paidAmount: advanceAmount,
            dueAmount: totals.grandTotal - advanceAmount,
          },
          estimatedArrivalTime,
          pickupRequired: pickupRequired || false,
          vehicleDetails: vehicleDetails || [],
          addons: addons || [],
          preferences,
          internalNotes,
          specialRequests,
          purposeOfVisit,
          activityLogs: [
            {
              action: "Booking Created",
              performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
              timestamp: new Date(),
              details: bookingCategory === "Day Access" 
                ? `Booking created for Day Access package: ${dayAccessPackage?.packageName}`
                : `Booking created with ${validatedRooms.length} room(s)`,
            },
          ],
        },
      ],
      { session }
    );

      
    let billing: IBilling | null = null;
    if (advanceAmount > 0) {
      billing = await createOrUpdateBilling(
        newBooking[0]._id,
        customer._id,
        validatedRooms,
        bookingCategory === "Day Access" ? req.body.visitDate : totals.overallCheckInDate,
        bookingCategory === "Day Access" ? req.body.visitDate : totals.overallCheckOutDate,
        advanceAmount,
        paymentMode,
        (req as any).user?._id,
        bookingCategory,
        bookingCategory === "Day Access" ? dayAccessPackage?._id : undefined,
        bookingCategory === "Day Access" ? dayAccessPackage?.packageName : undefined,
        bookingCategory === "Day Access" ? dayAccessPackage?.packageType : undefined,
        bookingCategory === "Day Access" ? dayAccessPackage?.adult_price : undefined,
        bookingCategory === "Day Access" ? (totals.totalAdults + totals.totalChildren) : undefined,
        12, // fallback for billing if Day Access
        addons || [],
        paymentRemarks,
        { session }
      );
    }

    // Notification: new booking confirmed
    if (status === "Confirmed") {
      try {
        const guestName = customerDetails?.name || customer?.name || "Guest";
        const roomLabel = bookingCategory === "Day Access"
          ? (dayAccessPackage?.packageName || "Day Access")
          : (validatedRooms.length === 1 ? `Room ${validatedRooms[0]?.roomId}` : `${validatedRooms.length} rooms`);
        await sendNotificationToRole(
          "Reception",
          "booking",
          "Booking Confirmed",
          `New booking confirmed: ${guestName}, ${roomLabel}. Date: ${totals.overallCheckInDate?.toLocaleDateString() || req.body.visitDate || new Date().toLocaleDateString()}.`,
          newBooking[0]._id,
          "Booking"
        );
      } catch (notifErr) {
        console.error("Failed to send booking notification:", notifErr);
      }
    }

    await session.commitTransaction();

    // Send WhatsApp Booking Confirmation
    if (customerDetails?.phone || customer?.phone) {
      const phone = customerDetails?.phone || customer?.phone;
      const name = customerDetails?.name || customer?.name || "Guest";
      waBridgeService.sendBookingConfirmation(
        phone, 
        name, 
        newBooking[0].bookingId, 
        newBooking[0].overallCheckInDate, 
        newBooking[0].overallCheckOutDate
      ).catch(err => console.error("WA Booking Confirmation Error:", err));
    }

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: {
        booking: newBooking[0],
        billing: billing
          ? {
              invoiceNumber: billing.invoiceNumber,
              grandTotal: billing.grandTotal,
              paidAmount: billing.paidAmount,
              dueAmount: billing.dueAmount,
              paymentStatus: billing.paymentStatus,
            }
          : null,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};


export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      startDate,
      endDate,
      bookingType,
      bookingCategory,
      status,
      source,
      customerId,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = {};

    if (search) {
      filter.$or = [
        { bookingId: { $regex: search, $options: "i" } },
        { "bookingContact.name": { $regex: search, $options: "i" } },
        { "bookingContact.mobile": { $regex: search, $options: "i" } },
      ];
    }

    if (startDate && endDate) {
      filter.overallCheckInDate = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string),
      };
    }

    if (status) {
      if ((status as string).includes(",")) {
        filter.status = { $in: (status as string).split(",") };
      } else {
        filter.status = status;
      }
    }
    if (bookingType) filter.bookingType = bookingType;
    if (bookingCategory) filter.bookingCategory = bookingCategory;
    if (source) filter.source = source;
    if (customerId) filter.customerId = customerId;

    const [bookings, totalCount] = await Promise.all([
      Booking.find(filter)
        .populate("customerId", "name phone email")
        .populate("rooms.roomType", "name")
        .populate("rooms.roomId", "roomNumber")
        .populate("accessPackageId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit)),
        currentPage: Number(page),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getBookingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("customerId", "name phone email")
      .populate("rooms.roomType", "name")
      .populate("rooms.roomId", "roomNumber")
      .populate("taxGstId", "name percentage type")
      .populate("accessPackageId");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }


    const billing = await Billing.findOne({ bookingId: booking._id });

    res.status(200).json({
      success: true,
      data: {
        booking,
        billing,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const updateBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const {
      rooms,
      roomTypesData,
      addons,
      accessPackageId,
      visitDate,
      advanceAmount,
      paymentMode,
      paymentRemarks,
      source,
      status,
      corporateDetails,
      vehicleDetails,
      travelAgentInfo,
      preferences,
      internalNotes,
      specialRequests,
      selectedTaxId,
      purposeOfVisit,
      customerDetails,
    } = req.body;

    const existingBooking = await Booking.findById(id);
    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (!["Tentative", "Confirmed"].includes(existingBooking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot edit booking in '${existingBooking.status}' status. Only Tentative and Confirmed bookings can be edited.`,
      });
    }

    let updatedRooms: IBookedRoom[] | undefined = undefined;
    let totals: any = null;

    if (existingBooking.bookingCategory === "Day Access") {
      if (accessPackageId) existingBooking.accessPackageId = accessPackageId;
      if (visitDate) existingBooking.visitDate = new Date(visitDate);
      
      const pkg = await DayAccessPackage.findById(existingBooking.accessPackageId);
      const pkgPrice = pkg?.adult_price || 0;
      totals = await PricingService.calculateBookingTotals(
        [],
        existingBooking.bookingType,
        corporateDetails || existingBooking.corporateDetails,
        "Day Access",
        pkgPrice,
        existingBooking.totalAdults,
        existingBooking.totalChildren,
        12, // Default 12% for Day Access packages
        addons || existingBooking.addons || []
      );
    } else {
      if (rooms && rooms.length > 0) {
        // Specific rooms assigned
        const validatedRooms: IBookedRoom[] = [];
        for (const room of rooms) {
          const availability = await checkRoomAvailability(
            room.roomId,
            new Date(room.checkInDate),
            new Date(room.checkOutDate),
            existingBooking._id
          );

          if (!availability.isAvailable) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message: `Room ${room.roomId} is not available: ${availability.reason}`,
            });
          }
          
          const roomInfo = await Room.findById(room.roomId).populate("roomType", "basePrice discountPercentage");
          const pricing = await PricingService.calculateDateWisePricing(
            room.roomId,
            new Date(room.checkInDate),
            new Date(room.checkOutDate),
            (roomInfo?.roomType as any)?.basePrice || 0,
            (roomInfo?.roomType as any)?.discountPercentage || 0,
            existingBooking.bookingType === "Corporate" ? corporateDetails?.negotiatedRate || existingBooking.corporateDetails?.negotiatedRate : undefined
          );

          validatedRooms.push({
            roomType: room.roomType || roomInfo?.roomType,
            roomId: room.roomId,
            checkInDate: room.checkInDate,
            checkOutDate: room.checkOutDate,
            adults: room.adults || 1,
            children: room.children || 0,
            pricePerNight: pricing.nightlyBreakdown[0]?.finalPrice || room.pricePerNight || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
            mealPlan: room.mealPlan || existingBooking.mealPlan,
          });
        }
        updatedRooms = validatedRooms;
        totals = await PricingService.calculateBookingTotals(
          validatedRooms, 
          existingBooking.bookingType, 
          corporateDetails || existingBooking.corporateDetails, 
          existingBooking.bookingCategory, 
          undefined, undefined, undefined, 12, 
          addons || existingBooking.addons || []
        );
      } else if (roomTypesData && roomTypesData.length > 0) {
        // General room types without specific assignment
        const validatedRooms: IBookedRoom[] = [];
        let overallCheckIn: Date | null = null;
        let overallCheckOut: Date | null = null;
        let roomTotal = 0;
        let totalAdultsCount = 0;
        let totalChildrenCount = 0;
        let totalRoomsCount = 0;

        for (const entry of roomTypesData) {
          const countNum = Number(entry.count) || 1;
          const entryNights = differenceInDays(new Date(entry.checkOutDate), new Date(entry.checkInDate)) || 1;
          const pricePerNight = Number(entry.basePrice) || 0;
          const checkInDt = new Date(entry.checkInDate);
          const checkOutDt = new Date(entry.checkOutDate);

          if (!overallCheckIn || checkInDt < overallCheckIn) overallCheckIn = checkInDt;
          if (!overallCheckOut || checkOutDt > overallCheckOut) overallCheckOut = checkOutDt;

          const typeAvailability = await checkRoomTypeAvailability(
            new mongoose.Types.ObjectId(entry.roomTypeId),
            checkInDt,
            checkOutDt,
            countNum,
            existingBooking._id as mongoose.Types.ObjectId
          );
          if (!typeAvailability.isAvailable) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message: typeAvailability.reason,
            });
          }

          const allRoomsForType = await Room.find({
            roomType: entry.roomTypeId,
            status: { $nin: ["Maintenance", "Blocked"] }
          }).session(session);

          const assignedRoomIds: mongoose.Types.ObjectId[] = [];
          for (const r of allRoomsForType) {
            const avail = await checkRoomAvailability(
              r._id as mongoose.Types.ObjectId, 
              checkInDt, 
              checkOutDt,
              existingBooking._id as mongoose.Types.ObjectId
            );
            if (avail.isAvailable) {
              assignedRoomIds.push(r._id as mongoose.Types.ObjectId);
              if (assignedRoomIds.length === countNum) break;
            }
          }

          if (assignedRoomIds.length < countNum) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message: `Could not strictly assign enough physical rooms for ${entry.roomTypeId}. Only ${assignedRoomIds.length} available.`,
            });
          }

          for (let i = 0; i < countNum; i++) {
            validatedRooms.push({
              roomType: new mongoose.Types.ObjectId(entry.roomTypeId),
              roomId: assignedRoomIds[i],
              checkInDate: checkInDt,
              checkOutDate: checkOutDt,
              adults: Number(entry.adults) || 1,
              children: Number(entry.children) || 0,
              pricePerNight,
              mealPlan: existingBooking.mealPlan,
            });
          }

          roomTotal += pricePerNight * countNum * entryNights;
          totalAdultsCount += (Number(entry.adults) || 1) * countNum;
          totalChildrenCount += (Number(entry.children) || 0) * countNum;
          totalRoomsCount += countNum;
        }

        const overallNights = differenceInDays(overallCheckOut!, overallCheckIn!) || 1;

        updatedRooms = validatedRooms;
        totals = await PricingService.calculateBookingTotals(
          validatedRooms,
          existingBooking.bookingType,
          corporateDetails || existingBooking.corporateDetails,
          existingBooking.bookingCategory,
          undefined, undefined, undefined, 12,
          addons || existingBooking.addons || []
        );
      }
    }

    if (updatedRooms) {
      existingBooking.rooms = updatedRooms;
      existingBooking.overallCheckInDate = totals.overallCheckInDate;
      existingBooking.overallCheckOutDate = totals.overallCheckOutDate;
      existingBooking.totalNights = totals.totalNights;
      existingBooking.totalAdults = totals.totalAdults;
      existingBooking.totalChildren = totals.totalChildren;
      existingBooking.totalGuests = totals.totalGuests;
      existingBooking.totalRooms = totals.totalRooms;
    }

    let targetStatus = status;
    if (advanceAmount && advanceAmount > 0 && (existingBooking.status === "Tentative" || status === "Tentative")) {
      targetStatus = "Confirmed";
    }

    if (targetStatus && targetStatus !== existingBooking.status) {
      await transitionBookingState(
        existingBooking,
        targetStatus as any,
        {
          userId: (req as any).user?._id || new mongoose.Types.ObjectId(),
          notes: "Updated booking status via updateBooking"
        },
        { session }
      );
    }

    if (source) existingBooking.source = source;
    if (corporateDetails) existingBooking.corporateDetails = corporateDetails;
    if (vehicleDetails) existingBooking.vehicleDetails = vehicleDetails;

    if (preferences) existingBooking.preferences = preferences;
    if (internalNotes) existingBooking.internalNotes = internalNotes;
    if (specialRequests) existingBooking.specialRequests = specialRequests;
    if (req.body.hasOwnProperty("purposeOfVisit")) {
      existingBooking.purposeOfVisit = purposeOfVisit;
    }
    if (addons) existingBooking.addons = addons;

    if (paymentMode) existingBooking.paymentMode = paymentMode;
    if (req.body.hasOwnProperty("paymentRemarks")) existingBooking.paymentRemarks = paymentRemarks;
    if (req.body.hasOwnProperty("remarks")) (existingBooking as any).notes = req.body.remarks;

    if (req.body.travelAgentInfo) {
      (existingBooking as any).travelAgentInfo = req.body.travelAgentInfo;
      if (req.body.travelAgentInfo.referenceId) {
        existingBooking.externalBookingId = req.body.travelAgentInfo.referenceId;
      }
    }

    if (customerDetails) {
      if (existingBooking.customerId) {
        await Customer.findByIdAndUpdate(existingBooking.customerId, {
          $set: {
            name: customerDetails.name,
            phone: customerDetails.phone,
            ...(customerDetails.email ? { email: customerDetails.email } : {}),
            ...(customerDetails.address ? { address: customerDetails.address } : {}),
          }
        }, { session });
      }
      
      existingBooking.bookingContact = {
        name: customerDetails.name,
        mobile: customerDetails.phone,
        email: customerDetails.email || "",
      };
    }
  
    // Global tax fallback removed

    if (totals || selectedTaxId || addons) {
      const roomTotal = totals ? totals.roomTotal : existingBooking.pricingSummary.roomTotal;
      let taxAmount = totals ? totals.taxAmount : (existingBooking.pricingSummary.taxAmount || 0);
      let grandTotal = totals ? totals.grandTotal : existingBooking.pricingSummary.grandTotal;
      
      if (!totals) {
        let oldAddonTax = 0;
        (existingBooking.addons || []).forEach((a: any) => {
           oldAddonTax += ((Number(a.total) || 0) * (Number(a.taxPercentage) || 0)) / 100;
        });
        const roomTaxOnly = (existingBooking.pricingSummary.taxAmount || 0) - oldAddonTax;
        
        let newAddonTax = 0;
        let newAddonTotal = 0;
        (addons || existingBooking.addons || []).forEach((a: any) => {
           newAddonTotal += (Number(a.total) || 0);
           newAddonTax += ((Number(a.total) || 0) * (Number(a.taxPercentage) || 0)) / 100;
        });
        
        taxAmount = roomTaxOnly + newAddonTax;
        grandTotal = roomTotal + newAddonTotal + taxAmount;
      }
      
      existingBooking.pricingSummary = {
        ...existingBooking.pricingSummary,
        roomTotal,
        taxAmount,
        taxPercentage: 0,
        grandTotal,
        dueAmount: grandTotal - (existingBooking.pricingSummary.paidAmount || 0),
      };
    }

    if (advanceAmount && advanceAmount > (existingBooking.advanceAmount || 0)) {
      const additionalAmount = advanceAmount - (existingBooking.advanceAmount || 0);
      existingBooking.advanceAmount = advanceAmount;
      existingBooking.pricingSummary.paidAmount =
        (existingBooking.pricingSummary.paidAmount || 0) + additionalAmount;
      existingBooking.pricingSummary.dueAmount =
        existingBooking.pricingSummary.grandTotal - existingBooking.pricingSummary.paidAmount;
      existingBooking.paymentStatus =
        existingBooking.pricingSummary.dueAmount <= 0
          ? "Paid"
          : existingBooking.pricingSummary.paidAmount > 0
            ? "Partial"
            : "Pending";


      await createOrUpdateBilling(
        existingBooking._id,
        existingBooking.customerId,
        existingBooking.rooms,
        existingBooking.overallCheckInDate,
        existingBooking.overallCheckOutDate,
        additionalAmount,
        paymentMode,
        (req as any).user?._id,
        existingBooking.bookingCategory,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        existingBooking.pricingSummary?.taxPercentage || 0,
        existingBooking.addons || [],
        paymentRemarks,
        { session }
      );
    } else if (totals || selectedTaxId || addons) {
      // Recalculate paymentStatus based on updated totals even if no new advance payment
      existingBooking.paymentStatus =
        existingBooking.pricingSummary.dueAmount <= 0
          ? "Paid"
          : (existingBooking.pricingSummary.paidAmount || 0) > 0
            ? "Partial"
            : "Pending";
    }

    existingBooking.activityLogs.push({
      action: "Booking Updated",
      performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      details: "Booking details updated via edit modal",
    });

    await existingBooking.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      data: existingBooking,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};


export const cancelBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { reason, refundAmount = 0 } = req.body;

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.status === "Checked-In") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel checked-in booking. Please process checkout first.",
      });
    }

    if (booking.status === "Checked-Out" || booking.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking is already completed or cancelled",
      });
    }

    const cancelledBooking = await transitionBookingState(
      booking,
      "Cancelled",
      {
        userId: (req as any).user?._id || new mongoose.Types.ObjectId(),
        notes: `Cancelled. Reason: ${reason}`
      },
      { session }
    );
    cancelledBooking.cancellationDetails = {
      cancelledAt: new Date(),
      cancelledBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      reason: reason || "No reason provided",
      refundAmount,
    };

    cancelledBooking.activityLogs.push({
      action: "Booking Cancelled",
      performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      details: `Cancelled. Reason: ${reason}. Refund: ₹${refundAmount}`,
    });

    await cancelledBooking.save({ session });

    const billing = await Billing.findOne({ bookingId: cancelledBooking._id }).session(session);
    if (billing) {
      const operatorId = (req as any).user?._id || new mongoose.Types.ObjectId();
      if (refundAmount > 0) {
        await recordRefund(
          billing._id,
          cancelledBooking._id,
          refundAmount,
          reason || "Booking Cancelled Refund",
          operatorId,
          { session }
        );
        billing.refundDetails = {
          refundAmount,
          refundMethod: "Cash",
          refundedAt: new Date(),
          reason: reason || "Booking Cancelled Refund",
        };
        billing.billingStatus = "Refunded";
      } else {
        billing.billingStatus = "Cancelled";
      }
      billing.settlementStatus = "Settled";
      await billing.save({ session });
    }

    // Notification: booking cancelled
    try {
      const guestName = cancelledBooking.bookingContact?.name || "Guest";
      await sendNotificationToRole(
        "Manager",
        "booking",
        "Booking Cancelled",
        `Booking cancelled by staff: ${guestName}. Reason: ${reason || "No reason provided"}. Refund: ₹${refundAmount || 0}.`,
        cancelledBooking._id,
        "Booking"
      );
    } catch (notifErr) {
      console.error("Failed to send cancellation notification:", notifErr);
    }

    await session.commitTransaction();

    // Send WhatsApp Cancellation Message
    if (cancelledBooking.bookingContact?.mobile) {
      const phone = cancelledBooking.bookingContact.mobile;
      const name = cancelledBooking.bookingContact.name || "Guest";
      waBridgeService.sendCancellation(phone, name, cancelledBooking.bookingId)
        .catch(err => console.error("WA Cancellation Error:", err));
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: cancelledBooking,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};


export const getBookingOverview = async (req: Request, res: Response) => {
  try {
    const { month, year, fromDate, toDate, viewMode } = req.query;

    // Default to current month if not specified
    const targetYear = Number(year) || new Date().getFullYear();
    const targetMonth = Number(month) || new Date().getMonth() + 1;

    // Calculate date range - normalize to local midnight
    let startOfRange: Date;
    let endOfRange: Date;

    if (fromDate && toDate) {
      const startParts = new Date(fromDate as string);
      const endParts = new Date(toDate as string);
      startOfRange = new Date(startParts.getFullYear(), startParts.getMonth(), startParts.getDate(), 0, 0, 0, 0);
      endOfRange = new Date(endParts.getFullYear(), endParts.getMonth(), endParts.getDate(), 23, 59, 59, 999);
    } else if (viewMode === "daily") {
      const today = new Date();
      startOfRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      endOfRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    } else if (viewMode === "weekly") {
      const today = new Date();
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfRange = new Date(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0);
      endOfRange = new Date(startOfRange);
      endOfRange.setDate(endOfRange.getDate() + 13);
      endOfRange.setHours(23, 59, 59, 999);
    } else {
      // Monthly (default)
      startOfRange = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
      endOfRange = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    }

    // Helper function to normalize date to YYYY-MM-DD string (timezone neutral)
    const normalizeDate = (date: any): string => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Helper function to calculate nights
    const calculateNights = (checkIn: any, checkOut: any): number => {
      const ci = new Date(checkIn);
      const co = new Date(checkOut);
      const diffTime = co.getTime() - ci.getTime();
      return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    };

    // Fetch all rooms with their types
    const rooms = await Room.find({})
      .populate("roomType", "name")
      .sort({ roomNumber: 1 })
      .lean();

    // Fetch bookings (Confirmed and Checked-In - exclude duplicates with checkIns)
    const bookings = await Booking.find({
      status: { $in: ["Confirmed", "Checked-In"] },
      $or: [
        {
          "rooms.checkInDate": { $lte: endOfRange },
          "rooms.checkOutDate": { $gte: startOfRange },
        },
      ],
    })
      .populate("customerId", "name phone")
      .populate("rooms.roomId", "roomNumber roomType status")
      .populate("rooms.roomType", "name")
      .lean();

    // Fetch active check-ins
    const checkIns = await CheckIn.find({
      status: "Active",
      checkInTime: { $lte: endOfRange },
      expectedCheckOutTime: { $gte: startOfRange },
    })
      .populate("roomDetails.roomId", "roomNumber roomType")
      .populate("guests", "name mobileNo")
      .lean();

    // Build set of checkIn booking IDs to avoid duplicates
    const checkInBookingIds = new Set(checkIns.map((ci: any) => ci.bookingId?.toString()).filter(Boolean));

    // Build room data with bookings mapped
    const roomTimelineData = rooms.map((room: any) => {
      const roomBookings: any[] = [];

      // From bookings - only Confirmed status (Checked-In bookings come from CheckIn model to avoid duplicates)
      bookings.forEach((booking: any) => {
        // Skip if this booking is already represented by a check-in (to avoid duplicates)
        if (checkInBookingIds.has(booking._id.toString())) {
          return;
        }

        booking.rooms?.forEach((roomEntry: any) => {
          if (roomEntry.roomId?._id?.toString() === room._id.toString()) {
            const checkInDate = new Date(roomEntry.checkInDate);
            const checkOutDate = new Date(roomEntry.checkOutDate);
            const totalNights = calculateNights(checkInDate, checkOutDate);

            roomBookings.push({
              id: booking._id.toString(),
              bookingId: booking.bookingId,
              checkIn: normalizeDate(roomEntry.checkInDate),
              checkOut: normalizeDate(roomEntry.checkOutDate),
              totalNights,
              guest: {
                name: booking.bookingContact?.name || booking.customerId?.name || "N/A",
                phone: booking.bookingContact?.mobile || "",
              },
              tag: booking.bookingType === "Corporate" ? "Corporate" : "Individual",
              status: booking.status === "Checked-In" ? "checked-in" : "confirmed",
              source: "booking",
            });
          }
        });
      });

      // From check-ins - active stays
      checkIns.forEach((checkIn: any) => {
        checkIn.roomDetails?.forEach((roomEntry: any) => {
          if (roomEntry.roomId?._id?.toString() === room._id.toString()) {
            const checkInTime = new Date(checkIn.checkInTime);
            const expectedCheckOut = new Date(checkIn.expectedCheckOutTime);
            const totalNights = calculateNights(checkInTime, expectedCheckOut);

            roomBookings.push({
              id: checkIn._id.toString(),
              bookingId: checkIn.checkInId,
              checkIn: normalizeDate(checkIn.checkInTime),
              checkOut: normalizeDate(checkIn.expectedCheckOutTime),
              totalNights,
              guest: {
                name: checkIn.guests?.[0]?.name || "N/A",
                phone: checkIn.guests?.[0]?.mobileNo || "",
              },
              tag: checkIn.checkInType === "Corporate" ? "Corporate" : "Individual",
              status: "checked-in",
              source: "checkin",
            });
          }
        });
      });

      // Sort bookings by checkIn date ascending
      roomBookings.sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

      return {
        id: room._id.toString(),
        number: room.roomNumber,
        type: room.roomType?.name || "Standard",
        floor: room.floor || "1st Floor",
        status: room.status === "Active" ? "available" : room.status === "Maintenance" ? "maintenance" : "blocked",
        bookings: roomBookings,
      };
    });

    // Calculate stats
    const totalRooms = rooms.length;
    const occupiedRooms = roomTimelineData.filter(r => r.bookings.length > 0).length;
    const maintenanceRooms = rooms.filter(r => r.status === "Maintenance").length;
    const blockedRooms = rooms.filter(r => r.status === "Blocked").length;
    const availableRooms = roomTimelineData.filter(r => r.status === "available" && r.bookings.length === 0).length;

    const allBookingsCount = bookings.length + checkIns.length;
    const activeBookingsCount = checkIns.length;

    // Revenue calculation
    const totalRevenue = bookings.reduce(
      (sum: number, b: any) => sum + (b.pricingSummary?.grandTotal || 0),
      0
    );
    const totalCollected = bookings.reduce(
      (sum: number, b: any) => sum + (b.pricingSummary?.paidAmount || 0),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        rooms: roomTimelineData,
        stats: {
          totalRooms,
          availableRooms,
          occupiedRooms,
          maintenanceRooms,
          blockedRooms,
          totalBookings: allBookingsCount,
          activeBookings: activeBookingsCount,
          totalRevenue,
          totalCollected,
          pendingAmount: totalRevenue - totalCollected,
        },
        dateRange: {
          start: startOfRange.toISOString(),
          end: endOfRange.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error("getBookingOverview error:", error);
    return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
  }
};


export const getBookingCalendar = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to dates are required",
      });
    }

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);

    const rooms = await Room.find({ status: "Active" })
      .populate("roomType", "name")
      .sort({ roomNumber: 1 });

    const bookings = await Booking.find({
      status: { $in: ["Confirmed", "Checked-In"] },
      "rooms.checkInDate": { $lte: endDate },
      "rooms.checkOutDate": { $gte: startDate },
    })
      .populate("customerId", "name phone")
      .populate("rooms.roomId", "roomNumber");


    const activeCheckIns = await CheckIn.find({
      status: "Active",
      checkInTime: { $lt: endDate },
      expectedCheckOutTime: { $gt: startDate },
    })
      .populate("guests")
      .populate("roomDetails.roomId", "roomNumber");

    const calendarData = rooms.map((room: any) => {
      const roomId = room._id.toString();
      const roomBookings: any[] = [];
      const roomCheckIns: any[] = [];


      bookings.forEach((booking: any) => {
        booking.rooms.forEach((roomEntry: any) => {
          if (roomEntry.roomId?._id?.toString() === roomId) {
            roomBookings.push({
              id: booking._id,
              bookingId: booking.bookingId,
              guestName: booking.bookingContact?.name || (booking.customerId as any)?.name,
              checkIn: roomEntry.checkInDate,
              checkOut: roomEntry.checkOutDate,
              status: booking.status,
              type: "booking",
            });
          }
        });
      });

      activeCheckIns.forEach((checkIn: any) => {
        checkIn.roomDetails.forEach((rd: any) => {
          if (rd.roomId?._id?.toString() === roomId) {
            roomCheckIns.push({
              id: checkIn._id,
              guestName: checkIn.guests?.[0]?.name || "Guest",
              checkIn: checkIn.checkInTime,
              expectedCheckOut: checkIn.expectedCheckOutTime,
              status: checkIn.status,
              type: "checkin",
            });
          }
        });
      });

      return {
        roomId,
        roomNumber: room.roomNumber,
        roomType: room.roomType?.name || "",
        bookings: [...roomBookings, ...roomCheckIns],
      };
    });

    res.status(200).json({
      success: true,
      data: calendarData,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const emailReceipt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const booking = await Booking.findById(id)
      .populate("customerId")
      .populate({
        path: "rooms.roomType",
        select: "name description"
      });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const html = buildReceiptHtml(booking.toObject());

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    // Wait for networkidle0 so tailwind CDN loads and applies styles
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });
    await browser.close();

    const filename = `Receipt_${(booking as any).reservationNumber || booking.bookingId || "Booking"}.pdf`;

    await emailService.sendEmailWithAttachment(
      email,
      `Your Booking Receipt - Siddharaj Resort [${(booking as any).reservationNumber || booking.bookingId}]`,
      "Please find your booking receipt attached.",
      "<p>Dear Guest,</p><p>Please find your booking receipt attached.</p><p>Thank you for choosing Siddharaj Resort.</p>",
      Buffer.from(pdfBuffer),
      filename
    );

    res.status(200).json({ success: true, message: "Receipt sent successfully" });
  } catch (error: any) {
    console.error("emailReceipt error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to send receipt" });
  }
};

export const whatsappReceipt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const booking = await Booking.findById(id).populate("customerId");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const name = booking.bookingContact?.name || (booking.customerId as any)?.name || "Guest";
    const checkInDate = booking.overallCheckInDate || new Date();
    const checkOutDate = booking.overallCheckOutDate || new Date();
    
    await waBridgeService.sendBookingConfirmation(
      phone,
      name,
      booking.bookingId,
      checkInDate,
      checkOutDate
    );

    res.status(200).json({ success: true, message: "WhatsApp message sent successfully" });
  } catch (error: any) {
    console.error("whatsappReceipt error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to send WhatsApp message" });
  }
};