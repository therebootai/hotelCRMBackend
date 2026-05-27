import mongoose from "mongoose";
import { Room } from "../models/room.model";
import { CheckIn } from "../models/checkin.model";
import { Billing } from "../models/billing.model";
import { Booking } from "../models/booking.model";
import { Customer } from "../models/customer.model";
import { GstLedger } from "../models/gstLedger.model";
import { startOfDay, endOfDay, eachDayOfInterval } from "date-fns";

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPeriodDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const getOccupancyReport = async (startDate: Date, endDate: Date): Promise<any[]> => {
  const rooms = await Room.find({ status: "Active" }).lean();
  const totalRoomsCount = rooms.length || 1;

  const checkins = await CheckIn.find({
    status: "Checked-In",
    checkInTime: { $lte: endOfDay(endDate) },
    expectedCheckOutTime: { $gte: startOfDay(startDate) }
  }).lean();

  const days = eachDayOfInterval({ start: startOfDay(startDate), end: endOfDay(endDate) });

  return days.map(day => {
    const occupiedCount = checkins.filter((c: any) => {
      const cIn = new Date(c.checkInTime);
      const cOut = new Date(c.expectedCheckOutTime);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      return cIn <= dayEnd && cOut >= dayStart;
    }).length;

    const rate = parseFloat(((occupiedCount / totalRoomsCount) * 100).toFixed(2));

    return {
      date: formatDate(day),
      occupiedRooms: occupiedCount,
      totalRooms: totalRoomsCount,
      occupancyRate: rate
    };
  });
};

export const getRevenueReport = async (startDate: Date, endDate: Date): Promise<any> => {
  const result = await Billing.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) },
        billingStatus: { $ne: "Cancelled" }
      }
    },
    {
      $group: {
        _id: null,
        totalRoomRevenue: { $sum: "$totalRoomCharges" },
        totalFacilityRevenue: { $sum: "$totalFacilityCharges" },
        totalRestaurantRevenue: { $sum: "$restaurantCharges" },
        totalExtraServicesRevenue: { $sum: { $sum: "$extraServices.total" } },
        totalTaxCollected: { $sum: "$taxAmount" },
        totalDiscount: { $sum: "$discount" },
        totalGrandTotal: { $sum: "$grandTotal" },
        totalPaid: { $sum: "$paidAmount" },
        totalDue: { $sum: "$dueAmount" }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      totalRoomRevenue: 0,
      totalFacilityRevenue: 0,
      totalRestaurantRevenue: 0,
      totalExtraServicesRevenue: 0,
      totalTaxCollected: 0,
      totalDiscount: 0,
      totalGrandTotal: 0,
      totalPaid: 0,
      totalDue: 0
    };
  }

  return result[0];
};

export const getBookingAnalytics = async (startDate: Date, endDate: Date): Promise<any> => {
  const bookings = await Booking.find({
    createdAt: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
  }).lean();

  if (bookings.length === 0) {
    return {
      totalBookings: 0,
      statusCounts: {},
      sourceCounts: {},
      averageLeadTimeDays: 0
    };
  }

  const statusCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  let totalLeadTimeMs = 0;

  bookings.forEach((b: any) => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
    if (b.source) {
      sourceCounts[b.source] = (sourceCounts[b.source] || 0) + 1;
    }
    const checkIn = new Date(b.overallCheckInDate || b.rooms?.[0]?.checkInDate || new Date()).getTime();
    const created = new Date(b.createdAt || new Date()).getTime();
    totalLeadTimeMs += Math.max(0, checkIn - created);
  });

  const averageLeadTimeDays = parseFloat(
    (totalLeadTimeMs / (bookings.length * 1000 * 60 * 60 * 24)).toFixed(2)
  );

  return {
    totalBookings: bookings.length,
    statusCounts,
    sourceCounts,
    averageLeadTimeDays
  };
};

export const getDueAgingReport = async (): Promise<any> => {
  const now = new Date();
  const result = await Billing.aggregate([
    {
      $match: {
        dueAmount: { $gt: 0 },
        billingStatus: { $ne: "Cancelled" },
        settlementStatus: { $ne: "Settled" }
      }
    },
    {
      $project: {
        invoiceNumber: 1,
        grandTotal: 1,
        paidAmount: 1,
        dueAmount: 1,
        createdAt: 1,
        ageInDays: {
          $divide: [
            { $subtract: [now, "$createdAt"] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        bucket30: {
          $sum: {
            $cond: [{ $lte: ["$ageInDays", 30] }, "$dueAmount", 0]
          }
        },
        bucket60: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ["$ageInDays", 30] }, { $lte: ["$ageInDays", 60] }] },
              "$dueAmount",
              0
            ]
          }
        },
        bucket90: {
          $sum: {
            $cond: [{ $gt: ["$ageInDays", 60] }, "$dueAmount", 0]
          }
        },
        totalOutstanding: { $sum: "$dueAmount" }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      bucket30: 0,
      bucket60: 0,
      bucket90: 0,
      totalOutstanding: 0
    };
  }

  return result[0];
};

export const getCustomerAnalytics = async (startDate: Date, endDate: Date): Promise<any> => {
  const customers = await Customer.find({
    createdAt: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
  }).lean();

  const bookings = await Booking.find({
    createdAt: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
  }).lean();

  const checkins = await CheckIn.find({
    checkInTime: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) }
  }).lean();

  const uniqueCustomers = new Set(
    bookings.map((b: any) => b.customerId?.toString()).filter(Boolean)
  );
  const repeatCustomers = new Set<string>();
  const customerBookingCount: Record<string, number> = {};

  bookings.forEach((b: any) => {
    const cid = b.customerId?.toString();
    if (cid) {
      customerBookingCount[cid] = (customerBookingCount[cid] || 0) + 1;
      if (customerBookingCount[cid] > 1) repeatCustomers.add(cid);
    }
  });

  const totalBookings = bookings.length;
  const repeatRate = totalBookings > 0
    ? parseFloat(((repeatCustomers.size / Math.max(uniqueCustomers.size, 1)) * 100).toFixed(2))
    : 0;

  const totalNights = checkins.reduce((sum: number, c: any) => {
    const nights = Math.max(1, Math.round(
      (new Date(c.expectedCheckOutTime).getTime() - new Date(c.checkInTime).getTime())
      / (1000 * 60 * 60 * 24)
    ));
    return sum + nights;
  }, 0);

  const avgStayNights = checkins.length > 0
    ? parseFloat((totalNights / checkins.length).toFixed(2))
    : 0;

  const topCustomerIds = Object.entries(customerBookingCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id);

  const topCustomers = await Customer.find({ _id: { $in: topCustomerIds } })
    .select("name phone email membershipTier")
    .lean();

  const topCustomersWithCount = topCustomerIds.map(id => {
    const c = topCustomers.find((cu: any) => cu._id.toString() === id);
    return { ...c, bookingCount: customerBookingCount[id] || 0 };
  });

  return {
    totalCustomers: customers.length,
    totalBookings,
    activeCheckins: checkins.length,
    uniqueCustomersWithBookings: uniqueCustomers.size,
    repeatCustomerCount: repeatCustomers.size,
    repeatRate,
    avgStayNights,
    topCustomers: topCustomersWithCount,
  };
};

export const getGSTSummary = async (period: string): Promise<any> => {
  const ledgerEntries = await GstLedger.find({ period: new RegExp(`^${period}`) }).lean();

  if (ledgerEntries.length === 0) {
    return {
      period,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalGST: 0,
      invoiceCount: 0,
      invoices: []
    };
  }

  const totals = ledgerEntries.reduce((acc: any, e: any) => ({
    taxableAmount: acc.taxableAmount + e.taxableAmount,
    cgst: acc.cgst + e.cgstAmount,
    sgst: acc.sgst + e.sgstAmount,
    igst: acc.igst + e.igstAmount,
    totalGST: acc.totalGST + e.totalGST,
  }), { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalGST: 0 });

  return {
    period,
    taxableAmount: parseFloat(totals.taxableAmount.toFixed(2)),
    cgst: parseFloat(totals.cgst.toFixed(2)),
    sgst: parseFloat(totals.sgst.toFixed(2)),
    igst: parseFloat(totals.igst.toFixed(2)),
    totalGST: parseFloat(totals.totalGST.toFixed(2)),
    invoiceCount: ledgerEntries.length,
    invoices: ledgerEntries.map((e: any) => ({
      invoiceNumber: e.invoiceNumber,
      customerName: e.customerName,
      taxableAmount: e.taxableAmount,
      cgst: e.cgstAmount,
      sgst: e.sgstAmount,
      totalGST: e.totalGST,
      createdAt: e.createdAt,
    })),
  };
};