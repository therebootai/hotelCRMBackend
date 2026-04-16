import mongoose, { Schema, Document } from "mongoose";

export interface IRoomType extends Document {
  name: string;
  description?: string;
  images: {
    url: string;
    public_id: string;
  }[];
  isActive: boolean;
}

const RoomTypeSchema = new Schema<IRoomType>(
  {
    name: { type: String, required: true },
    description: { type: String },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const RoomType = mongoose.model<IRoomType>("RoomType", RoomTypeSchema);
