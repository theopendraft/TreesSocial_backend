import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary storage for images
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "treesh/images",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 1920, height: 1080, crop: "limit" },
      { quality: "auto" },
      { fetch_format: "auto" },
    ],
    resource_type: "image",
  },
});

// Configure Cloudinary storage for videos
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "treesh/videos",
    allowed_formats: ["mp4", "mov", "avi", "webm"],
    resource_type: "video",
    transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
  },
});

// Configure Cloudinary storage for avatars/profile pictures
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "treesh/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 400, height: 400, crop: "fill", gravity: "face" },
      { quality: "auto" },
      { fetch_format: "auto" },
    ],
    resource_type: "image",
  },
});

// Configure Cloudinary storage for reels
const reelStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "treesh/reels",
    allowed_formats: ["mp4", "mov", "webm"],
    resource_type: "video",
    transformation: [
      { width: 1080, height: 1920, crop: "fill" }, // Vertical format for reels
      { quality: "auto" },
      { fetch_format: "auto" },
    ],
  },
});

// Create multer instances for different file types
export const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

export const uploadVideo = multer({
  storage: videoStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed!"), false);
    }
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for avatars!"), false);
    }
  },
});

export const uploadReel = multer({
  storage: reelStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for reels
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed for reels!"), false);
    }
  },
});

// Utility functions for Cloudinary operations
export const cloudinaryUtils = {
  // Upload buffer to Cloudinary
  uploadBuffer: async (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: options.folder || "treesh/uploads",
            resource_type: options.resource_type || "auto",
            transformation: options.transformation || [],
            ...options,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });
  },

  // Delete file from Cloudinary
  deleteFile: async (publicId, resourceType = "image") => {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  // Get optimized URL
  getOptimizedUrl: (publicId, options = {}) => {
    return cloudinary.url(publicId, {
      quality: "auto",
      fetch_format: "auto",
      ...options,
    });
  },

  // Generate thumbnail for video
  generateVideoThumbnail: (publicId, options = {}) => {
    return cloudinary.url(publicId, {
      resource_type: "video",
      format: "jpg",
      transformation: [
        { width: 300, height: 300, crop: "fill" },
        { quality: "auto" },
        ...(options.transformation || []),
      ],
    });
  },

  // Get video info
  getVideoInfo: async (publicId) => {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: "video",
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  // Create responsive images
  createResponsiveImages: (publicId, options = {}) => {
    const breakpoints = [480, 768, 1024, 1200];
    return breakpoints.map((width) => ({
      width,
      url: cloudinary.url(publicId, {
        width,
        crop: "scale",
        quality: "auto",
        fetch_format: "auto",
        ...options,
      }),
    }));
  },
};

export default cloudinary;
