import express from "express";
import { protect as auth } from "../middleware/auth.js";
import {
  uploadImage,
  uploadVideo,
  uploadAvatar,
  uploadReel,
  cloudinaryUtils,
} from "../config/cloudinary.js";
import User from "../models/User.js";

const router = express.Router();

// Upload profile picture/avatar
router.post(
  "/avatar",
  auth,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No avatar file provided",
        });
      }

      // Update user's avatar URL in database
      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          avatar: req.file.path,
          avatarPublicId: req.file.filename,
        },
        { new: true }
      ).select("-password");

      res.json({
        success: true,
        message: "Avatar uploaded successfully",
        data: {
          avatarUrl: req.file.path,
          publicId: req.file.filename,
          user,
        },
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload avatar",
      });
    }
  }
);

// Upload general image
router.post("/image", auth, uploadImage.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      });
    }

    // Generate responsive image URLs
    const responsiveImages = cloudinaryUtils.createResponsiveImages(
      req.file.filename
    );

    res.json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        url: req.file.path,
        publicId: req.file.filename,
        responsiveImages,
        originalSize: req.file.bytes,
        format: req.file.format,
        width: req.file.width,
        height: req.file.height,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload image",
    });
  }
});

// Upload multiple images
router.post(
  "/images",
  auth,
  uploadImage.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No image files provided",
        });
      }

      const uploadedImages = req.files.map((file) => ({
        url: file.path,
        publicId: file.filename,
        responsiveImages: cloudinaryUtils.createResponsiveImages(file.filename),
        originalSize: file.bytes,
        format: file.format,
        width: file.width,
        height: file.height,
      }));

      res.json({
        success: true,
        message: `${req.files.length} images uploaded successfully`,
        data: {
          images: uploadedImages,
          count: req.files.length,
        },
      });
    } catch (error) {
      console.error("Multiple images upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload images",
      });
    }
  }
);

// Upload video
router.post("/video", auth, uploadVideo.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No video file provided",
      });
    }

    // Generate video thumbnail
    const thumbnailUrl = cloudinaryUtils.generateVideoThumbnail(
      req.file.filename
    );

    res.json({
      success: true,
      message: "Video uploaded successfully",
      data: {
        url: req.file.path,
        publicId: req.file.filename,
        thumbnailUrl,
        duration: req.file.duration,
        format: req.file.format,
        size: req.file.bytes,
        width: req.file.width,
        height: req.file.height,
      },
    });
  } catch (error) {
    console.error("Video upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload video",
    });
  }
});

// Upload reel video
router.post("/reel", auth, uploadReel.single("reel"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No reel video provided",
      });
    }

    // Generate reel thumbnail
    const thumbnailUrl = cloudinaryUtils.generateVideoThumbnail(
      req.file.filename,
      {
        transformation: [
          { width: 405, height: 720, crop: "fill" }, // Reel aspect ratio
        ],
      }
    );

    res.json({
      success: true,
      message: "Reel uploaded successfully",
      data: {
        url: req.file.path,
        publicId: req.file.filename,
        thumbnailUrl,
        duration: req.file.duration,
        format: req.file.format,
        size: req.file.bytes,
        width: req.file.width,
        height: req.file.height,
      },
    });
  } catch (error) {
    console.error("Reel upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload reel",
    });
  }
});

// Delete file from Cloudinary
router.delete("/file/:publicId", auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = "image" } = req.query;

    const result = await cloudinaryUtils.deleteFile(publicId, resourceType);

    if (result.result === "ok") {
      res.json({
        success: true,
        message: "File deleted successfully",
        data: result,
      });
    } else {
      res.status(404).json({
        success: false,
        error: "File not found or already deleted",
      });
    }
  } catch (error) {
    console.error("File deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete file",
    });
  }
});

// Get optimized image URL
router.get("/optimize/:publicId", (req, res) => {
  try {
    const { publicId } = req.params;
    const { width, height, quality, format } = req.query;

    const optimizedUrl = cloudinaryUtils.getOptimizedUrl(publicId, {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      quality: quality || "auto",
      format: format || "auto",
    });

    res.json({
      success: true,
      data: {
        originalPublicId: publicId,
        optimizedUrl,
        parameters: { width, height, quality, format },
      },
    });
  } catch (error) {
    console.error("URL optimization error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate optimized URL",
    });
  }
});

// Get video information
router.get("/video/info/:publicId", auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const videoInfo = await cloudinaryUtils.getVideoInfo(publicId);

    res.json({
      success: true,
      data: videoInfo,
    });
  } catch (error) {
    console.error("Video info error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get video information",
    });
  }
});

// Generate responsive images for existing image
router.get("/responsive/:publicId", (req, res) => {
  try {
    const { publicId } = req.params;
    const responsiveImages = cloudinaryUtils.createResponsiveImages(publicId);

    res.json({
      success: true,
      data: {
        publicId,
        responsiveImages,
      },
    });
  } catch (error) {
    console.error("Responsive images error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate responsive images",
    });
  }
});

export default router;
