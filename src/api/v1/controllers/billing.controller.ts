import { Request, Response } from "express";
import mongoose from "mongoose";
import { CheckIn } from "../models/checkin.model";
import { Billing } from "../models/billing.model";
import { Room } from "../models/room.model";
import { Booking } from "../models/booking.model";
import { Customer } from "../models/customer.model";
import { PaymentLedger } from "../models/paymentLedger.model";
import { recordCharge, recordPayment, getComputedPaidAmount } from "../services/paymentLedger.service";
import { recordGstEntry } from "../services/gstLedger.service";
import { PaymentMode } from "../models/paymentLedger.model";
import { sendNotificationToRole } from "../services/notification.service";

import { differenceInDays, startOfDay } from "date-fns";



export const processCheckout = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      checkInId,
      extraServices,
      restaurantCharges,
      facilityCharges,
      discount,
      taxPercentage,
      notes,
      isCheckout,
      payment,
    } = req.body;

    const checkInData = await CheckIn.findById(checkInId).session(session);
    if (!checkInData) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    const checkInDate = new Date(checkInData.checkInTime);
    const checkOutDate = isCheckout ? new Date() : new Date(checkInData.expectedCheckOutTime);

    let nights = differenceInDays(startOfDay(checkOutDate), startOfDay(checkInDate));
    if (nights <= 0) nights = 1;

    const roomChargesBreakdown = checkInData.roomDetails.map((room: any) => {
      const rate = room.appliedPrice || 0;
      const totalCharge = nights * rate;
      return {
        roomId: room.roomId._id || room.roomId,
        roomNumber: room.roomNumber,
        roomType: room.roomType?.name || "Standard",
        checkInDate: checkInData.checkInTime,
        checkOutDate: checkOutDate,
        nights,
        ratePerNight: rate,
        totalRoomCharge: totalCharge,
        stayType: checkInData.stayType || "Original",
      };
    });

    const totalRoomCharges = roomChargesBreakdown.reduce(
      (acc, r) => acc + r.totalRoomCharge, 0
    );

    const servicesTotal = (extraServices || []).reduce((acc: number, s: any) => acc + (Number(s.total) || 0), 0);
    const facilitiesTotal = (facilityCharges || []).reduce((acc: number, f: any) => acc + (Number(f.totalFacilityCharge) || 0), 0);
    const subTotal = totalRoomCharges + servicesTotal + facilitiesTotal + Number(restaurantCharges || 0);
    const taxAmt = parseFloat(((subTotal * Number(taxPercentage || 0)) / 100).toFixed(2));
    const grandTotal = parseFloat((subTotal + taxAmt - Number(discount || 0)).toFixed(2));
    const advanceDeducted = checkInData.paymentSummary?.totalPaid || checkInData.totalAdvanceAmount || 0;
    const netPayable = parseFloat(Math.max(0, grandTotal - advanceDeducted).toFixed(2));

    let bill = await Billing.findOne({
      bookingId: checkInData.bookingId,
    }).session(session);

    let isNewBill = false;
    if (!bill) {
      isNewBill = true;
      const count = await Billing.countDocuments().session(session);
      const invoiceNumber = `INV-${Date.now()}-${count + 1}`;
      bill = new Billing({
        invoiceNumber,
        checkInId,
        customerId: (checkInData.guests?.[0] as any)?._id || checkInData._id,
        bookingId: checkInData.bookingId || undefined,
        roomChargesBreakdown,
        totalRoomCharges,
        facilityCharges: facilityCharges || [],
        totalFacilityCharges: facilitiesTotal,
        restaurantCharges: Number(restaurantCharges || 0),
        extraServices: extraServices || [],
        subTotal,
        taxPercentage: Number(taxPercentage || 0),
        taxAmount: taxAmt,
        discount: Number(discount || 0),
        advanceDeducted,
        grandTotal,
        paidAmount: 0,
        dueAmount: grandTotal,
        paymentStatus: "Unpaid",
        notes: notes || "",
        isCorporateBill: false,
        payments: []
      });
      await bill.save({ session });

      const operatorId = (req as any).user?._id || new mongoose.Types.ObjectId();
      await recordCharge(bill._id, bill.bookingId, grandTotal, operatorId, { session });

      if (advanceDeducted > 0) {
        await recordPayment(
          bill._id,
          bill.bookingId,
          advanceDeducted,
          PaymentMode.Cash,
          "Initial Check-in Advance",
          operatorId,
          "Transferred from check-in advance",
          { session }
        );
      }
    } else {
      const billingPayload: any = {
        checkInId,
        customerId: (checkInData.guests?.[0] as any)?._id || checkInData._id,
        bookingId: checkInData.bookingId || undefined,
        roomChargesBreakdown,
        totalRoomCharges,
        facilityCharges: facilityCharges || [],
        totalFacilityCharges: facilitiesTotal,
        restaurantCharges: Number(restaurantCharges || 0),
        extraServices: extraServices || [],
        subTotal,
        taxPercentage: Number(taxPercentage || 0),
        taxAmount: taxAmt,
        discount: Number(discount || 0),
        advanceDeducted,
        grandTotal,
        notes: notes || "",
      };
      Object.assign(bill, billingPayload);
      await bill.save({ session });
    }

    const newPaymentAmount = payment?.amount ? Number(payment.amount) : 0;
    if (newPaymentAmount > 0) {
      const operatorId = (req as any).user?._id || new mongoose.Types.ObjectId();
      await recordPayment(
        bill._id,
        bill.bookingId,
        newPaymentAmount,
        (payment.method || "Cash") as any,
        payment.transactionId || "",
        operatorId,
        payment.note || (isCheckout ? "Checkout settlement" : "Partial payment"),
        { session }
      );
    }

    const totalPaidFromLedger = await getComputedPaidAmount(bill._id, { session });
    const dueAmount = parseFloat(Math.max(0, grandTotal - totalPaidFromLedger).toFixed(2));
    const paymentStatus = dueAmount <= 0 && grandTotal > 0 ? "Paid" : totalPaidFromLedger > 0 ? "Partial" : "Unpaid";

    bill.paidAmount = totalPaidFromLedger;
    bill.dueAmount = dueAmount;
    bill.paymentStatus = paymentStatus;
    await bill.save({ session });

    if (isCheckout || isNewBill) {
      const customer = await Customer.findById(bill.customerId).session(session);
      const customerName = customer ? customer.name : "Guest";
      const customerGSTNumber = customer ? customer.companyGST : undefined;
      await recordGstEntry(bill, customerName, customerGSTNumber, { session });
    }

    if (!isCheckout) {
      checkInData.isBilled = true;
      await checkInData.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: "Draft saved successfully.",
        data: { billId: bill._id, paymentStatus, dueAmount, grandTotal },
      });
    }

    if (dueAmount > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot checkout. Due amount ₹${dueAmount} is still pending.`,
        data: { dueAmount, grandTotal, totalPaid: totalPaidFromLedger },
      });
    }

    // Notification: payment received
    if (newPaymentAmount > 0) {
      try {
        const customer = await Customer.findById(bill.customerId);
        const guestName = customer ? customer.name : "Guest";
        await sendNotificationToRole(
          "Reception",
          "system",
          "Payment Received",
          `Payment of ₹${newPaymentAmount} received from ${guestName}. Invoice: ${bill.invoiceNumber}.`,
          bill._id,
          "Billing"
        );
      } catch (notifErr) {
        console.error("Failed to send payment notification:", notifErr);
      }
    }

    const roomIds = checkInData.roomDetails.map((rd: any) => rd.roomId._id || rd.roomId);
    await Room.updateMany({ _id: { $in: roomIds } }, { status: "Available" }).session(session);

    checkInData.status = "Checked-Out";
    checkInData.actualCheckOutTime = new Date();
    checkInData.isBilled = true;
    await checkInData.save({ session });

    if (checkInData.bookingId) {
      await Booking.findByIdAndUpdate(checkInData.bookingId, { status: "Checked-Out" }).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    try {
      await sendNotificationToRole(
        "Housekeeping",
        "housekeeping",
        "Room Checkout Completed",
        `Guest checked out. Clean room(s): ${checkInData.roomDetails.map((r: any) => r.roomNumber).join(", ")}.`,
        checkInData._id,
        "CheckIn"
      );
      await sendNotificationToRole(
        "Manager",
        "booking",
        "Checkout Completed",
        `Checkout processed for invoice ${bill.invoiceNumber}.`,
        bill._id,
        "Billing"
      );
    } catch (notifErr) {
      console.error("Failed to send checkout notifications:", notifErr);
    }

    return res.status(200).json({
      success: true,
      message: "Checkout successful. Room is now available.",
      data: {
        billId: bill._id,
        invoiceNumber: bill.invoiceNumber,
        paymentStatus: bill.paymentStatus,
        grandTotal,
        dueRemaining: 0,
        actualCheckOut: checkInData.actualCheckOutTime,
        nights,
      },
    });

  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    console.error("processCheckout error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};




export const calculateRoomCharges = (checkInData: any) => {
  if (!checkInData || !checkInData.roomDetails) return [];

  const checkInDate = new Date(checkInData.checkInTime);

  const checkOutDate = checkInData.expectedCheckOutTime
    ? new Date(checkInData.expectedCheckOutTime)
    : new Date();

  let nights = differenceInDays(startOfDay(checkOutDate), startOfDay(checkInDate));
  if (nights <= 0) nights = 1;

  return checkInData.roomDetails.map((room: any) => {
    const rate = room.appliedPrice || 0;
    const totalCharge = nights * rate;

    return {
      roomId: room.roomId._id || room.roomId,
      roomNumber: room.roomNumber,
      roomType: room.roomType?.name || "Standard",

      checkInDate: checkInData.checkInTime,
      checkOutDate: checkOutDate,

      nights: nights,
      ratePerNight: rate,
      totalRoomCharge: totalCharge,

      stayType: checkInData.stayType || "Original"
    };
  });
};

export const getBillPreview = async (req: Request, res: Response) => {
  try {
    const { checkInId } = req.params;

    const checkInData = await CheckIn.findById(checkInId).populate("bookingId");

    if (!checkInData) {
      return res.status(404).json({
        success: false,
        message: "Check-in not found",
      });
    }

    const billing = await Billing.findOne({
      bookingId: checkInData.bookingId?._id || checkInData.bookingId,
    }).populate("customerId");

    // 🔄 Always recalculate room charges
    const recalculatedRooms = calculateRoomCharges(checkInData);

    // Find the primary guest details from check-in record
    const primaryGuest = checkInData.guests?.find((g: any) => g.isPrimary) || checkInData.guests?.[0];

    if (billing) {
      const computedPaidAmount = await getComputedPaidAmount(billing._id);
      const computedDueAmount = Math.max(0, billing.grandTotal - computedPaidAmount);
      // ✅ Merge saved + recalculated
      const mergedData = {
        ...billing.toObject(),

        // 🔄 override only dynamic fields
        roomChargesBreakdown: recalculatedRooms,
        totalRoomCharges: recalculatedRooms.reduce(
          (acc, r) => acc + r.totalRoomCharge,
          0
        ),

        // keep old payments & manual edits
        payments: billing.payments,
        paidAmount: computedPaidAmount,
        dueAmount: computedDueAmount,
        discount: billing.discount,
        notes: billing.notes,

        isUpdated: true,
        primaryGuest: primaryGuest ? { name: primaryGuest.name, mobileNo: primaryGuest.mobileNo } : null
      };

      return res.status(200).json({
        success: true,
        data: mergedData,
        isExisting: true
      });
    }

    // 🆕 No existing bill → fresh preview
    const previewData = {
      roomChargesBreakdown: recalculatedRooms,
      advanceDeducted: (checkInData as any).totalAdvanceAmount,
      advancePaymentsHistory: (checkInData as any).advancePayments,
      extraServices: [],
      discount: 0,
      notes: "",
      payments: [],
      paidAmount: 0,
      primaryGuest: primaryGuest ? { name: primaryGuest.name, mobileNo: primaryGuest.mobileNo } : null
    };

    res.status(200).json({
      success: true,
      data: previewData,
      isExisting: false
    });

  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getBillingList = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = "", status = "" } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query: any = {};

    if (status) {
      query.paymentStatus = status;
    }

    if (search) {
      const searchRegex = new RegExp(search as string, "i");
      query.$or = [
        { invoiceNumber: searchRegex },
        { invoiceType: searchRegex },
      ];
    }

    const list = await Billing.find(query)
      .populate({
        path: "checkInId",
        select: "checkInId guests roomDetails status checkInTime expectedCheckOutTime payments",
        populate: {
          path: "roomDetails.roomId",
          select: "roomNumber roomType"
        }
      })
      .populate("customerId", "name phone email companyName")
      .populate("bookingId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const totalCount = await Billing.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: list,
      pagination: {
        totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("getBillingList error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const reverseBilling = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { ledgerEntryId, reason, refundAmount } = req.body;
    const operatorId = (req as any).user?._id || new mongoose.Types.ObjectId();

    const billing = await Billing.findById(id).session(session);
    if (!billing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Billing record not found" });
    }

    if (billing.billingStatus === "Cancelled" || billing.billingStatus === "Refunded") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: `Billing is already ${billing.billingStatus.toLowerCase()}` });
    }

    if (ledgerEntryId) {
      const entry = await PaymentLedger.findOne({ _id: ledgerEntryId, billingId: billing._id }).session(session);
      if (!entry) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Ledger entry not found" });
      }
      if (entry.isReversed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Ledger entry is already reversed" });
      }

      entry.isReversed = true;
      entry.reversalReason = reason;
      entry.reversedBy = operatorId;
      await entry.save({ session });
    }

    const refundAmt = refundAmount ?? billing.dueAmount;
    if (refundAmt > 0) {
      await recordPayment(
        billing._id,
        billing.bookingId,
        refundAmt,
        PaymentMode.Cash,
        "",
        operatorId,
        reason,
        { session }
      );
    }

    const totalPaid = await getComputedPaidAmount(billing._id, { session });
    billing.paidAmount = totalPaid;
    billing.dueAmount = parseFloat(Math.max(0, billing.grandTotal - totalPaid).toFixed(2));
    billing.paymentStatus = billing.dueAmount <= 0 && billing.grandTotal > 0 ? "Paid"
      : totalPaid > 0 ? "Partial" : "Unpaid";
    if (refundAmt > 0) {
      billing.billingStatus = "Refunded";
    }
    await billing.save({ session });

    await session.commitTransaction();
    session.endSession();

    try {
      const customer = await Customer.findById(billing.customerId);
      await sendNotificationToRole(
        "Manager",
        "system",
        "Billing Reversed",
        `Billing of ₹${refundAmt} reversed for ${customer?.name || "Guest"} by staff. Reason: ${reason}. Invoice: ${billing.invoiceNumber}`,
        billing._id,
        "Billing"
      );
    } catch (notifErr) {
      console.error("Failed to send billing reversal notification:", notifErr);
    }

    return res.status(200).json({
      success: true,
      message: "Billing reversal processed successfully",
      data: {
        billingId: billing._id,
        invoiceNumber: billing.invoiceNumber,
        paidAmount: billing.paidAmount,
        dueAmount: billing.dueAmount,
        paymentStatus: billing.paymentStatus,
        billingStatus: billing.billingStatus,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    console.error("reverseBilling error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};