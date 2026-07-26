import express from "express";
import {
  uploadImage,
  uploadVideo,
  uploadAvatar,
  uploadReel,
  cloudinaryUtils,
} from "../config/cloudinary.js";
import { protect as auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// ============ AVATAR/PROFILE PICTURE UPLOADS ============

// Upload avatar (from uploads.js) - Updates user database
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

// Upload profile picture (from upload.js) - Returns optimized URLs
router.post(
  "/profile-picture",
  auth,
  uploadImage.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      const result = {
        public_id: req.file.public_id || req.file.filename,
        secure_url: req.file.secure_url || req.file.path,
        optimized_url: cloudinaryUtils.getOptimizedUrl(
          req.file.public_id || req.file.filename,
          {
            width: 300,
            height: 300,
            crop: "fill",
            gravity: "face",
          }
        ),
      };

      res.json({
        success: true,
        message: "Profile picture uploaded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Profile picture upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload profile picture",
      });
    }
  }
);

// ============ GENERAL IMAGE UPLOADS ============

// Upload single image (from uploads.js)
router.post("/image", auth, uploadImage.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      });
    }

    // Generate responsive image URLs
    const responsiveImages = cloudinaryUtils.createResponsiveImages
      ? cloudinaryUtils.createResponsiveImages(
          req.file.filename || req.file.public_id
        )
      : [];

    res.json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        url: req.file.path || req.file.secure_url,
        publicId: req.file.filename || req.file.public_id,
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

// Upload multiple images (from both files)
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
        url: file.path || file.secure_url,
        publicId: file.filename || file.public_id,
        responsiveImages: cloudinaryUtils.createResponsiveImages
          ? cloudinaryUtils.createResponsiveImages(
              file.filename || file.public_id
            )
          : [],
        originalSize: file.bytes,
        format: file.format,
        width: file.width,
        height: file.height,
        optimized_url: cloudinaryUtils.getOptimizedUrl(
          file.public_id || file.filename,
          {
            width: 800,
            height: 600,
            crop: "limit",
          }
        ),
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

// Upload post images (alias for multiple images)
router.post(
  "/post-images",
  auth,
  uploadImage.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No files uploaded",
        });
      }

      const results = req.files.map((file) => ({
        public_id: file.public_id || file.filename,
        secure_url: file.secure_url || file.path,
        optimized_url: cloudinaryUtils.getOptimizedUrl(
          file.public_id || file.filename,
          {
            width: 800,
            height: 600,
            crop: "limit",
          }
        ),
      }));

      res.json({
        success: true,
        message: "Post images uploaded successfully",
        data: results,
      });
    } catch (error) {
      console.error("Post images upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload post images",
      });
    }
  }
);

// ============ VIDEO UPLOADS ============

// Upload general video (from uploads.js)
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
      req.file.filename || req.file.public_id
    );

    res.json({
      success: true,
      message: "Video uploaded successfully",
      data: {
        url: req.file.path || req.file.secure_url,
        publicId: req.file.filename || req.file.public_id,
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

// Upload reel video (from both files)
router.post("/reel", auth, uploadReel.single("reel"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No reel video provided",
      });
    }

    // Generate reel thumbnail with proper aspect ratio
    const thumbnailUrl = cloudinaryUtils.generateVideoThumbnail(
      req.file.filename || req.file.public_id,
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
        url: req.file.path || req.file.secure_url,
        publicId: req.file.filename || req.file.public_id,
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

// Upload reel video (alias)
router.post(
  "/reel-video",
  auth,
  uploadVideo.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No video file uploaded",
        });
      }

      const thumbnail = cloudinaryUtils.generateVideoThumbnail(
        req.file.public_id || req.file.filename
      );

      const result = {
        public_id: req.file.public_id || req.file.filename,
        secure_url: req.file.secure_url || req.file.path,
        thumbnail_url: thumbnail,
        duration: req.file.duration || null,
        format: req.file.format,
        resource_type: "video",
      };

      res.json({
        success: true,
        message: "Reel video uploaded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Reel video upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload reel video",
      });
    }
  }
);

// ============ STORY & CHAT UPLOADS ============

// Upload story content (image or video)
router.post("/story", auth, uploadImage.single("content"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const isVideo = req.file.resource_type === "video";
    const result = {
      public_id: req.file.public_id || req.file.filename,
      secure_url: req.file.secure_url || req.file.path,
      resource_type: req.file.resource_type || "image",
      format: req.file.format,
    };

    if (isVideo) {
      result.thumbnail_url = cloudinaryUtils.generateVideoThumbnail(
        req.file.public_id || req.file.filename
      );
    } else {
      result.optimized_url = cloudinaryUtils.getOptimizedUrl(
        req.file.public_id || req.file.filename,
        {
          width: 400,
          height: 600,
          crop: "fill",
        }
      );
    }

    res.json({
      success: true,
      message: "Story content uploaded successfully",
      data: result,
    });
  } catch (error) {
    console.error("Story upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload story content",
    });
  }
});

// Upload chat media
router.post(
  "/chat-media",
  auth,
  uploadImage.single("media"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      const isVideo = req.file.resource_type === "video";
      const result = {
        public_id: req.file.public_id || req.file.filename,
        secure_url: req.file.secure_url || req.file.path,
        resource_type: req.file.resource_type || "image",
        format: req.file.format,
      };

      if (isVideo) {
        result.thumbnail_url = cloudinaryUtils.generateVideoThumbnail(
          req.file.public_id || req.file.filename
        );
      } else {
        result.optimized_url = cloudinaryUtils.getOptimizedUrl(
          req.file.public_id || req.file.filename
        );
      }

      res.json({
        success: true,
        message: "Chat media uploaded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Chat media upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload chat media",
      });
    }
  }
);

// ============ FILE MANAGEMENT ============

// Delete file from Cloudinary (from uploads.js)
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

// Delete file from Cloudinary (alias from upload.js)
router.delete("/delete/:publicId", auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = "image" } = req.query;

    // Decode the public_id (it might be URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    const result = await cloudinaryUtils.deleteFile(
      decodedPublicId,
      resourceType
    );

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
    console.error("Delete file error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete file",
    });
  }
});

// ============ UTILITY ENDPOINTS ============

// Get optimized URL for existing file (from uploads.js)
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

// Generate video thumbnail (from upload.js)
router.get("/video-thumbnail/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;
    const decodedPublicId = decodeURIComponent(publicId);

    const thumbnailUrl =
      cloudinaryUtils.generateVideoThumbnail(decodedPublicId);

    res.json({
      success: true,
      thumbnail_url: thumbnailUrl,
    });
  } catch (error) {
    console.error("Generate video thumbnail error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate video thumbnail",
    });
  }
});

// Get video information (from uploads.js)
router.get("/video/info/:publicId", auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const videoInfo = (await cloudinaryUtils.getVideoInfo)
      ? await cloudinaryUtils.getVideoInfo(publicId)
      : { error: "Video info function not available" };

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

// Generate responsive images for existing image (from uploads.js)
router.get("/responsive/:publicId", (req, res) => {
  try {
    const { publicId } = req.params;
    const responsiveImages = cloudinaryUtils.createResponsiveImages
      ? cloudinaryUtils.createResponsiveImages(publicId)
      : { error: "Responsive images function not available" };

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

// Upload post images (alias for multiple images)
router.post(
  "/post-images",
  auth,
  uploadImage.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No files uploaded",
        });
      }

      const results = req.files.map((file) => ({
        public_id: file.public_id || file.filename,
        secure_url: file.secure_url || file.path,
        optimized_url: cloudinaryUtils.getOptimizedUrl(
          file.public_id || file.filename,
          {
            width: 800,
            height: 600,
            crop: "limit",
          }
        ),
      }));

      res.json({
        success: true,
        message: "Post images uploaded successfully",
        data: results,
      });
    } catch (error) {
      console.error("Post images upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload post images",
      });
    }
  }
);

// Upload reel video
router.post(
  "/reel-video",
  auth,
  uploadVideo.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No video file uploaded",
        });
      }

      const thumbnail = cloudinaryUtils.generateVideoThumbnail(
        req.file.public_id
      );

      const result = {
        public_id: req.file.public_id,
        secure_url: req.file.secure_url,
        thumbnail_url: thumbnail,
        duration: req.file.duration || null,
        format: req.file.format,
        resource_type: "video",
      };

      res.json({
        success: true,
        message: "Reel video uploaded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Reel video upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload reel video",
      });
    }
  }
);

// Upload story content (image or video)
router.post("/story", auth, uploadImage.single("content"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const isVideo = req.file.resource_type === "video";
    const result = {
      public_id: req.file.public_id,
      secure_url: req.file.secure_url,
      resource_type: req.file.resource_type,
      format: req.file.format,
    };

    if (isVideo) {
      result.thumbnail_url = cloudinaryUtils.generateVideoThumbnail(
        req.file.public_id
      );
    } else {
      result.optimized_url = cloudinaryUtils.getOptimizedUrl(
        req.file.public_id,
        {
          width: 400,
          height: 600,
          crop: "fill",
        }
      );
    }

    res.json({
      success: true,
      message: "Story content uploaded successfully",
      data: result,
    });
  } catch (error) {
    console.error("Story upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload story content",
    });
  }
});

// Upload chat media
router.post(
  "/chat-media",
  auth,
  uploadImage.single("media"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      const isVideo = req.file.resource_type === "video";
      const result = {
        public_id: req.file.public_id,
        secure_url: req.file.secure_url,
        resource_type: req.file.resource_type,
        format: req.file.format,
      };

      if (isVideo) {
        result.thumbnail_url = cloudinaryUtils.generateVideoThumbnail(
          req.file.public_id
        );
      } else {
        result.optimized_url = cloudinaryUtils.getOptimizedUrl(
          req.file.public_id
        );
      }

      res.json({
        success: true,
        message: "Chat media uploaded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Chat media upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload chat media",
      });
    }
  }
);

// Upload documents - Removed for now since uploadDocument is not configured

// Delete file from Cloudinary
router.delete("/delete/:publicId", auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = "image" } = req.query;

    // Decode the public_id (it might be URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    const result = await cloudinaryUtils.deleteFile(
      decodedPublicId,
      resourceType
    );

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
    console.error("Delete file error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete file",
    });
  }
});

// Get optimized URL for existing file
router.get("/optimize/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;
    const { width, height, crop = "limit", quality = "auto" } = req.query;

    const decodedPublicId = decodeURIComponent(publicId);

    const optimizedUrl = cloudinaryUtils.getOptimizedUrl(decodedPublicId, {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      crop,
      quality,
    });

    res.json({
      success: true,
      optimized_url: optimizedUrl,
    });
  } catch (error) {
    console.error("Generate optimized URL error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate optimized URL",
    });
  }
});

// Generate video thumbnail
router.get("/video-thumbnail/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;
    const decodedPublicId = decodeURIComponent(publicId);

    const thumbnailUrl =
      cloudinaryUtils.generateVideoThumbnail(decodedPublicId);

    res.json({
      success: true,
      thumbnail_url: thumbnailUrl,
    });
  } catch (error) {
    console.error("Generate video thumbnail error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate video thumbnail",
    });
  }
});

export default router;
