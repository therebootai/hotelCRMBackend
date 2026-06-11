import { Request, Response } from "express";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
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
      checkoutVerification,
    } = req.body;

    const checkInData = await CheckIn.findById(checkInId).session(session);
    if (!checkInData) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    const checkInDate = new Date(checkInData.checkInTime);
    // Use expectedCheckOutTime for billing calculations to avoid recalculation based on actual stay duration
    const billingCheckOutDate = new Date(checkInData.expectedCheckOutTime);
    const actualCheckOutDate = isCheckout ? new Date() : billingCheckOutDate;

    let nights = differenceInDays(startOfDay(billingCheckOutDate), startOfDay(checkInDate));
    if (nights <= 0) nights = 1;

    const roomChargesBreakdown = checkInData.roomDetails.map((room: any) => {
      const rate = room.appliedPrice || 0;
      const totalCharge = nights * rate;
      return {
        roomId: room.roomId._id || room.roomId,
        roomNumber: room.roomNumber,
        roomType: room.roomType?.name || "Standard",
        checkInDate: checkInData.checkInTime,
        checkOutDate: billingCheckOutDate,
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
      const { GstLedger } = await import("../models/gstLedger.model");
      const existingGstEntry = await GstLedger.findOne({ billingId: bill._id }).session(session);

      if (!existingGstEntry) {
        const customer = await Customer.findById(bill.customerId).session(session);
        const customerName = customer ? customer.name : "Guest";
        const customerGSTNumber = customer ? customer.companyGST : undefined;
        await recordGstEntry(bill, customerName, customerGSTNumber, { session });
      }
    }

    if (!isCheckout) {
      checkInData.isBilled = true;
      if (checkoutVerification) {
        checkInData.checkoutVerification = {
          ...checkInData.checkoutVerification,
          ...checkoutVerification,
        };
      }
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
    await Room.updateMany({ _id: { $in: roomIds } }, { status: "Active" }).session(session);

    checkInData.status = "Checked-Out";
    checkInData.actualCheckOutTime = new Date();
    checkInData.isBilled = true;
    if (checkoutVerification) {
      checkInData.checkoutVerification = {
        ...checkoutVerification,
        verifiedAt: new Date(),
        verifiedBy: (req as any).user?._id,
      };
    }
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

  // ── Day Access: use pre-computed package total ──
  if (checkInData.bookingCategory === "Day Access") {
    const packageTotal = (checkInData.bookingId as any)?.pricingSummary?.grandTotal || 0;
    return [{
      roomId: null,
      roomNumber: "Day Access",
      roomType: checkInData.packageDetails?.packageName || "Day Access Package",
      checkInDate: checkInData.checkInTime,
      checkOutDate: checkOutDate,
      nights: 1,
      ratePerNight: packageTotal,
      totalRoomCharge: packageTotal,
      stayType: checkInData.stayType || "Original",
    }];
  }

  // ── Room Stay: existing per-room, per-night calculation ──
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

    const checkInData = await CheckIn.findById(checkInId).populate("bookingId", "name percentage type pricingSummary taxGstId");

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
        primaryGuest: primaryGuest ? { name: primaryGuest.name, mobileNo: primaryGuest.mobileNo } : null,
        taxGstId: (checkInData.bookingId as any)?.taxGstId || null
      };

      return res.status(200).json({
        success: true,
        data: mergedData,
        isExisting: true
      });
    }

    // 🆕 No existing bill → fresh preview
    // Default tax from booking's stored taxPercentage
    const storedTaxPercent = (checkInData.bookingId as any)?.pricingSummary?.taxPercentage || 12;
    const storedTaxGstId = (checkInData.bookingId as any)?.taxGstId || null;

    const previewData = {
      roomChargesBreakdown: recalculatedRooms,
      advanceDeducted: (checkInData as any).totalAdvanceAmount,
      advancePaymentsHistory: (checkInData as any).advancePayments,
      extraServices: [],
      discount: 0,
      notes: "",
      payments: [],
      paidAmount: 0,
      primaryGuest: primaryGuest ? { name: primaryGuest.name, mobileNo: primaryGuest.mobileNo } : null,
      taxPercentage: storedTaxPercent,
      taxGstId: storedTaxGstId
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

const HOTEL_NAME = "SIDDHA RAJ RESORT";
const HOTEL_ADDRESS = "Bataigol, Malbazar, Jalpaiguri";
const HOTEL_GST = "19AANCA6456A1ZM";
const HOTEL_PHONE = "9147368813 / 9062558303";

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtAmount(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildBillingHtml(
  bills: any[],
  summary: { totalBills: number; totalGrand: number; totalPaid: number; totalDue: number },
  dateLabel: string
) {
  const rowsHtml = bills.map((bill, i) => {
    const rooms = (bill.roomChargesBreakdown || []).map((r: any) => r.roomNumber).filter(Boolean).join(", ") || "-";
    const customer = bill.customerId as any;
    const due = Math.max(0, (bill.grandTotal || 0) - (bill.paidAmount || 0));
    const createdAt = new Date(bill.createdAt);
    const rowBg = i % 2 === 0 ? "#ffffff" : "#f5f7fa";
    const lastPayment = bill.payments?.slice(-1)[0];
    const paymentMode = bill.paymentStatus !== "Paid" && lastPayment ? lastPayment.paymentMode : "";

    return `
      <tr style="background:${rowBg};border-bottom:1px solid #e8eaed;">
        <td style="padding:6px 8px;font-size:9px;color:#999;">${i + 1}</td>
        <td style="padding:6px 8px;">
          <div style="font-size:9px;font-weight:500;color:#1a1a1a;">${fmtDate(createdAt)}</div>
          <div style="font-size:8px;color:#888;">${fmtTime(createdAt)}</div>
        </td>
        <td style="padding:6px 8px;font-size:9px;font-weight:500;color:#1a1a1a;">${bill.invoiceNumber || "-"}</td>
        <td style="padding:6px 8px;">
          <div style="font-size:9px;color:#333;">${customer?.name || "Guest"}</div>
          ${customer?.phone ? `<div style="font-size:8px;color:#888;">${customer.phone}</div>` : ""}
        </td>
        <td style="padding:6px 8px;font-size:9px;color:#444;">${rooms}</td>
        <td style="padding:6px 8px;font-size:9px;font-weight:500;color:#1a1a1a;">₹${fmtAmount(bill.grandTotal || 0)}</td>
        <td style="padding:6px 8px;">
          <div style="font-size:9px;font-weight:500;color:#16a34a;">₹${fmtAmount(bill.paidAmount || 0)}</div>
          ${paymentMode ? `<div style="font-size:8px;color:#666;text-transform:capitalize;">${paymentMode}</div>` : ""}
        </td>
        <td style="padding:6px 8px;font-size:9px;font-weight:500;color:${due > 0 ? "#dc2626" : "#bbb"};">
          ${due > 0 ? `₹${fmtAmount(due)}` : "-"}
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #111; color: #fff; font-size: 8px; font-weight: 700; letter-spacing: 0.5px; padding: 7px 8px; text-align: left; }
  .total-row td { background: #111; color: #fff; font-size: 10px; font-weight: 600; padding: 7px 8px; }
</style>
</head>
<body style="padding:10px;">
  <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;">
    <h1 style="font-size:18px;font-weight:900;letter-spacing:1px;color:#111;">${HOTEL_NAME}</h1>
    <p style="font-size:10px;color:#444;margin-top:3px;">${HOTEL_ADDRESS}</p>
    <p style="font-size:10px;color:#444;margin-top:2px;">GST: ${HOTEL_GST} &nbsp;|&nbsp; Tel: ${HOTEL_PHONE}</p>
    <p style="font-size:11px;font-weight:700;margin-top:6px;text-transform:uppercase;color:#111;">Hotel Billing Export Report</p>
    <p style="font-size:10px;color:#555;margin-top:2px;">Period: ${dateLabel}</p>
  </div>

  <div style="display:flex;justify-content:space-between;font-size:9px;color:#666;margin-bottom:10px;">
    <span>Total Bills: <strong style="color:#111;">${summary.totalBills}</strong></span>
    <span>Exported on: <strong style="color:#111;">${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</strong></span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px;">#</th>
        <th style="width:80px;">DATE</th>
        <th style="width:120px;">BILL NO.</th>
        <th style="width:130px;">CUSTOMER</th>
        <th style="width:90px;">ROOMS</th>
        <th style="width:90px;">GRAND TOTAL</th>
        <th style="width:90px;">PAID</th>
        <th style="width:80px;">DUE</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" style="font-size:10px;font-weight:700;text-transform:uppercase;">TOTAL</td>
        <td></td>
        <td>₹${fmtAmount(summary.totalGrand)}</td>
        <td style="color:#86efac;">₹${fmtAmount(summary.totalPaid)}</td>
        <td style="color:${summary.totalDue > 0 ? "#fca5a5" : "#666"};">${summary.totalDue > 0 ? `₹${fmtAmount(summary.totalDue)}` : "-"}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function buildInvoiceHtml(bill: any) {
  const customer = bill.customerId as any;
  const checkIn = bill.checkInId as any;
  const primaryGuest = checkIn?.guests?.find((g: any) => g.isPrimary) || checkIn?.guests?.[0];

  const guestName = customer?.name || primaryGuest?.name || "Guest";
  const guestPhone = customer?.phone || primaryGuest?.mobileNo || "";
  const guestEmail = customer?.email || "";
  const companyName = customer?.companyName || bill.corporateDetails?.companyName || "";

  const roomRows = (bill.roomChargesBreakdown || []).map((r: any) => `
    <tr>
      <td style="padding:6px 10px;font-size:10px;color:#333;">${r.roomNumber || "-"}</td>
      <td style="padding:6px 10px;font-size:10px;color:#555;">${r.roomType || "Standard"}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:center;color:#333;">${r.nights || 1}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:right;color:#333;">₹${(r.ratePerNight || 0).toLocaleString("en-IN")}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:right;font-weight:700;color:#111;">₹${(r.totalRoomCharge || 0).toLocaleString("en-IN")}</td>
    </tr>`).join("");

  const serviceRows = (bill.extraServices || []).map((s: any) => `
    <tr>
      <td style="padding:6px 10px;font-size:10px;color:#333;">${s.serviceName || "-"}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:center;color:#333;">${s.quantity || 1}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:right;color:#333;">₹${(s.rate || 0).toLocaleString("en-IN")}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:right;font-weight:700;color:#111;">₹${(s.total || 0).toLocaleString("en-IN")}</td>
    </tr>`).join("");

  const paymentRows = (bill.payments || []).map((p: any) => {
    const paidAt = p.paidAt ? new Date(p.paidAt) : (p.date ? new Date(p.date) : new Date());
    return `
    <tr>
      <td style="padding:6px 10px;font-size:9px;color:#555;">${fmtDate(paidAt)}, ${fmtTime(paidAt)}</td>
      <td style="padding:6px 10px;font-size:9px;text-align:center;">
        <span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:8px;font-weight:700;text-transform:uppercase;">${p.paymentMode || "Cash"}</span>
      </td>
      <td style="padding:6px 10px;font-size:9px;color:#666;font-family:monospace;">${p.transactionId || "-"}</td>
      <td style="padding:6px 10px;font-size:9px;color:#888;">${p.note || "-"}</td>
      <td style="padding:6px 10px;font-size:10px;text-align:right;font-weight:700;color:#16a34a;">₹${(p.amount || 0).toLocaleString("en-IN")}</td>
    </tr>`;
  }).join("");

  const statusColors: Record<string, string> = { Paid: "#16a34a", Partial: "#d97706", Unpaid: "#dc2626" };
  const statusColor = statusColors[bill.paymentStatus] || "#666";

  const checkInDate = checkIn?.checkInTime ? fmtDate(new Date(checkIn.checkInTime)) : "-";
  const checkOutDate = checkIn?.expectedCheckOutTime ? fmtDate(new Date(checkIn.expectedCheckOutTime)) : "-";
  const extraServicesTotal = (bill.extraServices || []).reduce((s: number, e: any) => s + (e.total || 0), 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,Helvetica,sans-serif; background:#fff; color:#111; font-size:12px; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#111; color:#fff; font-size:9px; font-weight:700; letter-spacing:0.5px; padding:7px 10px; text-align:left; }
  tbody tr:nth-child(even) { background:#f7f7f7; }
  .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#555; margin-bottom:6px; }
  .calc-row { display:flex; justify-content:space-between; padding:4px 0; font-size:10px; color:#555; font-weight:600; }
  .calc-row.total { border-top:2px solid #111; margin-top:4px; padding-top:6px; font-size:13px; font-weight:900; color:#111; }
  .calc-row.paid { color:#16a34a; }
  .calc-row.due { border-top:1px dashed #ccc; margin-top:4px; padding-top:6px; font-size:12px; font-weight:900; color:#dc2626; }
  .divider { border:none; border-top:1px solid #e5e5e5; margin:14px 0; }
</style>
</head>
<body style="padding:14px;">

  <!-- Hotel Header -->
  <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;">
    <h1 style="font-size:20px;font-weight:900;letter-spacing:1px;color:#111;">${HOTEL_NAME}</h1>
    <p style="font-size:10px;color:#444;margin-top:3px;">${HOTEL_ADDRESS}</p>
    <p style="font-size:10px;color:#444;margin-top:2px;">GST: ${HOTEL_GST} &nbsp;|&nbsp; Tel: ${HOTEL_PHONE}</p>
    <p style="font-size:12px;font-weight:900;margin-top:8px;text-transform:uppercase;letter-spacing:1px;color:#111;">TAX INVOICE</p>
  </div>

  <!-- Invoice Meta & Bill To -->
  <div style="display:flex;justify-content:space-between;margin-bottom:14px;gap:20px;">
    <div style="flex:1;">
      <p class="section-title">Bill To</p>
      <p style="font-size:11px;font-weight:900;color:#111;">${guestName}</p>
      ${guestPhone ? `<p style="font-size:10px;color:#555;margin-top:2px;">📞 ${guestPhone}</p>` : ""}
      ${guestEmail ? `<p style="font-size:10px;color:#555;margin-top:2px;">✉ ${guestEmail}</p>` : ""}
      ${companyName ? `<p style="font-size:10px;color:#555;margin-top:2px;">🏢 ${companyName}</p>` : ""}
    </div>
    <div style="flex:1;text-align:right;">
      <p class="section-title">Invoice Details</p>
      <p style="font-size:11px;font-weight:900;color:#111;">Invoice No: ${bill.invoiceNumber}</p>
      <p style="font-size:10px;color:#555;margin-top:2px;">Date: ${fmtDate(new Date(bill.createdAt))}</p>
      <p style="font-size:10px;color:#555;margin-top:2px;">Type: ${bill.invoiceType || "Room"}</p>
      <p style="font-size:10px;margin-top:4px;">
        Status: <strong style="color:${statusColor};text-transform:uppercase;">${bill.paymentStatus}</strong>
      </p>
    </div>
  </div>

  <!-- Stay Period -->
  ${checkIn ? `
  <div style="background:#f8f8f8;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;gap:30px;">
    <div><p style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;">Check-In</p><p style="font-size:10px;font-weight:700;color:#111;">${checkInDate}</p></div>
    <div><p style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;">Check-Out</p><p style="font-size:10px;font-weight:700;color:#111;">${checkOutDate}</p></div>
    <div><p style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;">Check-In Code</p><p style="font-size:10px;font-weight:700;color:#111;">${checkIn.checkInId || "-"}</p></div>
    <div><p style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;">Status</p><p style="font-size:10px;font-weight:900;color:#ea580c;text-transform:uppercase;">${checkIn.status || "-"}</p></div>
  </div>` : ""}

  <!-- Room Charges -->
  ${roomRows ? `
  <p class="section-title">Room Charges</p>
  <table style="margin-bottom:14px;">
    <thead><tr>
      <th>Room No</th><th>Room Type</th><th style="text-align:center;">Nights</th><th style="text-align:right;">Rate / Night</th><th style="text-align:right;">Total</th>
    </tr></thead>
    <tbody>${roomRows}</tbody>
  </table>` : ""}

  <!-- Extra Services -->
  ${serviceRows ? `
  <p class="section-title">Extra Services</p>
  <table style="margin-bottom:14px;">
    <thead><tr>
      <th>Service</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th>
    </tr></thead>
    <tbody>${serviceRows}</tbody>
  </table>` : ""}

  <hr class="divider"/>

  <!-- Calculation + Payments side by side -->
  <div style="display:flex;gap:20px;align-items:flex-start;">

    <!-- Payment History -->
    <div style="flex:3;">
      <p class="section-title">Payment History</p>
      ${paymentRows ? `
      <table>
        <thead><tr>
          <th>Date</th><th style="text-align:center;">Mode</th><th>Transaction ID</th><th>Note</th><th style="text-align:right;">Amount</th>
        </tr></thead>
        <tbody>${paymentRows}</tbody>
      </table>` : `<p style="font-size:10px;color:#aaa;font-style:italic;">No payments recorded yet.</p>`}
    </div>

    <!-- Calculation Breakdown -->
    <div style="flex:2;border-left:1px solid #eee;padding-left:20px;">
      <p class="section-title">Calculation Summary</p>
      <div class="calc-row"><span>Room Charges</span><span>₹${(bill.totalRoomCharges || 0).toLocaleString("en-IN")}</span></div>
      ${extraServicesTotal > 0 ? `<div class="calc-row"><span>Extra Services</span><span>₹${extraServicesTotal.toLocaleString("en-IN")}</span></div>` : ""}
      ${(bill.otherCharges || 0) > 0 ? `<div class="calc-row"><span>Other Charges</span><span>₹${(bill.otherCharges || 0).toLocaleString("en-IN")}</span></div>` : ""}
      <div class="calc-row" style="border-top:1px solid #eee;margin-top:4px;padding-top:4px;"><span>Sub Total</span><span>₹${(bill.subTotal || 0).toLocaleString("en-IN")}</span></div>
      ${(bill.taxBreakdown?.totalTax || 0) > 0 ? `
      <div class="calc-row" style="font-size:9px;color:#888;">
        <span>CGST (${bill.taxBreakdown?.cgst || 0}%) + SGST (${bill.taxBreakdown?.sgst || 0}%)</span>
        <span>₹${(bill.taxBreakdown?.totalTax || 0).toLocaleString("en-IN")}</span>
      </div>` : ""}
      ${(bill.discount || 0) > 0 ? `<div class="calc-row" style="color:#dc2626;"><span>Discount</span><span>-₹${(bill.discount || 0).toLocaleString("en-IN")}</span></div>` : ""}
      ${(bill.advanceDeducted || 0) > 0 ? `<div class="calc-row" style="color:#16a34a;"><span>Advance Deducted</span><span>-₹${(bill.advanceDeducted || 0).toLocaleString("en-IN")}</span></div>` : ""}
      <div class="calc-row total"><span>Grand Total</span><span>₹${(bill.grandTotal || 0).toLocaleString("en-IN")}</span></div>
      <div class="calc-row paid"><span>Amount Paid</span><span>₹${(bill.paidAmount || 0).toLocaleString("en-IN")}</span></div>
      <div class="calc-row due"><span>Balance Due</span><span>₹${(bill.dueAmount || 0).toLocaleString("en-IN")}</span></div>
    </div>

  </div>

  ${bill.notes ? `<hr class="divider"/><p style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;">Notes</p><p style="font-size:10px;color:#555;margin-top:4px;">${bill.notes}</p>` : ""}

  <hr class="divider"/>
  <p style="font-size:9px;color:#aaa;text-align:center;">This is a computer-generated invoice. Generated on ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}.</p>

</body>
</html>`;
}

export const exportSingleBillingPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const bill = await Billing.findById(id)
      .populate("customerId", "name phone email companyName")
      .populate({
        path: "checkInId",
        select: "checkInId guests status checkInTime expectedCheckOutTime",
      });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Billing record not found" });
    }

    const html = buildInvoiceHtml(bill.toObject());

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
      printBackground: true,
    });
    await browser.close();

    const filename = `Invoice_${bill.invoiceNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(Buffer.from(pdfBuffer));
  } catch (err: any) {
    console.error("exportSingleBillingPdf error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to generate PDF" });
  }
};

export const exportBillingPdf = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query as { startDate: string; endDate: string };

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 60) {
      return res.status(400).json({ success: false, message: "Date range cannot exceed 60 days" });
    }

    const bills = await Billing.find({
      createdAt: { $gte: start, $lte: end },
      billingStatus: { $ne: "Cancelled" },
    })
      .populate("customerId", "name phone")
      .sort({ createdAt: 1 });

    const summary = {
      totalBills: bills.length,
      totalGrand: bills.reduce((s, b) => s + (b.grandTotal || 0), 0),
      totalPaid: bills.reduce((s, b) => s + (b.paidAmount || 0), 0),
      totalDue: bills.reduce((s, b) => s + (b.dueAmount || 0), 0),
    };

    const dateLabel = `${fmtDate(start)} - ${fmtDate(end)}`;
    const html = buildBillingHtml(bills.map((b) => b.toObject()), summary, dateLabel);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
      printBackground: true,
    });
    await browser.close();

    const filename = `HotelBills_${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(Buffer.from(pdfBuffer));
  } catch (err: any) {
    console.error("exportBillingPdf error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to generate PDF" });
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