import { GstLedger, IGstLedger } from "../models/gstLedger.model";
import mongoose from "mongoose";

export const aggregateGSTForPeriod = async (period: string): Promise<IGstLedger[]> => {
  return await GstLedger.find({ period }).sort({ createdAt: 1 });
};

export const getGSTSummary = async (
  period: string
): Promise<{
  totalTaxableAmount: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalGST: number;
  invoiceCount: number;
}> => {
  const result = await GstLedger.aggregate([
    {
      $match: { period }
    },
    {
      $group: {
        _id: null,
        totalTaxableAmount: { $sum: "$taxableAmount" },
        totalCGST: { $sum: "$cgstAmount" },
        totalSGST: { $sum: "$sgstAmount" },
        totalIGST: { $sum: "$igstAmount" },
        totalGST: { $sum: "$totalGST" },
        invoiceCount: { $sum: 1 }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      totalTaxableAmount: 0,
      totalCGST: 0,
      totalSGST: 0,
      totalIGST: 0,
      totalGST: 0,
      invoiceCount: 0
    };
  }

  return {
    totalTaxableAmount: result[0].totalTaxableAmount,
    totalCGST: result[0].totalCGST,
    totalSGST: result[0].totalSGST,
    totalIGST: result[0].totalIGST,
    totalGST: result[0].totalGST,
    invoiceCount: result[0].invoiceCount
  };
};

export const recordGstEntry = async (
  billingData: any,
  customerName: string,
  customerGSTNumber?: string,
  opts?: { session?: mongoose.ClientSession }
): Promise<IGstLedger> => {
  const date = billingData.createdAt || new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const period = `${year}-${month}`;

  const taxableAmount = billingData.subTotal || 0;
  const cgstAmount = billingData.taxBreakdown?.cgst || 0;
  const sgstAmount = billingData.taxBreakdown?.sgst || 0;
  const igstAmount = billingData.taxBreakdown?.cess || 0; // Using cess or another property if igst is not defined, or 0
  const totalGST = cgstAmount + sgstAmount + igstAmount;

  const gstEntry = new GstLedger({
    period,
    billingId: billingData._id,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalGST,
    customerName,
    customerGSTNumber,
    invoiceNumber: billingData.invoiceNumber
  });

  await gstEntry.save(opts);
  return gstEntry;
};
