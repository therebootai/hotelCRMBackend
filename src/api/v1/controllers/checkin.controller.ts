import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { Room } from "../models/room.model";
import { uploadFile } from "../services/cloudinary.service";

export const processCheckIn = async (req: Request, res: Response) => {
  try {
    const { bookingId, checkInType, roomSelections, corporateData } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const selections = JSON.parse(roomSelections);
    let createdCheckIns = [];

    if (checkInType === "Individual") {
      for (let i = 0; i < selections.length; i++) {
        const selection = selections[i];
        
        let idDoc = { public_id: "", secure_url: "" };
        const fileKey = `idProof_${i}`;
        
        if (req.files && req.files[fileKey]) {
          const file = req.files[fileKey] as any;
          const upload = await uploadFile(file.tempFilePath, "individual_ids", file.mimetype);
          idDoc = { public_id: upload.public_id, secure_url: upload.secure_url };
        }

        const newCheckIn = await CheckIn.create({
          bookingId: booking._id,
          roomIds: [selection.roomId], 
          checkInType: "Individual",
          guests: [
            { 
              name: selection.guestNames[0], 
              isPrimary: true, 
              idDocument: idDoc 
            }
          ],
          checkInTime: new Date(),
          expectedCheckOutTime: booking.rooms[0].checkOutDate,
          status: "Active"
        });

        await Room.findByIdAndUpdate(selection.roomId, { status: "Blocked" });
        createdCheckIns.push(newCheckIn);
      }
    }
    else if (checkInType === "Corporate") {
      const corpInfo = JSON.parse(corporateData);
      let guestListDoc = { public_id: "", secure_url: "" };

      if (req.files && req.files.guestListFile) {
        const file = req.files.guestListFile as any;
        const upload = await uploadFile(file.tempFilePath, "corporate_docs", file.mimetype);
        guestListDoc = { public_id: upload.public_id, secure_url: upload.secure_url };
      }

      const allRoomIds = selections.map((s: any) => s.roomId);

      const masterCheckIn = await CheckIn.create({
        bookingId: booking._id,
        roomIds: allRoomIds, 
        checkInType: "Corporate",
        corporateCheckInDetails: {
          ...corpInfo,
          guestListImage: guestListDoc
        },
        guests: [{ name: corpInfo.contactPersonName, isPrimary: true }],
        checkInTime: new Date(),
        expectedCheckOutTime: booking.rooms[0].checkOutDate,
        status: "Active"
      });

      await Room.updateMany({ _id: { $in: allRoomIds } }, { status: "Blocked" });
      createdCheckIns.push(masterCheckIn);
    }

    booking.status = "Checked-In";
    await booking.save();

    res.status(201).json({
      success: true,
      message: "Check-In Completed Successfully",
      data: createdCheckIns
    });

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};