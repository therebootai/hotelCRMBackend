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

  const bookingQuery: any = {
    status: { $in: ["Pending", "Confirmed", "Checked-In"] },
    "rooms.roomId": roomId,
    $or: [
      {
        "rooms.checkInDate": { $lt: checkOutDate },
        "rooms.checkOutDate": { $gt: checkInDate },
      },
    ],
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


export const calculateDateWisePricing = async (
  roomId: mongoose.Types.ObjectId,
  checkInDate: Date,
  checkOutDate: Date,
  basePrice: number,
  negotiatedRate?: number
): Promise<{ nightlyBreakdown: IPricingBreakdown[]; totalPrice: number; totalNights: number }> => {
  const dates = eachDayOfInterval({ start: checkInDate, end: new Date(checkOutDate.getTime() - 86400000) }); // Exclude checkout date
  const nightlyBreakdown: IPricingBreakdown[] = [];

  const pricingRules = await PricingRule.find({
    roomId,
    date: { $gte: startOfDay(checkInDate), $lt: checkOutDate },
  });

  const ruleMap = new Map<string, number>();
  pricingRules.forEach((rule) => {
    const dateKey = startOfDay(new Date(rule.date)).toISOString();
    ruleMap.set(dateKey, rule.price);
  });

  let totalPrice = 0;
  const effectiveRate = negotiatedRate || basePrice;

  for (const date of dates) {
    const dateKey = startOfDay(date).toISOString();
    const rulePrice = ruleMap.get(dateKey);
    const finalPrice = rulePrice ?? effectiveRate;

    nightlyBreakdown.push({
      date,
      basePrice: effectiveRate,
      rulePrice,
      finalPrice,
      isOverridden: rulePrice !== undefined,
    });

    totalPrice += finalPrice;
  }

  return {
    nightlyBreakdown,
    totalPrice,
    totalNights: dates.length,
  };
};


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
        const roomInfo = await Room.findById(room.roomId).populate("roomType", "name");
        const pricing = await calculateDateWisePricing(
          room.roomId!,
          new Date(room.checkInDate),
          new Date(room.checkOutDate),
          roomInfo?.basePrice || 0
        );

        // Extra bed charge calculation
        const extraBedCharge = room.hasExtraBed ? (room.extraBedCharge || roomInfo?.extraBedCharge || 0) * pricing.totalNights : 0;
        const totalRoomCharge = pricing.totalPrice + extraBedCharge;

        return {
          roomId: room.roomId,
          roomNumber: roomInfo?.roomNumber || "",
          roomType: (roomInfo?.roomType as any)?.name || "",
          checkInDate: room.checkInDate,
          checkOutDate: room.checkOutDate,
          nights: pricing.totalNights,
          ratePerNight: pricing.nightlyBreakdown[0]?.finalPrice || room.pricePerNight,
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

  const taxPercentage = taxPercentageArg ?? 12; // Use passed taxPercentage or default 12%
  const taxAmount = (subTotal * taxPercentage) / 100;
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
    subTotal,
    taxBreakdown: {
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      serviceCharge: 0,
      cess: 0,
      totalTax: taxAmount,
    },
    taxPercentage,
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
            note: "Advance payment at booking",
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
      "Booking Advance",
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


export const calculateBookingTotals = async (
  rooms: IBookedRoom[],
  bookingType: string,
  corporateDetails?: any,
  bookingCategory?: string,
  dayAccessPackagePrice?: number,
  adultsCount: number = 1,
  childrenCount: number = 0
): Promise<{
  roomTotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  totalAdults: number;
  totalChildren: number;
  totalGuests: number;
  totalRooms: number;
  totalNights: number;
  overallCheckInDate: Date;
  overallCheckOutDate: Date;
}> => {
  if (bookingCategory === "Day Access") {
    const packageTotal = (dayAccessPackagePrice || 0) * (adultsCount + childrenCount);
    const discountAmount = 0;
    const taxPercentage = 12;
    const taxAmount = (packageTotal * taxPercentage) / 100;
    const grandTotal = packageTotal + taxAmount - discountAmount;

    return {
      roomTotal: packageTotal,
      discountAmount,
      taxAmount,
      grandTotal,
      paidAmount: 0,
      dueAmount: grandTotal,
      totalAdults: adultsCount,
      totalChildren: childrenCount,
      totalGuests: adultsCount + childrenCount,
      totalRooms: 0,
      totalNights: 1,
      overallCheckInDate: new Date(),
      overallCheckOutDate: new Date(),
    };
  }

  let roomTotal = 0;
  let totalAdults = 0;
  let totalChildren = 0;
  let totalRooms = rooms.length;
  let overallCheckInDate = new Date();
  let overallCheckOutDate = new Date();

  const nightlyDetails = await Promise.all(
    rooms.map(async (room, index) => {
      const roomInfo = await Room.findById(room.roomId);
      const checkIn = new Date(room.checkInDate);
      const checkOut = new Date(room.checkOutDate);
      const nights = differenceInCalendarDays(checkOut, checkIn) || 1;

      // Track overall dates
      if (index === 0 || checkIn < overallCheckInDate) {
        overallCheckInDate = checkIn;
      }
      if (index === 0 || checkOut > overallCheckOutDate) {
        overallCheckOutDate = checkOut;
      }

      const pricing = await calculateDateWisePricing(
        room.roomId!,
        checkIn,
        checkOut,
        roomInfo?.basePrice || 0,
        bookingType === "Corporate" ? corporateDetails?.negotiatedRate : undefined
      );

      totalAdults += room.adults || 1;
      totalChildren += room.children || 0;

      return {
        nights,
        totalPrice: pricing.totalPrice,
      };
    })
  );

  roomTotal = nightlyDetails.reduce((sum, d) => sum + d.totalPrice, 0);
  const totalNights = nightlyDetails[0]?.nights || 1;

  const discountAmount = 0;
  const taxPercentage = 12;
  const taxAmount = (roomTotal * taxPercentage) / 100;
  const grandTotal = roomTotal + taxAmount - discountAmount;
  const paidAmount = 0;
  const dueAmount = grandTotal;

  return {
    roomTotal,
    discountAmount,
    taxAmount,
    grandTotal,
    paidAmount,
    dueAmount,
    totalAdults,
    totalChildren,
    totalGuests: totalAdults + totalChildren,
    totalRooms,
    totalNights,
    overallCheckInDate,
    overallCheckOutDate,
  };
};


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
      .populate("roomType", "name description")
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

    // Calculate availability and pricing for each room
    const availabilityResults: IAvailabilityResult[] = await Promise.all(
      rooms.map(async (room: any) => {
        // Check room availability
        const availability = await checkRoomAvailability(
          room._id,
          checkInDate,
          checkOutDate
        );

        // Calculate dynamic pricing
        const pricing = await calculateDateWisePricing(
          room._id,
          checkInDate,
          checkOutDate,
          room.basePrice
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
            basePrice: room.basePrice,
          },
          roomType: room.roomType,
          amenities: room.amenities,
          pricing: {
            roomId: room._id.toString(),
            roomNumber: room.roomNumber,
            roomType: room.roomType?.name || "",
            roomTypeId: room.roomType?._id,
            basePrice: room.basePrice,
            nightlyBreakdown: pricing.nightlyBreakdown,
            totalNights: pricing.totalNights,
            totalPrice: pricing.totalPrice,
            amenities: room.amenities,
          },
          isAvailable: availability.isAvailable,
          unavailableReason: availability.reason,
        };
      })
    );

    // Filter out null results and unavailable rooms if requested
    const availableRooms = availabilityResults.filter((r) => r !== null && r.isAvailable);

    // Sort by price (recommended)
    availableRooms.sort((a, b) => a!.pricing.totalPrice - b!.pricing.totalPrice);

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
        availableRooms,
        totalAvailable: availableRooms.length,
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
      externalBookingId,
      estimatedArrivalTime,
      pickupRequired,
      vehicleDetails,
      preferences,
      internalNotes,
      specialRequests,
      selectedTaxId,
      addons = [],
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
      totals = await calculateBookingTotals(
        [],
        bookingType,
        corporateDetails,
        bookingCategory,
        pkgPrice,
        Number(adults),
        Number(children)
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
        const roomInfo = await Room.findById(room.roomId);
        const pricing = await calculateDateWisePricing(
          room.roomId,
          new Date(room.checkInDate),
          new Date(room.checkOutDate),
          roomInfo?.basePrice || 0,
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
          pricePerNight: pricing.nightlyBreakdown[0]?.finalPrice || room.pricePerNight || roomInfo?.basePrice || 0,
          mealPlan: room.mealPlan || mealPlan,
        });
      }

      totals = await calculateBookingTotals(validatedRooms, bookingType, corporateDetails);
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

        for (let i = 0; i < countNum; i++) {
          validatedRooms.push({
            roomType: new mongoose.Types.ObjectId(entry.roomTypeId),
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

      totals = {
        roomTotal,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: roomTotal,
        paidAmount: 0,
        dueAmount: roomTotal,
        totalAdults: totalAdultsCount,
        totalChildren: totalChildrenCount,
        totalGuests: totalAdultsCount + totalChildrenCount,
        totalRooms: totalRoomsCount,
        totalNights: overallNights,
        overallCheckInDate: overallCheckIn!,
        overallCheckOutDate: overallCheckOut!,
      };
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Please provide room details for Room Stay booking",
      });
    }

    let status: "Pending" | "Confirmed" | "Checked-In" = "Pending";
    if (advanceAmount > 0 && advanceAmount >= totals.roomTotal * 0.1) {
      status = "Confirmed";
    } else if (bookingType === "Corporate" || advanceAmount > 0) {
      status = "Confirmed";
    }

    // Resolve selected tax from tax-gst master
    let resolvedTaxPercent = 12;
    let taxGstId: mongoose.Types.ObjectId | undefined;
    if (selectedTaxId) {
      try {
        const taxGst = await TaxGst.findById(selectedTaxId).session(session);
        if (taxGst && taxGst.isActive) {
          resolvedTaxPercent = taxGst.percentage;
          taxGstId = taxGst._id as mongoose.Types.ObjectId;
        }
      } catch (err) {
        console.error("Error resolving selectedTaxId:", err);
      }
    }

    // Recalculate totals with the resolved tax percentage
    const addonTotal = Array.isArray(addons)
      ? addons.reduce((sum: number, a: any) => sum + (Number(a.total) || 0), 0)
      : 0;
    const taxAmount = Math.round(totals.roomTotal * resolvedTaxPercent) / 100;
    const grandTotalWithTax = totals.roomTotal + addonTotal + taxAmount;

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
          status: status ?? (advanceAmount > 0 ? "Confirmed" : "Pending"),
          source,
          externalBookingId,
          paymentStatus: advanceAmount > 0 ? "Partial" : "Pending",
          advanceAmount,
          pricingSummary: {
            roomTotal: totals.roomTotal,
            discountAmount: totals.discountAmount,
            taxAmount: taxAmount,
            taxPercentage: resolvedTaxPercent,
            grandTotal: grandTotalWithTax,
            paidAmount: advanceAmount,
            dueAmount: grandTotalWithTax - advanceAmount,
          },
          taxGstId,
          estimatedArrivalTime,
          pickupRequired: pickupRequired || false,
          vehicleDetails: vehicleDetails || [],
          addons: addons || [],
          preferences,
          internalNotes,
          specialRequests,
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
        resolvedTaxPercent
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

    if (status) filter.status = status;
    if (bookingType) filter.bookingType = bookingType;
    if (bookingCategory) filter.bookingCategory = bookingCategory;
    if (source) filter.source = source;
    if (customerId) filter.customerId = customerId;

    const [bookings, totalCount] = await Promise.all([
      Booking.find(filter)
        .populate("customerId", "name phone email")
        .populate("rooms.roomType", "name")
        .populate("rooms.roomId", "roomNumber")
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
      .populate("taxGstId", "name percentage type");

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
      source,
      status,
      corporateDetails,
      vehicleDetails,
      travelAgentInfo,
      preferences,
      internalNotes,
      specialRequests,
    } = req.body;

    const existingBooking = await Booking.findById(id);
    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    let updatedRooms: IBookedRoom[] | undefined = undefined;
    let totals: any = null;

    if (existingBooking.bookingCategory === "Day Access") {
      if (accessPackageId) existingBooking.accessPackageId = accessPackageId;
      if (visitDate) existingBooking.visitDate = new Date(visitDate);
      
      const pkg = await DayAccessPackage.findById(existingBooking.accessPackageId);
      const pkgPrice = pkg?.adult_price || 0;
      totals = await calculateBookingTotals(
        [],
        existingBooking.bookingType,
        corporateDetails || existingBooking.corporateDetails,
        "Day Access",
        pkgPrice,
        existingBooking.totalAdults,
        existingBooking.totalChildren
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
          
          const roomInfo = await Room.findById(room.roomId);
          const pricing = await calculateDateWisePricing(
            room.roomId,
            new Date(room.checkInDate),
            new Date(room.checkOutDate),
            roomInfo?.basePrice || 0,
            existingBooking.bookingType === "Corporate" ? corporateDetails?.negotiatedRate || existingBooking.corporateDetails?.negotiatedRate : undefined
          );

          validatedRooms.push({
            roomType: room.roomType || roomInfo?.roomType,
            roomId: room.roomId,
            checkInDate: room.checkInDate,
            checkOutDate: room.checkOutDate,
            adults: room.adults || 1,
            children: room.children || 0,
            pricePerNight: pricing.nightlyBreakdown[0]?.finalPrice || room.pricePerNight || roomInfo?.basePrice || 0,
            mealPlan: room.mealPlan || existingBooking.mealPlan,
          });
        }
        updatedRooms = validatedRooms;
        totals = await calculateBookingTotals(validatedRooms, existingBooking.bookingType, corporateDetails || existingBooking.corporateDetails);
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

          for (let i = 0; i < countNum; i++) {
            validatedRooms.push({
              roomType: new mongoose.Types.ObjectId(entry.roomTypeId),
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
        totals = {
          roomTotal,
          discountAmount: 0,
          taxAmount: 0,
          grandTotal: roomTotal,
          paidAmount: 0,
          dueAmount: roomTotal,
          totalAdults: totalAdultsCount,
          totalChildren: totalChildrenCount,
          totalGuests: totalAdultsCount + totalChildrenCount,
          totalRooms: totalRoomsCount,
          totalNights: overallNights,
          overallCheckInDate: overallCheckIn!,
          overallCheckOutDate: overallCheckOut!,
        };
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

    if (status && status !== existingBooking.status) {
      await transitionBookingState(
        existingBooking._id,
        status as any,
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
    if (addons) existingBooking.addons = addons;
  
    if (totals) {
      const existingTaxPercent = existingBooking.pricingSummary.taxPercentage || 12;
      const taxAmount = Math.round(totals.roomTotal * existingTaxPercent) / 100;
      const addonTotal = Array.isArray(existingBooking.addons) 
        ? existingBooking.addons.reduce((sum: number, a: any) => sum + (Number(a.total) || 0), 0)
        : 0;
      
      const grandTotal = totals.roomTotal + addonTotal + taxAmount;
      existingBooking.pricingSummary = {
        ...existingBooking.pricingSummary,
        roomTotal: totals.roomTotal,
        taxAmount,
        taxPercentage: existingTaxPercent,
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
        (req as any).user?._id
      );
    } else if (totals) {
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
      booking._id,
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
      .populate("rooms.roomId", "roomNumber roomType basePrice status")
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
    const availableRooms = rooms.filter(r => r.status === "Active").length;
    const occupiedRooms = roomTimelineData.filter(r => r.bookings.length > 0).length;
    const maintenanceRooms = rooms.filter(r => r.status === "Maintenance").length;
    const blockedRooms = rooms.filter(r => r.status === "Blocked").length;

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