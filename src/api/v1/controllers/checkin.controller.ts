import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { Room } from "../models/room.model";
import { Billing } from "../models/billing.model";
import { uploadFile } from "../services/cloudinary.service";
import { startOfDay, addDays, differenceInDays } from "date-fns";
import mongoose from "mongoose";
import fileUpload from "express-fileupload";

type UploadedFile = fileUpload.UploadedFile;
type UploadedFiles = { [key: string]: UploadedFile | UploadedFile[] };
import { sendNotificationToRole } from "../services/notification.service";
import DayAccessPackage from "../models/accessPackage.model";
import { TaxGst } from "../models/taxGst.model";

interface IPopulatedRoomType {
  _id: mongoose.Types.ObjectId;
  basePrice: number;
  name?: string;
}

export const processCheckIn = async (req: Request & { files?: UploadedFiles }, res: Response) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {

    const payload = typeof req.body.payload === "string"
      ? JSON.parse(req.body.payload)
      : req.body;

    const {
      bookingId,
      checkInType,
      roomSelections,
      corporateData,
      primaryGuest,
      guests,
      vehicleDetails,
      specialRequests,
      checkInTime,
      expectedCheckOutTime,
      generateGRC,
      advancePayments,
      totalAdvanceAmount,
      notes,
    } = payload;

    const files = req.files || {};

    const guestDocFiles: UploadedFile[] = [];
    if (files.guestDocuments) {
      if (Array.isArray(files.guestDocuments)) {
        guestDocFiles.push(...files.guestDocuments);
      } else {
        guestDocFiles.push(files.guestDocuments);
      }
    }

    let signedGRCFile: UploadedFile | null = null;
    if (files.signedGRC) {
      signedGRCFile = Array.isArray(files.signedGRC) ? files.signedGRC[0] : files.signedGRC;
    }


    const guestDocMap: Record<string, { public_id: string; secure_url: string }> = {};


    let guestDocIndices: number[] = [];
    const rawIndices = req.body.guestDocIndices;
    if (rawIndices) {
      guestDocIndices = typeof rawIndices === "string"
        ? JSON.parse(rawIndices)
        : rawIndices;
    }
    const parsedGuests = guests || (primaryGuest ? [primaryGuest] : []);

    for (let i = 0; i < guestDocFiles.length; i++) {
      const file = guestDocFiles[i];
      const guestIndex = guestDocIndices[i] ?? i;
      const guestId = parsedGuests[guestIndex]?.id || `guest_${guestIndex}`;

      try {
        const result = await uploadFile(file.tempFilePath, "guest-documents", file.mimetype);
        guestDocMap[guestId] = {
          public_id: result.public_id,
          secure_url: result.secure_url,
        };
      } catch (uploadErr) {
        console.error("Guest doc upload failed:", uploadErr);
        guestDocMap[guestId] = { public_id: "", secure_url: "" };
      }
    }


    let signedGRCData: { public_id: string; secure_url: string } | null = null;

    if (signedGRCFile && signedGRCFile.tempFilePath) {
      try {
        const result = await uploadFile(signedGRCFile.tempFilePath, "signed-grc", signedGRCFile.mimetype);
        signedGRCData = {
          public_id: result.public_id,
          secure_url: result.secure_url,
        };
      } catch (uploadErr) {
        console.error("Signed GRC upload failed:", uploadErr);
      }
    }

    const booking = await Booking.findById(bookingId).session(mongoSession);
    if (!booking) {
      throw new Error("Booking not found");
    }

    let selections = [];
    if (roomSelections) {
      selections = typeof roomSelections === 'string' ? JSON.parse(roomSelections) : roomSelections;
    } else if (booking.rooms && booking.rooms.length > 0) {
      selections = booking.rooms.map((r: any) => ({
        roomId: r.roomId,
        roomType: r.roomType,
        originalPrice: r.pricePerNight || 0,
        appliedPrice: r.pricePerNight || 0,
        hasExtraBed: r.hasExtraBed || false,
        extraBedCharge: r.extraBedCharge || 0,
      }));
    }

    const parsedPayments = advancePayments
      ? (typeof advancePayments === 'string' ? JSON.parse(advancePayments) : advancePayments)
      : [];

    const parsedCorporateData = corporateData
      ? (typeof corporateData === 'string' ? JSON.parse(corporateData) : corporateData)
      : {};

    const parsedVehicles = vehicleDetails || [];
    const parsedTotalAdvance = Number(totalAdvanceAmount || 0);

    const createdCheckIns = [];

    const grcNumber = `GRC-${Date.now().toString().slice(-6)}`;
    const checkInId = `CHK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

    const guestList = parsedGuests.map((g: any, idx: number) => {
      const guestId = g.id || `guest_${idx}`;
      const uploadedDoc = guestDocMap[guestId];

      // Check multiple sources for the document:
      // 1. Newly uploaded document (from this session)
      // 2. Document passed in the payload (existing document URL)
      // 3. Document already in DB (fallback)
      let finalDoc = { public_id: "", secure_url: "" };
      if (uploadedDoc?.secure_url) {
        finalDoc = uploadedDoc;
      } else if (g.idDocument?.secure_url && g.idDocument.secure_url.startsWith("http")) {
        // Document URL passed from frontend (existing document)
        finalDoc = g.idDocument;
      }

      return {
        name: g.name || "",
        mobileNo: g.mobileNo || "",
        idType: g.idType || "Aadhar Card",
        idNumber: g.idNumber || "",
        gender: g.gender || "",
        age: g.age ? Number(g.age) : undefined,
        nationality: g.nationality || "Indian",
        isPrimary: g.isPrimary || idx === 0,
        assignedRoomId: g.assignedRoomId
          ? new mongoose.Types.ObjectId(g.assignedRoomId)
          : undefined,
        idDocument: finalDoc,
      };
    });

    const checkInTimeVal = checkInTime ? new Date(checkInTime) : new Date();
    const checkOutTimeVal = expectedCheckOutTime
      ? new Date(expectedCheckOutTime)
      : (booking.rooms?.[0]?.checkOutDate || addDays(new Date(), 1));

    // Calculate nights for billing (Room Stay only)
    const isDayAccess = booking.bookingCategory === "Day Access";

    let nights = isDayAccess ? 1 : Math.max(1, differenceInDays(
      startOfDay(checkOutTimeVal),
      startOfDay(checkInTimeVal)
    ));

    // Fetch package details if Day Access
    let packageDetails: any = undefined;
    if (isDayAccess) {
      const accessPackage = booking.accessPackageId
        ? await DayAccessPackage.findById(booking.accessPackageId).lean()
        : null;
      if (accessPackage) {
        packageDetails = {
          packageId: accessPackage._id,
          packageName: accessPackage.packageName,
          packageType: accessPackage.packageType,
          entryTime: checkInTimeVal,
          exitTime: checkOutTimeVal,
        };
      }
    }

    // Build room details only for Room Stay bookings
    let roomDetails: any[] = [];
    const roomIds: string[] = [];

    if (!isDayAccess) {
      for (const sel of selections) {
        const roomId = sel.roomId || sel._id;
        if (!roomId) {
          throw new Error("All room slots must be assigned before check-in");
        }
        const roomInfo = await Room.findById(roomId).populate("roomType", "basePrice").session(mongoSession);

        roomDetails.push({
          roomId: new mongoose.Types.ObjectId(roomId),
          roomType: sel.roomType || roomInfo?.roomType,
          roomNumber: roomInfo?.roomNumber || sel.roomNumber || "",
          originalPrice: sel.originalPrice || sel.pricePerNight || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          appliedPrice: sel.appliedPrice || sel.pricePerNight || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          assignedAt: new Date(),
        });
        roomIds.push(roomId);
      }
    } else {
      // Day Access: process room selections as flat-priced add-ons
      for (const sel of selections) {
        const roomInfo = await Room.findById(sel.roomId || sel._id).populate("roomType", "basePrice").session(mongoSession);
        const roomId = sel.roomId || sel._id;

        roomDetails.push({
          roomId: new mongoose.Types.ObjectId(roomId),
          roomType: sel.roomType || roomInfo?.roomType,
          roomNumber: roomInfo?.roomNumber || sel.roomNumber || "",
          originalPrice: sel.originalPrice || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          appliedPrice: sel.appliedPrice || sel.originalPrice || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          assignedAt: new Date(),
        });
        roomIds.push(roomId);
      }
    }

    // Recalculate actual pricing from assigned rooms (Room Stay only)
    if (!isDayAccess && roomDetails.length > 0) {
      const actualRoomTotal = roomDetails.reduce(
        (sum: number, r: any) => sum + (r.appliedPrice || 0) * nights,
        0,
      );

      // Resolve tax percentage
      let taxPct = 12;
      if (booking.taxGstId) {
        try {
          const taxDoc = await TaxGst.findById(booking.taxGstId).session(mongoSession).lean() as any;
          if (taxDoc?.percentage) {
            taxPct = taxDoc.percentage;
          }
        } catch (_) { /* use default 12% */ }
      } else if ((booking.pricingSummary as any)?.taxPercentage) {
        taxPct = (booking.pricingSummary as any).taxPercentage;
      }

      const addonTotal = (booking.addons || []).reduce(
        (s: number, a: any) => s + (Number(a.total) || 0),
        0,
      );
      const actualTaxAmount = Math.round(actualRoomTotal * taxPct / 100);
      const actualGrandTotal = actualRoomTotal + actualTaxAmount + addonTotal;
      const paidSoFar = (booking.pricingSummary as any)?.paidAmount || 0;

      await Booking.updateOne(
        { _id: booking._id },
        {
          $set: {
            "pricingSummary.roomTotal": actualRoomTotal,
            "pricingSummary.taxAmount": actualTaxAmount,
            "pricingSummary.taxPercentage": taxPct,
            "pricingSummary.grandTotal": actualGrandTotal,
            "pricingSummary.dueAmount": Math.max(0, actualGrandTotal - paidSoFar),
          },
        },
        { session: mongoSession },
      );

      // Update local reference so paymentSummary below uses real values
      (booking.pricingSummary as any) = {
        ...(booking.pricingSummary as any),
        roomTotal: actualRoomTotal,
        taxAmount: actualTaxAmount,
        taxPercentage: taxPct,
        grandTotal: actualGrandTotal,
        dueAmount: Math.max(0, actualGrandTotal - paidSoFar),
      };
    }

    const grcDetails = generateGRC ? [{
      grcNumber,
      grcType: checkInType === "Corporate" ? "Corporate" : "Individual",
      generatedAt: new Date(),
      generatedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      isSigned: !!signedGRCData,
      signedPdfUrl: signedGRCData ? {
        public_id: signedGRCData.public_id || "",
        secure_url: signedGRCData.secure_url || "",
      } : undefined,
      signedAt: signedGRCData ? new Date() : undefined,
      signatureMethod: signedGRCData ? "Digital" : undefined,
    }] : [];

    const validPaymentModes = ["Cash", "UPI", "Card", "Bank Transfer", "Wallet", "Online"];

    const newCheckIn = new CheckIn({
      checkInId,
      bookingId: booking._id,
      bookingCategory: booking.bookingCategory || "Room Stay",
      checkInType: checkInType || "Individual",
      roomDetails,
      guests: guestList,
      checkInTime: checkInTimeVal,
      expectedCheckOutTime: checkOutTimeVal,
      status: "Active",
      stayType: "Original",
      paymentStatus: parsedTotalAdvance > 0
        ? (parsedTotalAdvance >= (booking.pricingSummary?.grandTotal || 0) ? "Paid" : "Partial")
        : "Pending",
      paymentSummary: {
        totalAmount: booking.pricingSummary?.grandTotal || 0,
        totalPaid: parsedTotalAdvance,
        dueAmount: (booking.pricingSummary?.grandTotal || 0) - parsedTotalAdvance,
        taxAmount: booking.pricingSummary?.taxAmount || 0,
      },
      payments: parsedPayments.map((p: any) => ({
        amount: p.amount,
        paymentMode: validPaymentModes.includes(p.paymentMode) ? p.paymentMode : "Cash",
        transactionId: p.transactionId || "",
        paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
        note: p.note || "",
      })),
      grcDetails,
      vehicleDetails: parsedVehicles,
      addons: (booking.addons || []).map((a: any) => ({
        name: a.serviceName,
        quantity: a.quantity,
        rate: a.rate,
        total: a.total,
      })),
      notes: notes || "",
      specialRequests: specialRequests || "",
      liabilityAccepted: true,
      termsAcceptedAt: new Date(),
      packageDetails: isDayAccess ? packageDetails : undefined,
      verificationChecklist: {
        primaryGuestVerified: guestList.some((g: any) => g.isPrimary && g.name),
        idUploaded: guestList.some((g: any) => g.idDocument?.secure_url),
        grcGenerated: !!generateGRC,
        paymentCollected: parsedTotalAdvance > 0,
        roomAssigned: !isDayAccess && roomDetails.length > 0,
      },
      activityLogs: [{
        action: "Check-in Created via Single-Call Process",
        performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
        timestamp: new Date(),
        details: `${checkInType || "Individual"} check-in. ${isDayAccess ? "Day Access" : selections.length + " room(s)"} checked in. ${parsedGuests.length} guest(s).`,
      }],
    });

    await newCheckIn.save({ session: mongoSession });
    createdCheckIns.push(newCheckIn);

    // For Day Access bookings, rooms may be empty/undefined — use optional chaining
    const totalBookedRooms = (booking.rooms?.length || 0);
    const totalCheckedRooms = createdCheckIns.reduce(
      (sum: number, item: any) => sum + (item.roomDetails?.length || 0),
      0
    );

    booking.status = isDayAccess ? "Checked-In" : (totalCheckedRooms >= totalBookedRooms ? "Checked-In" : booking.status);
    await booking.save({ session: mongoSession });

    // Update booking's paidAmount and dueAmount to include check-in payment
    if (parsedTotalAdvance > 0) {
      const bookingPaidBefore = (booking.pricingSummary as any)?.paidAmount || 0;
      const totalPaidNow = bookingPaidBefore + parsedTotalAdvance;
      const grandTotal = (booking.pricingSummary as any)?.grandTotal || 0;
      const newDue = Math.max(0, grandTotal - totalPaidNow);
      const newPaymentStatus = grandTotal > 0 && totalPaidNow >= grandTotal ? "Paid" : "Partial";

      await Booking.updateOne(
        { _id: booking._id },
        {
          $set: {
            "pricingSummary.paidAmount": totalPaidNow,
            "pricingSummary.dueAmount": newDue,
            paymentStatus: newPaymentStatus,
          },
        },
        { session: mongoSession },
      );
    }

    // Build room charges: for Room Stay use per-night, for Day Access use flat add-on price
    let roomChargesBreakdown: any[];
    let totalRoomCharges: number;

    if (isDayAccess) {
      // Day Access: rooms are optional add-ons with flat pricing
      roomChargesBreakdown = roomDetails.map((room: any) => ({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        checkInDate: checkInTimeVal,
        checkOutDate: checkOutTimeVal,
        nights: 1,
        ratePerNight: room.appliedPrice || 0,
        totalRoomCharge: room.appliedPrice || 0,
        stayType: "Original" as const,
      }));
      // Package price is the base, room add-ons are on top
      totalRoomCharges = (booking.pricingSummary?.roomTotal || booking.pricingSummary?.grandTotal || 0)
        + roomChargesBreakdown.reduce((sum: number, r: any) => sum + r.totalRoomCharge, 0);
    } else {
      roomChargesBreakdown = roomDetails.map((room: any) => {
        const rate = room.appliedPrice || 0;
        const totalCharge = nights * rate;
        return {
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          checkInDate: checkInTimeVal,
          checkOutDate: checkOutTimeVal,
          nights,
          ratePerNight: rate,
          totalRoomCharge: totalCharge,
          stayType: "Original" as const,
        };
      });
      totalRoomCharges = roomChargesBreakdown.reduce(
        (sum: number, r: any) => sum + r.totalRoomCharge,
        0
      );
    }

    const bookingAddonTotal = (booking.addons || []).reduce((s: number, a: any) => s + (Number(a.total) || 0), 0);

    let billing = await Billing.findOne({ bookingId: booking._id }).session(mongoSession);


    if (!billing) {
      const count = await Billing.countDocuments({}).session(mongoSession);
      billing = new Billing({
        invoiceNumber: `INV-${Date.now()}-${count + 1}`,
        invoiceType: isDayAccess ? "Day Access" : (checkInType === "Corporate" ? "Corporate" : "Room"),
        billingStatus: "Draft",
        settlementStatus: "Open",
        checkInId: newCheckIn._id,
        bookingId: booking._id,
        customerId: (booking.customerId as mongoose.Types.ObjectId) || new mongoose.Types.ObjectId(),
        isCorporateBill: checkInType === "Corporate",
        corporateDetails: checkInType === "Corporate" && parsedCorporateData ? {
          companyName: parsedCorporateData.companyName || "",
          companyGST: parsedCorporateData.companyGST || "",
          companyAddress: parsedCorporateData.companyAddress || "",
          contactPerson: parsedCorporateData.contactPersonName || "",
          contactEmail: parsedCorporateData.contactEmail || "",
        } : undefined,
        roomChargesBreakdown,
        totalRoomCharges,
        extraServices: (booking.addons || []).map((a: any) => ({
          serviceName: a.serviceName,
          quantity: a.quantity,
          rate: a.rate,
          total: a.total,
          date: new Date(),
        })),
        facilityCharges: [],
        packageCharges: [],
        otherCharges: 0,
        subTotal: totalRoomCharges + bookingAddonTotal,
        taxBreakdown: {
          cgst: (booking.pricingSummary?.taxAmount || 0) / 2,
          sgst: (booking.pricingSummary?.taxAmount || 0) / 2,
          serviceCharge: 0,
          cess: 0,
          totalTax: booking.pricingSummary?.taxAmount || 0,
        },
        discount: 0,
        grandTotal: totalRoomCharges + bookingAddonTotal + (booking.pricingSummary?.taxAmount || 0),
        paidAmount: parsedTotalAdvance,
        dueAmount: (totalRoomCharges + bookingAddonTotal + (booking.pricingSummary?.taxAmount || 0)) - parsedTotalAdvance,
        paymentStatus: parsedTotalAdvance > 0 ? "Partial" : "Unpaid",
        paymentModeSummary: {
          cash: parsedPayments.filter((p: any) => p.paymentMode === "Cash").reduce((s: number, p: any) => s + Number(p.amount), 0),
          upi: parsedPayments.filter((p: any) => p.paymentMode === "UPI").reduce((s: number, p: any) => s + Number(p.amount), 0),
          card: parsedPayments.filter((p: any) => p.paymentMode === "Card").reduce((s: number, p: any) => s + Number(p.amount), 0),
          bankTransfer: parsedPayments.filter((p: any) => p.paymentMode === "Bank Transfer").reduce((s: number, p: any) => s + Number(p.amount), 0),
          wallet: parsedPayments.filter((p: any) => p.paymentMode === "Wallet").reduce((s: number, p: any) => s + Number(p.amount), 0),
        },

        payments: parsedPayments.map((p: any) => ({
          amount: p.amount,
          paymentMode: validPaymentModes.includes(p.paymentMode) ? p.paymentMode : "Cash",
          transactionId: p.transactionId || "",
          paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
          note: p.note || "",
        })),
        billingNotes: [],
        activityLogs: [{
          action: "Billing Created on Check-in",
          performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
          timestamp: new Date(),
          details: `Check-in billing initiated. Advance: ₹${parsedTotalAdvance}`,
        }],
      });
    } else {
      billing.checkInId = newCheckIn._id;

      const existingRoomIds = billing.roomChargesBreakdown.map(r => r.roomId.toString());
      const newRoomCharges = roomChargesBreakdown.filter(
        r => !existingRoomIds.includes(r.roomId.toString())
      );

      if (newRoomCharges.length > 0) {
        billing.roomChargesBreakdown.push(...newRoomCharges);
        billing.totalRoomCharges = billing.roomChargesBreakdown.reduce(
          (sum: number, r: any) => sum + r.totalRoomCharge,
          0
        );
        billing.subTotal = billing.totalRoomCharges + billing.totalFacilityCharges;
        billing.grandTotal = billing.subTotal + billing.taxBreakdown.totalTax - billing.discount;
      }

      const newPayments = parsedPayments.filter((p: any, idx: number) => {
        return !billing!.payments.some((existing: any, existingIdx: number) => {
          // If payment has transactionId, match by that
          if (p.transactionId && existing.transactionId) {
            return existing.transactionId === p.transactionId;
          }
          // If payment has no transactionId, use index-based matching to avoid false positives
          // This ensures booking advance and check-in advance (both might have no TXN ID) don't false-match
          if (!p.transactionId && !existing.transactionId) {
            // Match only if same index position (booking advance is idx 0, check-in advance is idx 1)
            return existingIdx === idx;
          }
          // Mixed case - one has transactionId, one doesn't - don't match
          return false;
        });
      });

      if (newPayments.length > 0) {
        billing.payments.push(...newPayments.map((p: any) => ({
          amount: p.amount,
          paymentMode: validPaymentModes.includes(p.paymentMode) ? p.paymentMode : "Cash",
          transactionId: p.transactionId || "",
          paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
          note: p.note || "",
        })));

        billing.paidAmount = billing.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        billing.dueAmount = Math.max(0, billing.grandTotal - billing.paidAmount);
        billing.paymentStatus = billing.dueAmount <= 0 && billing.grandTotal > 0 ? "Paid"
          : billing.paidAmount > 0 ? "Partial" : "Unpaid";

        for (const payment of newPayments) {
          const mode = (payment.paymentMode || "Cash").toLowerCase().replace(" ", "");
          if (mode === "cash") billing.paymentModeSummary.cash += Number(payment.amount);
          else if (mode === "upi") billing.paymentModeSummary.upi += Number(payment.amount);
          else if (mode === "card") billing.paymentModeSummary.card += Number(payment.amount);
          else if (mode === "banktransfer") billing.paymentModeSummary.bankTransfer += Number(payment.amount);
          else if (mode === "wallet") billing.paymentModeSummary.wallet += Number(payment.amount);
          // Online mode doesn't map to any paymentModeSummary field, but we still track it in payments array
        }
      }

      billing.activityLogs.push({
        action: "Check-in Advance Added",
        performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
        timestamp: new Date(),
        details: `Added advance payment: ₹${parsedTotalAdvance}`,
      });
    }

    await billing.save({ session: mongoSession });

    // Notification: check-in completed (skip room-specific notification for Day Access)
    if (!isDayAccess) {
      try {
        const roomNumbers = roomDetails.map((r: any) => r.roomNumber).join(", ");
        await sendNotificationToRole(
          "Housekeeping",
          "housekeeping",
          "Check-in Completed",
          `Guest checked in at Room(s) ${roomNumbers}. Prepare for next checkout.`,
          newCheckIn._id,
          "CheckIn"
        );
      } catch (notifErr) {
        console.error("Failed to send checkin notification:", notifErr);
      }
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    return res.status(201).json({
      success: true,
      message: "Check-In Completed Successfully",
      data: {
        checkIn: createdCheckIns,
        billing: {
          _id: billing._id,
          invoiceNumber: billing.invoiceNumber,
          paymentStatus: billing.paymentStatus,
          grandTotal: billing.grandTotal,
          paidAmount: billing.paidAmount,
          dueAmount: billing.dueAmount,
        },
      },
    });

  } catch (error: any) {

    await mongoSession.abortTransaction();
    mongoSession.endSession();

    console.error("Check-in Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Check-in failed!",
    });
  }
};

// ============================================================
// GET CHECK-IN LIST
// ============================================================
export const getCheckInList = async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      dateType = "checkIn",
      roomType,
      roomId,
      checkInType,
      status,
      search,
      page = 1,
      limit = 10,
      quickFilter,
      bookingCategory,
      paymentStatus,
      isBilled,
      stayType,
      grcSignedStatus,
      guestVerificationStatus,
      idVerificationStatus,
      roomNumber,
      vehicleNumber,
      checkInId,
      bookingId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const andConditions: any[] = [];

    // 1. Room / Room Type Filters
    if (roomId) {
      andConditions.push({ "roomDetails.roomId": new mongoose.Types.ObjectId(roomId as string) });
    } else if (roomType) {
      const roomsUnderType = await Room.find({ roomType: roomType as any }).select("_id").lean();
      const roomIdsUnderType = roomsUnderType.map(r => r._id);
      andConditions.push({ "roomDetails.roomId": { $in: roomIdsUnderType } });
    }

    // 2. Core Filters
    if (checkInType) {
      andConditions.push({ checkInType });
    }
    if (status) {
      andConditions.push({ status });
    }
    if (bookingCategory) {
      andConditions.push({ bookingCategory });
    }
    if (paymentStatus) {
      andConditions.push({ paymentStatus });
    }
    if (isBilled !== undefined) {
      const isBilledBool = isBilled === "true" || (isBilled as any) === true;
      andConditions.push({ isBilled: isBilledBool });
    }
    if (stayType) {
      andConditions.push({ stayType });
    }

    // 3. GRC Signed Status
    if (grcSignedStatus) {
      if (grcSignedStatus === "signed") {
        andConditions.push({ "grcDetails.isSigned": true });
      } else if (grcSignedStatus === "unsigned") {
        andConditions.push({ "grcDetails.isSigned": { $ne: true } });
      }
    }

    // 4. Guest Verification Status
    const verificationStatus = guestVerificationStatus || idVerificationStatus;
    if (verificationStatus) {
      andConditions.push({ "guests.idVerificationStatus": verificationStatus });
    }

    // 5. Room Number & Vehicle Number Filters
    if (roomNumber) {
      andConditions.push({ "roomDetails.roomNumber": { $regex: roomNumber as string, $options: "i" } });
    }
    if (vehicleNumber) {
      andConditions.push({ "vehicleDetails.vehicleNumber": { $regex: vehicleNumber as string, $options: "i" } });
    }

    // 6. Check-in ID & Booking ID Filters
    if (checkInId) {
      andConditions.push({ checkInId: { $regex: checkInId as string, $options: "i" } });
    }
    if (bookingId) {
      if (mongoose.Types.ObjectId.isValid(bookingId as string)) {
        andConditions.push({ bookingId: new mongoose.Types.ObjectId(bookingId as string) });
      } else {
        const matchedBookings = await Booking.find({ bookingId: { $regex: bookingId as string, $options: "i" } })
          .select("_id")
          .lean();
        const bookingIds = matchedBookings.map(b => b._id);
        andConditions.push({ bookingId: { $in: bookingIds } });
      }
    }

    // 7. Date Filters & Quick Date Filters
    let start: Date | undefined;
    let end: Date | undefined;

    if (quickFilter) {
      const now = new Date();
      if (quickFilter === "today") {
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else if (quickFilter === "tomorrow") {
        start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setDate(end.getDate() + 1);
        end.setHours(23, 59, 59, 999);
      } else if (quickFilter === "thisWeek") {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      } else if (quickFilter === "upcomingCheckout") {
        andConditions.push({ status: "Active" });
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setDate(end.getDate() + 1);
        end.setHours(23, 59, 59, 999);
      } else if (quickFilter === "inHouse") {
        andConditions.push({ status: "Active" });
      }
    } else if (startDate || endDate) {
      start = startDate ? new Date(startDate as string) : new Date();
      start.setHours(0, 0, 0, 0);
      end = endDate ? new Date(endDate as string) : new Date();
      end.setHours(23, 59, 59, 999);
    }

    if (start && end && quickFilter !== "inHouse") {
      const targetDateType = quickFilter === "upcomingCheckout" ? "expectedCheckout" : dateType;

      if (targetDateType === "checkIn") {
        andConditions.push({ checkInTime: { $gte: start, $lte: end } });
      } else if (targetDateType === "expectedCheckout") {
        andConditions.push({ expectedCheckOutTime: { $gte: start, $lte: end } });
      } else if (targetDateType === "actualCheckout") {
        andConditions.push({ actualCheckOutTime: { $gte: start, $lte: end } });
      } else if (targetDateType === "anyCheckout") {
        andConditions.push({
          $or: [
            { actualCheckOutTime: { $gte: start, $lte: end } },
            { expectedCheckOutTime: { $gte: start, $lte: end } }
          ]
        });
      }
    }

    // 8. Global Search
    if (search) {
      const searchRegex = { $regex: search as string, $options: "i" };
      const searchOrs: any[] = [
        { checkInId: searchRegex },
        { "guests.name": searchRegex },
        { "guests.mobileNo": searchRegex },
        { "corporateCheckInDetails.companyName": searchRegex },
        { "corporateCheckInDetails.contactMobile": searchRegex },
        { "corporateCheckInDetails.contactPersonName": searchRegex },
        { "roomDetails.roomNumber": searchRegex },
        { "vehicleDetails.vehicleNumber": searchRegex }
      ];

      // Support search matching booking code string
      const matchedBookingsForSearch = await Booking.find({ bookingId: searchRegex })
        .select("_id")
        .lean();
      if (matchedBookingsForSearch.length > 0) {
        searchOrs.push({ bookingId: { $in: matchedBookingsForSearch.map(b => b._id) } });
      }

      andConditions.push({ $or: searchOrs });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

    // 9. Sorting & Execution
    const sortField = (sortBy as string) || "createdAt";
    const sortDir = (sortOrder as string) === "asc" ? 1 : -1;
    const sortObj = { [sortField]: sortDir };

    const list = await CheckIn.find(query)
      .populate({
        path: "bookingId",
        select: "bookingId bookingCategory bookingType status paymentStatus pricingSummary bookingContact mealPlan source externalBookingId accessPackageId"
      })
      .populate({
        path: "roomDetails.roomId",
        select: "roomNumber status roomType"
      })
      .populate({
        path: "roomDetails.roomType",
        select: "name basePrice"
      })
      .sort(sortObj as any)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const totalCount = await CheckIn.countDocuments(query);

    // 10. Advanced Aggregated Statistics
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const statsFacet = await CheckIn.aggregate([
      {
        $facet: {
          todayTotal: [
            {
              $match: {
                checkInTime: { $gte: todayStart, $lte: todayEnd }
              }
            },
            { $count: "count" }
          ],
          activeStats: [
            {
              $match: {
                status: "Active"
              }
            },
            {
              $group: {
                _id: null,
                activeCheckinsCount: { $sum: 1 },
                activeGuestsCount: { $sum: { $size: { $ifNull: ["$guests", []] } } },
                occupiedRoomsCount: { $sum: { $size: { $ifNull: ["$roomDetails", []] } } },
                totalPendingDues: { $sum: { $ifNull: ["$paymentSummary.dueAmount", 0] } }
              }
            }
          ],
          expectedCheckoutsToday: [
            {
              $match: {
                status: "Active",
                expectedCheckOutTime: { $gte: todayStart, $lte: todayEnd }
              }
            },
            { $count: "count" }
          ]
        }
      }
    ]);

    const todayCheckins = statsFacet[0]?.todayTotal?.[0]?.count || 0;
    const activeStats = statsFacet[0]?.activeStats?.[0] || {
      activeCheckinsCount: 0,
      activeGuestsCount: 0,
      occupiedRoomsCount: 0,
      totalPendingDues: 0
    };
    const expectedCheckouts = statsFacet[0]?.expectedCheckoutsToday?.[0]?.count || 0;

    res.status(200).json({
      success: true,
      data: list,
      pagination: {
        totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
      stats: {
        todayCheckins,
        activeGuests: activeStats.activeCheckinsCount, // backwards compatible count of active checkins
        expectedCheckouts,
        occupiedRooms: activeStats.occupiedRoomsCount,
        pendingDues: activeStats.totalPendingDues,
        totalInHouseGuests: activeStats.activeGuestsCount
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// EXTEND STAY
// ============================================================
export const extendStay = async (req: Request, res: Response) => {
  try {
    const {
      checkInId,
      newExpectedCheckout,
      newRoomId,
      appliedPrice,
      roomNumber,
      newAdvanceAmount,
      paymentMode,
      transactionId,
      advanceNote
    } = req.query;

    const checkIn = await CheckIn.findById(checkInId);
    if (!checkIn) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    const oldCheckoutDate = checkIn.expectedCheckOutTime;
    checkIn.expectedCheckOutTime = new Date(newExpectedCheckout as string);
    checkIn.stayType = "Extended";

    const roomNumberStr = roomNumber as string;

    if (newRoomId) {
      const roomObjectId = new mongoose.Types.ObjectId(newRoomId as string);
      const isAlreadyAdded = checkIn.roomDetails.some(r => r.roomId.toString() === newRoomId);

      if (!isAlreadyAdded) {
        const roomInfo = await Room.findById(newRoomId).populate("roomType", "basePrice");
        checkIn.roomDetails.push({
          roomId: roomObjectId,
          roomType: roomInfo?.roomType as any,
          roomNumber: (roomNumberStr || roomInfo?.roomNumber || "") as string,
          originalPrice: (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          appliedPrice: Number(appliedPrice) || (roomInfo?.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
          assignedAt: new Date(),
        });
      }
    }

    if (Number(newAdvanceAmount) > 0) {
      const paymentEntry = {
        amount: Number(newAdvanceAmount),
        paymentMode: (paymentMode as any) || "Cash",
        transactionId: (transactionId as string) || "",
        paidAt: new Date(),
        note: (advanceNote as string) || `Stay extended to ${newExpectedCheckout}`
      };

      checkIn.payments.push(paymentEntry);
      checkIn.totalAdvanceAmount = (checkIn.totalAdvanceAmount || 0) + Number(newAdvanceAmount);
    }

    checkIn.notes = (checkIn.notes || "") +
      `\n[Update]: Extended from ${oldCheckoutDate.toLocaleString()} to ${newExpectedCheckout}. Additional Advance: ₹${newAdvanceAmount || 0}`;

    await checkIn.save();

    // Update billing as well
    const billing = await Billing.findOne({ checkInId: checkIn._id });
    if (billing && Number(newAdvanceAmount) > 0) {
      billing.payments.push({
        amount: Number(newAdvanceAmount),
        paymentMode: (paymentMode as any) || "Cash",
        transactionId: (transactionId as string) || "",
        paidAt: new Date(),
        note: (advanceNote as string) || "Stay extension advance",
      });
      billing.paidAmount = billing.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      billing.dueAmount = Math.max(0, billing.grandTotal - billing.paidAmount);
      billing.paymentStatus = billing.dueAmount <= 0 ? "Paid" : "Partial";
      await billing.save();
    }

    // Notification: stay extended
    try {
      const roomNumbers = checkIn.roomDetails.map((r: any) => r.roomNumber).join(", ");
      await sendNotificationToRole(
        "Reception",
        "booking",
        "Stay Extended",
        `Stay extended in Room(s) ${roomNumbers}. New checkout: ${new Date(newExpectedCheckout as string).toLocaleDateString()}. Additional advance: ₹${newAdvanceAmount || 0}.`,
        checkIn._id,
        "CheckIn"
      );
    } catch (notifErr) {
      console.error("Failed to send extend stay notification:", notifErr);
    }

    res.status(200).json({
      success: true,
      message: "Stay extended and payment history updated successfully",
      data: checkIn
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET CHECK-IN BY ID
// ============================================================
export const getCheckInById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const checkIn = await CheckIn.findById(id)
      .populate({
        path: "bookingId",
        select: "bookingId bookingCategory bookingType status paymentStatus pricingSummary bookingContact mealPlan source externalBookingId rooms accessPackageId"
      })
      .populate({
        path: "roomDetails.roomId",
        select: "roomNumber status roomType floor wing"
      })
      .populate({
        path: "roomDetails.roomType",
        select: "name basePrice"
      })
      .lean();

    if (!checkIn) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    const billing = await Billing.findOne({ checkInId: id }).lean();

    res.status(200).json({
      success: true,
      data: {
        ...checkIn,
        billing: billing || null
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// UPDATE CHECK-IN
// ============================================================
export const updateCheckIn = async (req: Request & { files?: UploadedFiles }, res: Response) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const { id } = req.params;

    const payload = typeof req.body.payload === "string"
      ? JSON.parse(req.body.payload)
      : req.body;

    const {
      guests,
      primaryGuest,
      vehicleDetails,
      specialRequests,
      checkInTime,
      expectedCheckOutTime,
      notes,
      corporateData,
      roomDetails,
      isReplaceVehicles,
    } = payload;

    const files = req.files || {};

    const existingCheckIn = await CheckIn.findById(id).session(mongoSession);
    if (!existingCheckIn) {
      throw new Error("Check-in not found");
    }

    const guestDocFiles: UploadedFile[] = [];
    if (files.guestDocuments) {
      if (Array.isArray(files.guestDocuments)) {
        guestDocFiles.push(...files.guestDocuments);
      } else {
        guestDocFiles.push(files.guestDocuments);
      }
    }

    const guestDocMap: Record<string, { public_id: string; secure_url: string }> = {};

    let guestDocIndices: number[] = [];
    const rawIndices = req.body.guestDocIndices;
    if (rawIndices) {
      guestDocIndices = typeof rawIndices === "string"
        ? JSON.parse(rawIndices)
        : rawIndices;
    }

    const parsedGuests = guests || (primaryGuest ? [primaryGuest] : []);

    for (let i = 0; i < guestDocFiles.length; i++) {
      const file = guestDocFiles[i];
      const guestIndex = guestDocIndices[i] ?? i;
      const guestId = parsedGuests[guestIndex]?.id || `guest_${guestIndex}`;

      try {
        const result = await uploadFile(file.tempFilePath, "guest-documents", file.mimetype);
        guestDocMap[guestId] = {
          public_id: result.public_id,
          secure_url: result.secure_url,
        };
      } catch (uploadErr) {
        console.error("Guest doc upload failed:", uploadErr);
        guestDocMap[guestId] = { public_id: "", secure_url: "" };
      }
    }

    if (parsedGuests.length > 0) {
      const updatedGuests = parsedGuests.map((g: any, idx: number) => {
        const guestId = g.id || `guest_${idx}`;
        const uploadedDoc = guestDocMap[guestId];
        const existingGuest = existingCheckIn.guests.find(
          (eg: any) => eg._id?.toString() === g.id || eg.name === g.name
        );

        // Determine final document:
        // 1. New upload takes priority
        // 2. Document passed from frontend (existing URL) takes next priority
        // 3. Existing document in DB as fallback
        let finalIdDocument = existingGuest?.idDocument || { public_id: "", secure_url: "" };
        if (uploadedDoc?.secure_url) {
          finalIdDocument = { public_id: uploadedDoc.public_id, secure_url: uploadedDoc.secure_url };
        } else if (g.idDocument?.secure_url && g.idDocument.secure_url.startsWith("http")) {
          // Frontend is passing back the existing document URL
          finalIdDocument = g.idDocument;
        }

        return {
          _id: (existingGuest as any)?._id || new mongoose.Types.ObjectId(), // Preserve existing _id
          name: g.name || existingGuest?.name || "",
          mobileNo: g.mobileNo || existingGuest?.mobileNo || "",
          idType: g.idType || existingGuest?.idType || "Aadhar Card",
          idNumber: g.idNumber || existingGuest?.idNumber || "",
          gender: g.gender || existingGuest?.gender || "",
          age: g.age ? Number(g.age) : existingGuest?.age,
          nationality: g.nationality || existingGuest?.nationality || "Indian",
          isPrimary: g.isPrimary || idx === 0,
          assignedRoomId: g.assignedRoomId
            ? new mongoose.Types.ObjectId(g.assignedRoomId)
            : existingGuest?.assignedRoomId,
          idDocument: finalIdDocument,
          relationship: g.relationship || existingGuest?.relationship || "",
          dateOfBirth: g.dateOfBirth ? new Date(g.dateOfBirth) : existingGuest?.dateOfBirth,
          livePhoto: existingGuest?.livePhoto,
          ocrVerification: existingGuest?.ocrVerification,
          idVerificationStatus: existingGuest?.idVerificationStatus || "Pending",
        };
      });
      existingCheckIn.guests = updatedGuests;
    }

    if (checkInTime) {
      existingCheckIn.checkInTime = new Date(checkInTime);
    }
    if (expectedCheckOutTime) {
      existingCheckIn.expectedCheckOutTime = new Date(expectedCheckOutTime);
    }

    if (notes !== undefined) {
      existingCheckIn.notes = notes;
    }
    if (specialRequests !== undefined) {
      existingCheckIn.specialRequests = specialRequests;
    }

    // Always update vehicle details when provided in edit mode
    if (vehicleDetails !== undefined) {
      const parsedVehicles = typeof vehicleDetails === "string"
        ? JSON.parse(vehicleDetails)
        : vehicleDetails;
      // Only save vehicles that have at least a vehicle number
      const validVehicles = parsedVehicles.filter((v: any) => v.vehicleNumber && v.vehicleNumber.trim() !== "");
      existingCheckIn.vehicleDetails = validVehicles;
    }

    if (roomDetails) {
      const parsedRooms = typeof roomDetails === "string"
        ? JSON.parse(roomDetails)
        : roomDetails;
      existingCheckIn.roomDetails = parsedRooms.map((r: any) => ({
        roomId: new mongoose.Types.ObjectId(r.roomId),
        roomType: r.roomType ? new mongoose.Types.ObjectId(r.roomType) : undefined,
        roomNumber: r.roomNumber || "",
        originalPrice: r.originalPrice || 0,
        appliedPrice: r.appliedPrice || r.originalPrice || 0,
        assignedAt: new Date(),
      }));
    }

    if (corporateData && existingCheckIn.checkInType === "Corporate") {
      const parsedCorp = typeof corporateData === "string"
        ? JSON.parse(corporateData)
        : corporateData;
      existingCheckIn.corporateCheckInDetails = {
        ...existingCheckIn.corporateCheckInDetails,
        ...parsedCorp,
      };
    }

    existingCheckIn.verificationChecklist = {
      primaryGuestVerified: existingCheckIn.guests.some((g: any) => g.isPrimary && g.name),
      idUploaded: existingCheckIn.guests.some((g: any) => g.idDocument?.secure_url),
      grcGenerated: existingCheckIn.grcDetails?.length > 0,
      paymentCollected: existingCheckIn.payments?.length > 0,
      roomAssigned: existingCheckIn.roomDetails?.length > 0,
    };

    existingCheckIn.activityLogs.push({
      action: "Check-in Updated",
      performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      details: "Check-in details updated via edit mode",
    });

    await existingCheckIn.save({ session: mongoSession });

    if (roomDetails) {
      const billing = await Billing.findOne({ checkInId: existingCheckIn._id }).session(mongoSession);
      if (billing) {
        const checkInTimeVal = existingCheckIn.checkInTime;
        const checkOutTimeVal = existingCheckIn.expectedCheckOutTime;
        const nights = Math.max(1, differenceInDays(
          startOfDay(checkOutTimeVal),
          startOfDay(checkInTimeVal)
        ));

        const roomChargesBreakdown = existingCheckIn.roomDetails.map((room: any) => ({
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          checkInDate: checkInTimeVal,
          checkOutDate: checkOutTimeVal,
          nights,
          ratePerNight: room.appliedPrice || 0,
          totalRoomCharge: nights * (room.appliedPrice || 0),
          stayType: "Original" as const,
        }));

        billing.roomChargesBreakdown = roomChargesBreakdown;
        billing.totalRoomCharges = roomChargesBreakdown.reduce(
          (sum: number, r: any) => sum + r.totalRoomCharge,
          0
        );
        billing.subTotal = billing.totalRoomCharges + billing.totalFacilityCharges;
        billing.grandTotal = billing.subTotal + billing.taxBreakdown.totalTax - billing.discount;
        billing.dueAmount = Math.max(0, billing.grandTotal - billing.paidAmount);
        billing.paymentStatus = billing.dueAmount <= 0 && billing.grandTotal > 0 ? "Paid"
          : billing.paidAmount > 0 ? "Partial" : "Unpaid";

        billing.activityLogs.push({
          action: "Billing Updated on Check-in Edit",
          performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
          timestamp: new Date(),
          details: "Room details updated, billing recalculated",
        });

        await billing.save({ session: mongoSession });
      }
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    return res.status(200).json({
      success: true,
      message: "Check-in updated successfully",
      data: existingCheckIn,
    });

  } catch (error: any) {
    await mongoSession.abortTransaction();
    mongoSession.endSession();

    console.error("Update Check-in Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Update failed!",
    });
  }
};

// ============================================================
// GET STAY OVERVIEW
// ============================================================
export const getStayOverview = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to date required",
      });
    }

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);

    // All rooms
    const rooms = await Room.find()
      .populate("roomType", "name")
      .sort({ roomNumber: 1 });

    // Active check-ins
    const checkins = await CheckIn.find({
      status: "Active",
      checkInTime: { $lt: endDate },
      expectedCheckOutTime: { $gt: startDate },
    })
      .populate("guests")
      .populate("roomDetails.roomId", "roomNumber")
      .populate("roomDetails.roomType", "name");

    // Group by room type
    const grouped: any = {};

    for (const room of rooms) {
      const typeName = (room as any).roomType?.name || "Other";
      if (!grouped[typeName]) {
        grouped[typeName] = [];
      }
      grouped[typeName].push({
        id: room._id,
        roomNumber: room.roomNumber,
        status: room.status,
        isClean: room.status === "Active",
        bookings: [],
      });
    }

    // Push booking blocks
    for (const ci of checkins) {
      for (const rd of ci.roomDetails || []) {
        const roomId = (rd.roomId as any)?._id?.toString() || rd.roomId?.toString();
        const typeName = (rd.roomType as any)?.name || "Other";
        const targetRoom = grouped[typeName]?.find((r: any) => r.id.toString() === roomId);

        if (targetRoom) {
          targetRoom.bookings.push({
            id: ci._id,
            guest: ci.guests?.[0]?.name || "Guest",
            phone: ci.guests?.[0]?.mobileNo || "",
            start: ci.checkInTime,
            end: ci.expectedCheckOutTime,
            color: "red",
            status: ci.status,
            price: rd.appliedPrice || 0,
            roomNumber: rd.roomNumber || (rd.roomId as any)?.roomNumber || "",
            roomType: (rd.roomType as any)?._id?.toString() || rd.roomType?.toString() || "",
            totalAdvanceAmount: ci.totalAdvanceAmount || 0,
          });
        }
      }
    }

    const data = Object.keys(grouped).map((key) => ({
      category: key,
      rooms: grouped[key],
    }));

    return res.status(200).json({
      success: true,
      data,
    });

  } catch (error: any) {
    console.error("getStayOverview error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// ROOM CHANGE
// ============================================================
export const roomChange = async (req: Request, res: Response) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const { id } = req.params;
    const { newRoomId, newRoomType, effectiveDate } = req.body;

    const checkIn = await CheckIn.findById(id).session(mongoSession);
    if (!checkIn) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    const currentRoomDetail = checkIn.roomDetails?.[0];
    if (!currentRoomDetail) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(400).json({ success: false, message: "No room details found" });
    }

    const bookingStart = new Date(checkIn.checkInTime);
    const bookingEnd = new Date(checkIn.expectedCheckOutTime);

    const conflict = await CheckIn.findOne({
      _id: { $ne: checkIn._id },
      status: "Active",
      "roomDetails.roomId": new mongoose.Types.ObjectId(newRoomId),
      $or: [
        {
          checkInTime: { $lt: bookingEnd },
          expectedCheckOutTime: { $gt: bookingStart },
        },
      ],
    }).session(mongoSession);

    if (conflict) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(400).json({
        success: false,
        message: "Room is not available for the booking period",
      });
    }

    const bookingConflict = await Booking.findOne({
      status: { $in: ["Pending", "Confirmed", "Checked-In"] },
      "rooms.roomId": new mongoose.Types.ObjectId(newRoomId),
      $or: [
        {
          "rooms.checkInDate": { $lt: bookingEnd },
          "rooms.checkOutDate": { $gt: bookingStart },
        },
      ],
    }).session(mongoSession);

    if (bookingConflict) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(400).json({
        success: false,
        message: "Room is not available for the booking period",
      });
    }

    const newRoom = await Room.findById(newRoomId).populate("roomType", "basePrice").session(mongoSession);
    if (!newRoom) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ success: false, message: "Room not found" });
    }

    const roomTypeId = newRoomType
      ? new mongoose.Types.ObjectId(newRoomType)
      : (newRoom.roomType as mongoose.Types.ObjectId);

    const nights = Math.max(
      1,
      differenceInDays(startOfDay(bookingEnd), startOfDay(bookingStart))
    );

    const newRoomBasePrice = (newRoom.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0;

    checkIn.roomDetails = [
      {
        roomId: new mongoose.Types.ObjectId(newRoomId),
        roomType: roomTypeId,
        roomNumber: newRoom.roomNumber,
        originalPrice: newRoomBasePrice,
        appliedPrice: newRoomBasePrice,
        assignedAt: new Date(),
      },
    ];

    checkIn.activityLogs.push({
      action: "Room Changed",
      performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      details: `Room changed from ${currentRoomDetail.roomNumber} to ${newRoom.roomNumber} (${currentRoomDetail.appliedPrice} → ${newRoomBasePrice})`,
    });

    await checkIn.save({ session: mongoSession });

    const billing = await Billing.findOne({ checkInId: checkIn._id }).session(mongoSession);
    if (billing) {
      const oldRoomNights = Math.max(
        1,
        differenceInDays(
          startOfDay(effectiveDate ? new Date(effectiveDate) : bookingStart),
          startOfDay(bookingStart)
        )
      );

      // Closing entry for old room (prepend — audit trail preserved)
      const closingEntry = {
        roomId: currentRoomDetail.roomId,
        roomNumber: currentRoomDetail.roomNumber,
        checkInDate: bookingStart,
        checkOutDate: effectiveDate ? new Date(effectiveDate) : bookingStart,
        nights: oldRoomNights,
        ratePerNight: currentRoomDetail.appliedPrice || 0,
        totalRoomCharge: oldRoomNights * (currentRoomDetail.appliedPrice || 0),
        stayType: "Original" as const,
      };

      // New room entry appended
      const newRoomEntry = {
        roomId: new mongoose.Types.ObjectId(newRoomId),
        roomNumber: newRoom.roomNumber,
        checkInDate: effectiveDate ? new Date(effectiveDate) : bookingStart,
        checkOutDate: bookingEnd,
        nights: 0,
        ratePerNight: newRoomBasePrice,
        totalRoomCharge: 0,
        stayType: "Transferred" as const,
      };

      billing.roomChargesBreakdown = [closingEntry, newRoomEntry];
      billing.totalRoomCharges = billing.roomChargesBreakdown.reduce(
        (sum: number, r: any) => sum + r.totalRoomCharge,
        0
      );
      billing.subTotal = billing.totalRoomCharges + (billing.totalFacilityCharges || 0);
      billing.grandTotal = billing.subTotal + billing.taxBreakdown.totalTax - billing.discount;
      billing.dueAmount = Math.max(0, billing.grandTotal - billing.paidAmount);

      billing.activityLogs.push({
        action: "Billing Updated on Room Change",
        performedBy: (req as any).user?._id || new mongoose.Types.ObjectId(),
        timestamp: new Date(),
        details: `Room changed: billing recalculated at ₹${newRoomBasePrice}/night`,
      });

      await billing.save({ session: mongoSession });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    return res.status(200).json({
      success: true,
      message: "Room changed successfully",
      data: checkIn,
    });

  } catch (error: any) {
    await mongoSession.abortTransaction();
    mongoSession.endSession();
    console.error("roomChange error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};