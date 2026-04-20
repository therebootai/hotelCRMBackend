import { Request, Response } from "express";
import { Customer } from "../models/customer.model";
import { Booking } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { Room } from "../models/room.model";


export const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      customerDetails,   
      rooms,  
      advanceAmount,
      source,
      isDirectCheckIn,
      specialRequests,
      bookingType, 
      corporateDetails 
    } = req.body;

    let customer = await Customer.findOne({ phone: customerDetails.phone });
    if (!customer) {
      customer = await Customer.create(customerDetails);
    }

    const bookingId = `BK-${Date.now().toString().slice(-6)}`;

    const totalEstimatedAmount = rooms.reduce((acc: number, room: any) => {
      const days = Math.ceil((new Date(room.checkOutDate).getTime() - new Date(room.checkInDate).getTime()) / (1000 * 60 * 60 * 24));
      const rate = (bookingType === "Corporate" && corporateDetails?.negotiatedRate) 
                   ? corporateDetails.negotiatedRate 
                   : room.pricePerNight;
      return acc + (rate * days);
    }, 0);

    let status = "Pending";
    if (isDirectCheckIn) {
      status = "Checked-In";
    } else if (advanceAmount > 0 || bookingType === "Corporate") {
      status = "Confirmed";
    }

    // 4. Create Booking
    const newBooking = await Booking.create({
      bookingId,
      customerId: customer._id,
      rooms,
      status,
      source,
      bookingType: bookingType || "Individual",
      corporateDetails: bookingType === "Corporate" ? corporateDetails : undefined,
      advanceAmount,
      totalEstimatedAmount,
      isDirectCheckIn,
      specialRequests
    });

    if (isDirectCheckIn) {
      const checkInPromises = rooms.map(async (roomData: any) => {
        return CheckIn.create({
          bookingId: newBooking._id,
          roomIds: roomData.roomId,
          checkInType: bookingType || "Individual", 
          guests: [{ 
            name: bookingType === "Corporate" ? corporateDetails.contactPerson : customer.name, 
            isPrimary: true 
          }], 
          checkInTime: new Date(),
          expectedCheckOutTime: roomData.checkOutDate,
          status: "Active",
          stayType: "Original",
          corporateCheckInDetails: bookingType === "Corporate" ? {
            companyName: corporateDetails.companyName,
            companyGST: corporateDetails.gstNumber,
            contactPersonName: corporateDetails.contactPerson,
            contactMobile: corporateDetails.mobile
          } : undefined
        });
      });
      
      await Promise.all(checkInPromises);

      const roomIds = rooms.map((r: any) => r.roomId);
      await Room.updateMany({ _id: { $in: roomIds } }, { status: "Blocked" }); 
    }

    res.status(201).json({
      success: true,
      message: `Booking (${bookingType}) Created Successfully`,
      data: newBooking
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};