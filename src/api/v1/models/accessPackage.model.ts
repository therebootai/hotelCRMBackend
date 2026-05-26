import { Document, model, models, Schema, Types } from "mongoose";

export interface IDayAccessPackage extends Document {
  package_id: string;
  packageName: string;
  description?: string;
  inclusions: string[];
  adult_price: number;
  child_price: number;
  packageType: "Premium Combo" | "Corporate";
  cover_img?: {
    public_id: string;
    secure_url: string;
  };
  entry_time: string;
  exit_time: string;
  duration?: number;
  add_ons: any;
  isActive: boolean;
}

const DayAccessPackageSchema = new Schema<IDayAccessPackage>(
  {
    package_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    packageName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    inclusions: { type: [String], default: [] },
    adult_price: { type: Number, required: true, default: 0 },
    child_price: { type: Number, required: true, default: 0 },
    packageType: {
      type: String,
      enum: ["Premium Combo", "Corporate"],
      default: "Premium Combo",
    },
    cover_img: {
      public_id: { type: String },
      secure_url: { type: String },
    },
    entry_time: { type: String, required: true },
    exit_time: { type: String, required: true },
    duration: { type: Number },
    add_ons: {
      type: Array<Types.ObjectId>,
      default: [],
      ref: "ExtraService",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

DayAccessPackageSchema.pre("save", function (this: IDayAccessPackage) {
  if (
    this.isModified("entry_time") ||
    this.isModified("exit_time") ||
    this.duration === undefined
  ) {
    if (this.entry_time && this.exit_time) {
      const [entryHour, entryMinute] = this.entry_time.split(":").map(Number);
      const [exitHour, exitMinute] = this.exit_time.split(":").map(Number);
      this.duration =
        exitHour * 60 + exitMinute - (entryHour * 60 + entryMinute);
    }
  }
});

DayAccessPackageSchema.pre("findOneAndUpdate", async function (this: any) {
  const update = this.getUpdate();
  if (!update) return;

  let entry_time = update.entry_time;
  let exit_time = update.exit_time;

  if (update.$set) {
    if (update.$set.entry_time !== undefined)
      entry_time = update.$set.entry_time;
    if (update.$set.exit_time !== undefined) exit_time = update.$set.exit_time;
  }

  if (entry_time !== undefined || exit_time !== undefined) {
    const docToUpdate = await this.model.findOne(this.getQuery());
    const finalEntryTime = entry_time ?? docToUpdate?.entry_time;
    const finalExitTime = exit_time ?? docToUpdate?.exit_time;

    if (finalEntryTime && finalExitTime) {
      const [entryHour, entryMinute] = finalEntryTime.split(":").map(Number);
      const [exitHour, exitMinute] = finalExitTime.split(":").map(Number);
      const duration =
        exitHour * 60 + exitMinute - (entryHour * 60 + entryMinute);

      const hasOperators = Object.keys(update).some((key) =>
        key.startsWith("$"),
      );
      if (hasOperators) {
        if (!update.$set) {
          update.$set = {};
        }
        update.$set.duration = duration;
      } else {
        update.duration = duration;
      }
    }
  }
});

const DayAccessPackage =
  models.DayAccessPackage ||
  model<IDayAccessPackage>("DayAccessPackage", DayAccessPackageSchema);

export default DayAccessPackage;
