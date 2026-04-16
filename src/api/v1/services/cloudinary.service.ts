import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import fs from "fs/promises";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export interface UploadFileResult {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
  [key: string]: unknown;
}

/**
 * Uploads a file to Cloudinary and removes the local temporary file.
 * * @param tempFilePath - The local path where Multer saved the file.
 * @param targetFolder - The Cloudinary folder (e.g., 'rooms', 'amenities').
 * @param fileType - Mime type of the file.
 */
export const uploadFile = async (
  tempFilePath: string,
  targetFolder: string = "general",
  fileType: string = "image/jpeg"
): Promise<UploadFileResult> => {
  try {
    let format = "jpg";
    let resourceType: "image" | "video" | "raw" | "auto" = "image";

    if (fileType === "application/pdf") {
      format = "pdf";
      resourceType = "raw";
    } else if (fileType.startsWith("video/")) {
      resourceType = "video";
      format = "mp4"; // Defaulting to mp4 for web optimization
    }

    const result: UploadFileResult = await cloudinary.uploader.upload(
      tempFilePath,
      {
        folder: `siddharaj-hotel/${targetFolder}`,
        resource_type: resourceType,
        format: format,
      }
    );

    // Clean up local temp file after successful upload
    await fs.unlink(tempFilePath);
    return result;
  } catch (error) {
    // Attempt to clean up temp file even if upload fails
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
    }
    
    console.error("Error uploading file to Cloudinary:", error);
    throw new Error("File upload failed");
  }
};

/**
 * Deletes a file from Cloudinary using its public_id.
 */
export const deleteFile = async (
  publicId: string
): Promise<UploadApiResponse> => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
    throw new Error("File deletion failed");
  }
};

export default cloudinary;