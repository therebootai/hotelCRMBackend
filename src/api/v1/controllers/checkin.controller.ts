import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { Room } from "../models/room.model";
import { uploadFile } from "../services/cloudinary.service";
import { startOfDay, endOfDay } from "date-fns";
import mongoose from "mongoose";


export const processCheckIn = async (req: Request, res: Response) => {
  try {
    const {
      bookingId,
      checkInType,
      roomSelections,
      corporateData,
      extraBed,
      advancePayments,
      totalAdvanceAmount,
      notes,
    } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const selections = roomSelections ? JSON.parse(roomSelections) : [];

    const parsedExtraBed = extraBed
      ? JSON.parse(extraBed)
      : {
          hasExtraBed: false,
          chargePerNight: 0,
        };

    const parsedPayments = advancePayments
      ? JSON.parse(advancePayments)
      : [];

    const parsedTotalAdvance = Number(totalAdvanceAmount || 0);

    const createdCheckIns = [];

    // =====================================================
    // CASE 1: INDIVIDUAL = ONE ROOM ONE CHECK-IN
    // =====================================================
    if (checkInType === "Individual") {
      for (let i = 0; i < selections.length; i++) {
        const selection = selections[i];

        let idDoc = {
          public_id: "",
          secure_url: "",
        };

        const fileKey = `idProof_${i}`;

        if (req.files && (req.files as any)[fileKey]) {
          const file = (req.files as any)[fileKey];

          const upload = await uploadFile(
            file.tempFilePath,
            "individual_ids",
            file.mimetype
          );

          idDoc = {
            public_id: upload.public_id,
            secure_url: upload.secure_url,
          };
        }

        const roomInfo = await Room.findById(selection.roomId);

        const bookedRoom = booking.rooms.find(
          (r: any) =>
            r.roomId &&
            r.roomId.toString() === selection.roomId.toString()
        );

        const newCheckIn = await CheckIn.create({
          bookingId: booking._id,

          roomDetails: [
            {
              roomId: selection.roomId,
              roomType: roomInfo?.roomType,
              roomNumber: roomInfo?.roomNumber || "",
              originalPrice: roomInfo?.basePrice || 0,
              appliedPrice:
                selection.appliedPrice ||
                roomInfo?.basePrice ||
                0,
            },
          ],

          checkInType: "Individual",

          guests: [
            {
              name: selection.guestNames?.[0] || "",
              mobileNo: selection.mobileNos?.[0] || "",
              idType: "Aadhar Card",
              idNumber: selection.idNumber || "",
              idDocument: idDoc,
              isPrimary: true,
            },
          ],

          checkInTime: new Date(),

          expectedCheckOutTime:
            bookedRoom?.checkOutDate || new Date(),

          extraBed: parsedExtraBed,

          advancePayments:
            i === 0 ? parsedPayments : [],

          totalAdvanceAmount:
            i === 0 ? parsedTotalAdvance : 0,

          status: "Active",

          notes,
        });

        await Room.findByIdAndUpdate(selection.roomId, {
          status: "Occupied",
        });

        createdCheckIns.push(newCheckIn);
      }
    }

    // =====================================================
    // CASE 2: CORPORATE = MULTI ROOM SINGLE CHECK-IN
    // =====================================================
    else if (checkInType === "Corporate") {
      const corpInfo = corporateData
        ? JSON.parse(corporateData)
        : {};

      let guestListDoc = {
        public_id: "",
        secure_url: "",
      };

      if (req.files && (req.files as any).guestListFile) {
        const file = (req.files as any).guestListFile;

        const upload = await uploadFile(
          file.tempFilePath,
          "corporate_docs",
          file.mimetype
        );

        guestListDoc = {
          public_id: upload.public_id,
          secure_url: upload.secure_url,
        };
      }

      const roomDetails = [];

      const allRoomIds = [];

      for (const selection of selections) {
        const roomInfo = await Room.findById(selection.roomId);

        roomDetails.push({
          roomId: selection.roomId,
          roomType: roomInfo?.roomType,
          roomNumber: roomInfo?.roomNumber || "",
          originalPrice: roomInfo?.basePrice || 0,
          appliedPrice:
            selection.appliedPrice ||
            roomInfo?.basePrice ||
            0,
        });

        allRoomIds.push(selection.roomId);
      }

      const masterCheckIn = await CheckIn.create({
        bookingId: booking._id,

        roomDetails,

        checkInType: "Corporate",

        corporateCheckInDetails: {
          ...corpInfo,
          guestListImage: guestListDoc,
        },

        guests: [
          {
            name: corpInfo.contactPersonName || "",
            mobileNo: corpInfo.contactMobile || "",
            isPrimary: true,
          },
        ],

        checkInTime: new Date(),

        expectedCheckOutTime:
          booking.rooms?.[0]?.checkOutDate || new Date(),

        extraBed: parsedExtraBed,

        advancePayments: parsedPayments,

        totalAdvanceAmount: parsedTotalAdvance,

        status: "Active",

        notes,
      });

      await Room.updateMany(
        { _id: { $in: allRoomIds } },
        { status: "Occupied" }
      );

      createdCheckIns.push(masterCheckIn);
    }

    // =====================================================
    // BOOKING STATUS UPDATE
    // =====================================================

    const totalBookedRooms = booking.rooms.length;

    const totalCheckedRooms = createdCheckIns.reduce(
      (sum: number, item: any) =>
        sum + (item.roomDetails?.length || 0),
      0
    );

    if (totalCheckedRooms >= totalBookedRooms) {
      booking.status = "Checked-In";
    } else {
      booking.status = "Checked-In";
    }

    await booking.save();

    return res.status(201).json({
      success: true,
      message: "Check-In Completed Successfully",
      data: createdCheckIns,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    let query: any = {};

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate as string) : startOfDay(new Date());
      const end = endDate ? new Date(endDate as string) : endOfDay(new Date());

      if (dateType === "checkIn") {
        query.checkInTime = { $gte: start, $lte: end };
      } 
      else if (dateType === "expectedCheckout") {
        query.expectedCheckOutTime = { $gte: start, $lte: end };
      } 
      else if (dateType === "actualCheckout") {
        query.actualCheckOutTime = { $gte: start, $lte: end };
      } 
      else if (dateType === "anyCheckout") {
        query.$or = [
          { actualCheckOutTime: { $gte: start, $lte: end } },
          { expectedCheckOutTime: { $gte: start, $lte: end } }
        ];
      }
    }

    if (roomId) {
      query.roomIds = new mongoose.Types.ObjectId(roomId as string);
    }else if (roomType) {
  const roomTypeId = roomType as string;

  const roomsUnderType = await Room.find({ 
    roomType: roomTypeId as any 
  }).select("_id");

  const roomIdsUnderType = roomsUnderType.map(r => r._id);
  query.roomIds = { $in: roomIdsUnderType };
}

    if (checkInType) query.checkInType = checkInType;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { "guests.name": { $regex: search, $options: "i" } },
        { "guests.mobileNo": { $regex: search, $options: "i" } },
        { "corporateCheckInDetails.companyName": { $regex: search, $options: "i" } },
        { "corporateCheckInDetails.contactMobile": { $regex: search, $options: "i" } },
      ];
    }

    const list = await CheckIn.find(query)
      .populate("bookingId")
     .populate({
        path: "roomDetails.roomId",
        select: "roomNumber status"
      })
      .populate({
        path: "roomDetails.roomType",
        select: "name"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const totalCount = await CheckIn.countDocuments(query);

    const today = new Date();
    const stats = await CheckIn.aggregate([
      {
        $facet: {
          todayTotal: [
            { $match: { checkInTime: { $gte: startOfDay(today), $lte: endOfDay(today) } } },
            { $count: "count" }
          ],
          activeCheckins: [
            { $match: { status: "Active" } },
            { $count: "count" }
          ],
          expectedCheckoutsToday: [
            { $match: { 
                status: "Active", 
                expectedCheckOutTime: { $gte: startOfDay(today), $lte: endOfDay(today) } 
              } 
            },
            { $count: "count" }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: list,
      pagination: {
        totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
      stats: {
        todayCheckins: stats[0].todayTotal[0]?.count || 0,
        activeGuests: stats[0].activeCheckins[0]?.count || 0,
        expectedCheckouts: stats[0].expectedCheckoutsToday[0]?.count || 0,
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


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
    const roomInfo = await Room.findById(newRoomId);
    
    checkIn.roomDetails.push({
      roomId: roomObjectId,
      roomType: roomInfo?.roomType as any, 
      roomNumber: (roomNumberStr || roomInfo?.roomNumber || "") as string, 
      originalPrice: roomInfo?.basePrice || 0,
      appliedPrice: Number(appliedPrice) || roomInfo?.basePrice || 0
    });

    await Room.findByIdAndUpdate(newRoomId, { status: "Occupied" });
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

      checkIn.advancePayments.push(paymentEntry);

      checkIn.totalAdvanceAmount = (checkIn.totalAdvanceAmount || 0) + Number(newAdvanceAmount);
    }

    checkIn.notes = (checkIn.notes || "") + 
      `\n[Update]: Extended from ${oldCheckoutDate.toLocaleString()} to ${newExpectedCheckout}. Additional Advance: ₹${newAdvanceAmount || 0}`;

    await checkIn.save();

    res.status(200).json({ 
      success: true, 
      message: "Stay extended and payment history updated successfully",
      data: checkIn 
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};



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

    // ===============================
    // 1. ALL ROOMS
    // ===============================
    const rooms = await Room.find()
      .populate("roomType", "name")
      .sort({ roomNumber: 1 });

    // ===============================
    // 2. ACTIVE CHECKINS
    // ===============================
    const checkins = await CheckIn.find({
      status: "Active",
      checkInTime: { $lt: endDate },
      expectedCheckOutTime: { $gt: startDate },
    })
      .populate("guests")
      .populate("roomDetails.roomId", "roomNumber")
      .populate("roomDetails.roomType", "name");

    // ===============================
    // 3. GROUP BY ROOM TYPE
    // ===============================
    const grouped: any = {};

    for (const room of rooms) {
      const typeName =
        (room as any).roomType?.name || "Other";

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

    // ===============================
    // 4. PUSH BOOKING BLOCKS
    // ===============================
    for (const ci of checkins) {
      for (const rd of ci.roomDetails || []) {
        const roomId =
  (rd.roomId as any)?._id?.toString() ||
  rd.roomId?.toString();

        const typeName =
          (rd.roomType as any)?.name || "Other";

        const targetRoom = grouped[typeName]?.find(
          (r: any) => r.id.toString() === roomId
        );

        if (targetRoom) {
          targetRoom.bookings.push({
            id: ci._id,
            guest: ci.guests?.[0]?.name || "Guest",
            phone: ci.guests?.[0]?.mobileNo || "",
            start: ci.checkInTime,
            end: ci.expectedCheckOutTime,
            color: "red",
            status: ci.status,
          });
        }
      }
    }

    // ===============================
    // 5. FINAL ARRAY FORMAT
    // ===============================
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