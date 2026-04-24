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

 

    res.status(201).json({
      success: true,
      message: `Booking (${bookingType}) Created Successfully`,
      data: newBooking
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
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
      status, 
      source
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = {};

    if (search) {
      filter["$or"] = [
        { bookingId: { $regex: search, $options: "i" } },
      ];
    }

    if (startDate && endDate) {
      filter["rooms.checkInDate"] = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string),
      };
    }

    if (status) filter.status = status;
    if (bookingType) filter.bookingType = bookingType;
    if (source) filter.source = source;

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



export const getBookingOverview = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query; 
    
    const startOfMonth = new Date(Number(year), Number(month) - 1, 1);
    const endOfMonth = new Date(Number(year), Number(month), 0);

    const activeBookings = await Booking.find({
      status: { $in: ["Confirmed", "Checked-In"] },
      "rooms.checkInDate": { $lte: endOfMonth },
      "rooms.checkOutDate": { $gte: startOfMonth }
    })
    .populate("customerId", "name")
    .populate("rooms.roomId", "roomNumber");

    const overviewData = activeBookings.flatMap(booking => {
      return booking.rooms.map(roomEntry => ({
        bookingId: booking._id,
        guestName: (booking.customerId as any)?.name || "N/A",
        roomNumber: (roomEntry.roomId as any)?.roomNumber,
        roomId: roomEntry.roomId,
        checkIn: roomEntry.checkInDate,
        checkOut: roomEntry.checkOutDate,
        status: booking.status,
        type: booking.bookingType 
      }));
    });

    res.status(200).json({
      success: true,
      data: overviewData
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};