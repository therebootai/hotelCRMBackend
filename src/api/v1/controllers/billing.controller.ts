import { Request, Response } from "express";
import { CheckIn } from "../models/checkin.model";
import { Billing } from "../models/billing.model";
import { Room } from "../models/room.model";
import { Booking } from "../models/booking.model";


import { differenceInDays, startOfDay } from "date-fns";


export const processCheckout = async (req: Request, res: Response) => {
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
 
    const checkInData = await CheckIn.findById(checkInId);
    if (!checkInData) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }
 
    const checkInDate  = new Date(checkInData.checkInTime);
    const checkOutDate = isCheckout ? new Date() : new Date(checkInData.expectedCheckOutTime);
 
    let nights = differenceInDays(startOfDay(checkOutDate), startOfDay(checkInDate));
    if (nights <= 0) nights = 1;
 
    const roomChargesBreakdown = checkInData.roomDetails.map((room: any) => {
      const rate        = room.appliedPrice || 0;
      const totalCharge = nights * rate;
      return {
        roomId:          room.roomId._id || room.roomId,
        roomNumber:      room.roomNumber,
        roomType:        room.roomType?.name || "Standard",
        checkInDate:     checkInData.checkInTime,
        checkOutDate:    checkOutDate,
        nights,
        ratePerNight:    rate,
        totalRoomCharge: totalCharge,
        stayType:        checkInData.stayType || "Original",
      };
    });
 
    const totalRoomCharges = roomChargesBreakdown.reduce(
      (acc, r) => acc + r.totalRoomCharge, 0
    );
 
    const servicesTotal   = (extraServices || []).reduce((acc: number, s: any) => acc + (Number(s.total) || 0), 0);
    const facilitiesTotal = (facilityCharges || []).reduce((acc: number, f: any) => acc + (Number(f.totalFacilityCharge) || 0), 0);
    const subTotal        = totalRoomCharges + servicesTotal + facilitiesTotal + Number(restaurantCharges || 0);
    const taxAmt          = parseFloat(((subTotal * Number(taxPercentage || 0)) / 100).toFixed(2));
    const grandTotal      = parseFloat((subTotal + taxAmt - Number(discount || 0)).toFixed(2));
    const advanceDeducted = checkInData.totalAdvanceAmount || 0;
    const netPayable      = parseFloat(Math.max(0, grandTotal - advanceDeducted).toFixed(2));
 
   let bill = await Billing.findOne({
  bookingId: checkInData.bookingId,
});
 
    const currentPaid = bill ? bill.paidAmount : 0;
    const newPaymentAmount = payment?.amount ? Number(payment.amount) : 0;
    const totalPaid   = parseFloat((currentPaid + newPaymentAmount).toFixed(2));
    const dueAmount   = parseFloat(Math.max(0, netPayable - totalPaid).toFixed(2));
    const paymentStatus =
      dueAmount <= 0 && grandTotal > 0 ? "Paid"
      : totalPaid > 0                  ? "Partial"
      :                                  "Unpaid";
 
    const billingPayload: any = {
      checkInId,
     customerId: (checkInData.guests?.[0] as any)?._id || checkInData._id,
      bookingId:            checkInData.bookingId || undefined,
      roomChargesBreakdown,
      totalRoomCharges,
      facilityCharges:      facilityCharges || [],
      totalFacilityCharges: facilitiesTotal,
      restaurantCharges:    Number(restaurantCharges || 0),
      extraServices:        extraServices || [],
      subTotal,
      taxPercentage:        Number(taxPercentage || 0),
      taxAmount:            taxAmt,
      discount:             Number(discount || 0),
      advanceDeducted,
      grandTotal,
      paidAmount:           totalPaid,
      dueAmount,
      paymentStatus,
      notes: notes || "",
    };
 
    if (!bill) {
      const count = await Billing.countDocuments();
      billingPayload.invoiceNumber = `INV-${Date.now()}-${count + 1}`;
      billingPayload.isCorporateBill = false;
      billingPayload.payments = [];
      bill = new Billing(billingPayload);
    } else {
      Object.assign(bill, billingPayload);
    }
 
    if (newPaymentAmount > 0) {
      bill.payments.push({
        amount: newPaymentAmount,
        method: payment.method || "Cash",
        date:   new Date(),
        note:   payment.note || (isCheckout ? "Checkout settlement" : "Partial payment"),
      } as any);
    }
 
    await bill.save();
 
    if (!isCheckout) {
      checkInData.isBilled = true;
      await checkInData.save();
      return res.status(200).json({
        success: true,
        message: "Draft saved successfully.",
        data: { billId: bill._id, paymentStatus, dueAmount, grandTotal },
      });
    }
 
    if (dueAmount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot checkout. Due amount ₹${dueAmount} is still pending.`,
        data: { dueAmount, grandTotal, totalPaid },
      });
    }
 
    const roomIds = checkInData.roomDetails.map((rd: any) => rd.roomId._id || rd.roomId);
    await Room.updateMany({ _id: { $in: roomIds } }, { status: "Available" });
 
    checkInData.status          = "Checked-Out";
    checkInData.actualCheckOutTime = new Date();
    checkInData.isBilled        = true;
    await checkInData.save();
 
    if (checkInData.bookingId) {
      await Booking.findByIdAndUpdate(checkInData.bookingId, { status: "Checked-Out" });
    }
 
    return res.status(200).json({
      success: true,
      message: "Checkout successful. Room is now available.",
      data: {
        billId:        bill._id,
        invoiceNumber: bill.invoiceNumber,
        paymentStatus: bill.paymentStatus,
        grandTotal,
        dueRemaining:  0,
        actualCheckOut: checkInData.actualCheckOutTime,
        nights,
      },
    });
 
  } catch (error: any) {
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
});

    // 🔄 Always recalculate room charges
    const recalculatedRooms = calculateRoomCharges(checkInData);

    if (billing) {
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
        paidAmount: billing.paidAmount,
        discount: billing.discount,
        notes: billing.notes,

        isUpdated: true
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
      advanceDeducted: checkInData.totalAdvanceAmount,
      advancePaymentsHistory: checkInData.advancePayments,
      extraServices: [],
      discount: 0,
      notes: "",
      payments: [],
      paidAmount: 0
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