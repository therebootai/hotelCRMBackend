import mongoose from "mongoose";
import { differenceInCalendarDays, eachDayOfInterval, startOfDay } from "date-fns";
import { Room } from "../models/room.model";
import { PricingRule } from "../models/pricingRule.model";
import { IBookedRoom } from "../models/booking.model";

export interface IPricingBreakdown {
  date: Date;
  basePrice: number;
  rulePrice?: number;
  finalPrice: number;
  isOverridden: boolean;
}

export class PricingService {
  static async calculateDateWisePricing(
    roomId: mongoose.Types.ObjectId,
    checkInDate: Date,
    checkOutDate: Date,
    basePrice: number,
    discountPercentage: number = 0,
    negotiatedRate?: number
  ): Promise<{ nightlyBreakdown: IPricingBreakdown[]; totalPrice: number; totalNights: number }> {
    const dates = eachDayOfInterval({ start: checkInDate, end: new Date(checkOutDate.getTime() - 86400000) });
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
    const discountedBasePrice = basePrice - (basePrice * (discountPercentage || 0) / 100);
    const effectiveRate = negotiatedRate || discountedBasePrice;

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
  }

  static async calculateBookingTotals(
    rooms: IBookedRoom[],
    bookingType: string,
    corporateDetails?: any,
    bookingCategory?: string,
    dayAccessPackagePrice?: number,
    adultsCount: number = 1,
    childrenCount: number = 0,
    taxPercentage: number = 12,
    addons: any[] = []
  ) {
    if (bookingCategory === "Day Access") {
      const packageTotal = (dayAccessPackagePrice || 0) * (adultsCount + childrenCount);
      const discountAmount = 0;
      
      let addonTotal = 0;
      let addonTax = 0;
      addons.forEach((a: any) => {
        addonTotal += Number(a.total) || 0;
        addonTax += ((Number(a.total) || 0) * (Number(a.taxPercentage) || 0)) / 100;
      });

      const roomTaxAmount = (packageTotal * taxPercentage) / 100;
      const taxAmount = roomTaxAmount + addonTax;
      const grandTotal = packageTotal + addonTotal + taxAmount - discountAmount;

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
        const roomInfo = await Room.findById(room.roomId).populate({
          path: "roomType",
          select: "basePrice discountPercentage gstId",
          populate: { path: "gstId", select: "percentage" }
        });
        const checkIn = new Date(room.checkInDate);
        const checkOut = new Date(room.checkOutDate);
        const nights = differenceInCalendarDays(checkOut, checkIn) || 1;

        if (index === 0 || checkIn < overallCheckInDate) {
          overallCheckInDate = checkIn;
        }
        if (index === 0 || checkOut > overallCheckOutDate) {
          overallCheckOutDate = checkOut;
        }

        const rt: any = roomInfo?.roomType;
        const discountToUse = rt?.discountPercentage || 0;
        
        const pricing = await this.calculateDateWisePricing(
          room.roomId!,
          checkIn,
          checkOut,
          rt?.basePrice || 0,
          discountToUse,
          bookingType === "Corporate" ? corporateDetails?.negotiatedRate : undefined
        );

        const extraBedCharge = room.hasExtraBed ? (room.extraBedCharge || (roomInfo as any)?.extraBedCharge || 0) * pricing.totalNights : 0;
        const totalRoomCharge = pricing.totalPrice + extraBedCharge;

        let roomSpecificTaxPercentage = rt?.gstId?.percentage || 0;
        const taxForThisRoom = (totalRoomCharge * roomSpecificTaxPercentage) / 100;

        totalAdults += room.adults || 1;
        totalChildren += room.children || 0;

        return {
          nights,
          totalPrice: totalRoomCharge,
          taxAmount: taxForThisRoom,
        };
      })
    );

    roomTotal = nightlyDetails.reduce((sum, d) => sum + d.totalPrice, 0);
    const totalNights = nightlyDetails[0]?.nights || 1;

    let addonTotal = 0;
    let addonTax = 0;
    addons.forEach((a: any) => {
      addonTotal += Number(a.total) || 0;
      addonTax += ((Number(a.total) || 0) * (Number(a.taxPercentage) || 0)) / 100;
    });

    const discountAmount = 0;
    const roomTaxAmount = nightlyDetails.reduce((sum, d) => sum + d.taxAmount, 0);
    const taxAmount = roomTaxAmount + addonTax;
    const grandTotal = roomTotal + addonTotal + taxAmount - discountAmount;

    return {
      roomTotal,
      discountAmount,
      taxAmount,
      grandTotal,
      paidAmount: 0,
      dueAmount: grandTotal,
      totalAdults,
      totalChildren,
      totalGuests: totalAdults + totalChildren,
      totalRooms,
      totalNights,
      overallCheckInDate,
      overallCheckOutDate,
    };
  }
}
