import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import DayAccessPackage from "@/api/v1/models/accessPackage.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";
import { uploadFile, deleteFile } from "@/api/v1/services/cloudinary.service";
import fileUpload from "express-fileupload";

type UploadedFile = fileUpload.UploadedFile;

// ==========================================
// CREATE ACCESS PACKAGE
// ==========================================
export const createAccessPackage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      package_id,
      packageName,
      description,
      inclusions,
      adult_price,
      child_price,
      packageType,
      entry_time,
      exit_time,
      add_ons,
      isActive,
      taxPercentage,
    } = req.body;

    const existingPackage = await DayAccessPackage.findOne({ package_id }).session(session);
    if (existingPackage) {
      throw new Error("A Day Access Package with this package_id already exists");
    }

    let cover_img;
    if (req.files && req.files.cover_img) {
      const file = req.files.cover_img as UploadedFile;
      const uploadResult = await uploadFile(file.tempFilePath, "access-packages", file.mimetype);
      cover_img = {
        public_id: uploadResult.public_id,
        secure_url: uploadResult.secure_url,
      };
    }

    const newPackage = new DayAccessPackage({
      package_id,
      packageName,
      description,
      inclusions,
      adult_price,
      child_price,
      packageType,
      cover_img,
      entry_time,
      exit_time,
      add_ons,
      isActive,
      taxPercentage,
    });

    await newPackage.save({ session });
    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Day Access Package created successfully",
      newPackage,
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL ACCESS PACKAGES
// ==========================================
export const getAllAccessPackages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      page = "1",
      limit = "10",
      activeOnly,
      isActive,
      packageType,
      inclusions,
      add_ons,
      search,
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filter: any = {};

    // Support both activeOnly (compat) and isActive
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    } else if (activeOnly === "true") {
      filter.isActive = true;
    }

    if (packageType) {
      filter.packageType = packageType;
    }

    if (inclusions && typeof inclusions === "string") {
      const inclusionsList = inclusions
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
      if (inclusionsList.length > 0) {
        filter.inclusions = { $all: inclusionsList };
      }
    }

    if (add_ons && typeof add_ons === "string") {
      const addonsList = add_ons
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
      if (addonsList.length > 0) {
        filter.add_ons = { $in: addonsList };
      }
    }

    if (search && typeof search === "string") {
      filter.$or = [
        { packageName: { $regex: search, $options: "i" } },
        { package_id: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch packages and total count concurrently
    const [packages, totalCount] = await Promise.all([
      DayAccessPackage.find(filter)
        .populate("add_ons")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),
      DayAccessPackage.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    return httpResponse(
      req,
      res,
      200,
      "Day Access Packages fetched successfully",
      {
        packages,
        pagination: {
          totalItems: totalCount,
          totalPages,
          currentPage: pageNumber,
          itemsPerPage: limitNumber,
        },
      },
    );
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ACCESS PACKAGE BY ID
// ==========================================
export const getAccessPackageById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const packageData = await DayAccessPackage.findById(id).populate("add_ons");
    if (!packageData) {
      throw new Error("Day Access Package not found");
    }

    return httpResponse(
      req,
      res,
      200,
      "Day Access Package fetched successfully",
      packageData,
    );
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE ACCESS PACKAGE
// ==========================================
export const updateAccessPackage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const existingPackage = await DayAccessPackage.findById(id).session(session);
    if (!existingPackage) {
      throw new Error("Day Access Package not found");
    }

    if (updateData.package_id && updateData.package_id !== existingPackage.package_id) {
      const duplicatePackage = await DayAccessPackage.findOne({ package_id: updateData.package_id }).session(session);
      if (duplicatePackage) {
        throw new Error("Another Day Access Package with this package_id already exists");
      }
    }

    if (req.files && req.files.cover_img) {
      const file = req.files.cover_img as UploadedFile;

      // Delete the old image first if it exists
      if (existingPackage.cover_img && existingPackage.cover_img.public_id) {
        try {
          await deleteFile(existingPackage.cover_img.public_id);
        } catch (delError) {
          console.error("Failed to delete old cover image:", delError);
        }
      }

      // Upload new image
      const uploadResult = await uploadFile(file.tempFilePath, "access-packages", file.mimetype);
      updateData.cover_img = {
        public_id: uploadResult.public_id,
        secure_url: uploadResult.secure_url,
      };
    }

    const updatedPackage = await DayAccessPackage.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
        session,
      },
    ).populate("add_ons");

    if (!updatedPackage) {
      throw new Error("Failed to update Day Access Package");
    }

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      "Day Access Package updated successfully",
      updatedPackage,
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE ACCESS PACKAGE
// ==========================================
export const deleteAccessPackage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const packageData = await DayAccessPackage.findById(id).session(session);
    if (!packageData) {
      throw new Error("Day Access Package not found");
    }

    // Delete image from Cloudinary
    if (packageData.cover_img && packageData.cover_img.public_id) {
      try {
        await deleteFile(packageData.cover_img.public_id);
      } catch (delError) {
        console.error("Failed to delete cover image on package deletion:", delError);
      }
    }

    await DayAccessPackage.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      "Day Access Package deleted successfully",
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};
