import mongoose, { ClientSession } from "mongoose";
import { PaymentLedger, LedgerEntryType, PaymentMode, IPaymentLedger } from "../models/paymentLedger.model";
import { Billing } from "../models/billing.model";

export const getComputedPaidAmount = async (
  billingId: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<number> => {
  const bId = new mongoose.Types.ObjectId(billingId);
  const result = await PaymentLedger.aggregate([
    {
      $match: {
        billingId: bId,
        entryType: { $in: [LedgerEntryType.Payment, LedgerEntryType.Adjustment] },
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" }
      }
    }
  ]).session(opts?.session || null);

  const totalPayments = result[0]?.total || 0;

  // Subtract refunds
  const refundsResult = await PaymentLedger.aggregate([
    {
      $match: {
        billingId: bId,
        entryType: LedgerEntryType.Refund,
        isReversed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" }
      }
    }
  ]).session(opts?.session || null);

  const totalRefunds = refundsResult[0]?.total || 0;

  return Math.max(0, totalPayments - totalRefunds);
};

export const getLedgerForBilling = async (
  billingId: string | mongoose.Types.ObjectId
): Promise<IPaymentLedger[]> => {
  return await PaymentLedger.find({ billingId: new mongoose.Types.ObjectId(billingId) }).sort({ createdAt: 1 });
};

export const recordCharge = async (
  billingId: string | mongoose.Types.ObjectId,
  bookingId: string | mongoose.Types.ObjectId | undefined,
  amount: number,
  operator: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<IPaymentLedger> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const newEntry = new PaymentLedger({
      billingId,
      bookingId,
      entryType: LedgerEntryType.Charge,
      amount,
      mode: PaymentMode.Cash, // Dummy mode for charges
      operator,
      remarks: "Initial billing charge created",
      previousValue: 0,
      newValue: 0
    });
    await newEntry.save({ session });

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return newEntry;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};

export const recordPayment = async (
  billingId: string | mongoose.Types.ObjectId,
  bookingId: string | mongoose.Types.ObjectId | undefined,
  amount: number,
  mode: PaymentMode,
  referenceNumber: string,
  operator: string | mongoose.Types.ObjectId,
  remarks?: string,
  opts?: { session?: ClientSession }
): Promise<IPaymentLedger> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const previousValue = await getComputedPaidAmount(billingId, { session });
    const newValue = previousValue + amount;

    const newEntry = new PaymentLedger({
      billingId,
      bookingId,
      entryType: LedgerEntryType.Payment,
      amount,
      mode,
      referenceNumber,
      operator,
      remarks: remarks || "Payment received",
      previousValue,
      newValue
    });
    await newEntry.save({ session });

    // Sync Billing summary
    const billing = await Billing.findById(billingId).session(session);
    if (billing) {
      billing.paidAmount = newValue;
      billing.dueAmount = Math.max(0, billing.grandTotal - newValue);
      billing.paymentStatus = billing.dueAmount <= 0 ? "Paid" : newValue > 0 ? "Partial" : "Unpaid";
      await billing.save({ session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return newEntry;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};

export const recordRefund = async (
  billingId: string | mongoose.Types.ObjectId,
  bookingId: string | mongoose.Types.ObjectId | undefined,
  amount: number,
  reason: string,
  operator: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<IPaymentLedger> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const previousValue = await getComputedPaidAmount(billingId, { session });
    const newValue = Math.max(0, previousValue - amount);

    const newEntry = new PaymentLedger({
      billingId,
      bookingId,
      entryType: LedgerEntryType.Refund,
      amount,
      mode: PaymentMode.Cash,
      operator,
      remarks: reason || "Refund processed",
      previousValue,
      newValue
    });
    await newEntry.save({ session });

    // Sync Billing summary
    const billing = await Billing.findById(billingId).session(session);
    if (billing) {
      billing.paidAmount = newValue;
      billing.dueAmount = Math.max(0, billing.grandTotal - newValue);
      billing.paymentStatus = billing.dueAmount <= 0 ? "Paid" : newValue > 0 ? "Partial" : "Unpaid";
      await billing.save({ session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return newEntry;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};

export const recordAdjustment = async (
  billingId: string | mongoose.Types.ObjectId,
  bookingId: string | mongoose.Types.ObjectId | undefined,
  amount: number,
  reason: string,
  operator: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<IPaymentLedger> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const previousValue = await getComputedPaidAmount(billingId, { session });
    const newValue = previousValue + amount; // amount can be negative for negative adjustments

    const newEntry = new PaymentLedger({
      billingId,
      bookingId,
      entryType: LedgerEntryType.Adjustment,
      amount: Math.abs(amount),
      mode: PaymentMode.Cash,
      operator,
      remarks: reason || "Billing adjustment",
      previousValue,
      newValue
    });
    await newEntry.save({ session });

    // Sync Billing summary
    const billing = await Billing.findById(billingId).session(session);
    if (billing) {
      billing.paidAmount = newValue;
      billing.dueAmount = Math.max(0, billing.grandTotal - newValue);
      billing.paymentStatus = billing.dueAmount <= 0 ? "Paid" : newValue > 0 ? "Partial" : "Unpaid";
      await billing.save({ session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return newEntry;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};

export const reverseEntry = async (
  ledgerEntryId: string | mongoose.Types.ObjectId,
  reason: string,
  operator: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<IPaymentLedger> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const originalEntry = await PaymentLedger.findById(ledgerEntryId).session(session);
    if (!originalEntry) throw new Error("Original ledger entry not found");
    if (originalEntry.isReversed) throw new Error("Entry is already reversed");

    originalEntry.isReversed = true;
    originalEntry.reversedBy = new mongoose.Types.ObjectId(operator);
    originalEntry.reversalReason = reason;
    await originalEntry.save({ session });

    const previousValue = await getComputedPaidAmount(originalEntry.billingId, { session });
    // If original was payment/adjustment, we reverse it (subtract). If original was refund, we reverse it (add).
    let diff = 0;
    if ([LedgerEntryType.Payment, LedgerEntryType.Adjustment].includes(originalEntry.entryType)) {
      diff = -originalEntry.amount;
    } else if (originalEntry.entryType === LedgerEntryType.Refund) {
      diff = originalEntry.amount;
    }

    const newValue = Math.max(0, previousValue + diff);

    const reversalEntry = new PaymentLedger({
      billingId: originalEntry.billingId,
      bookingId: originalEntry.bookingId,
      entryType: LedgerEntryType.Reversal,
      amount: originalEntry.amount,
      mode: originalEntry.mode,
      operator,
      remarks: `Reversal of entry ${originalEntry.ledgerId}. Reason: ${reason}`,
      previousValue,
      newValue
    });
    await reversalEntry.save({ session });

    originalEntry.reversalEntryId = reversalEntry._id as mongoose.Types.ObjectId;
    await originalEntry.save({ session });

    // Sync Billing summary
    const billing = await Billing.findById(originalEntry.billingId).session(session);
    if (billing) {
      billing.paidAmount = newValue;
      billing.dueAmount = Math.max(0, billing.grandTotal - newValue);
      billing.paymentStatus = billing.dueAmount <= 0 ? "Paid" : newValue > 0 ? "Partial" : "Unpaid";
      await billing.save({ session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return reversalEntry;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};
