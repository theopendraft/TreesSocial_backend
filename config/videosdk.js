import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const VIDEOSDK_API_KEY = process.env.VIDEOSDK_API_KEY;
const VIDEOSDK_SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;
const VIDEOSDK_API_ENDPOINT = "https://api.videosdk.live/v2";

/**
 * Generate JWT token for VideoSDK authentication
 * @param {Object} options - Token options
 * @returns {string} JWT token
 */
export const generateVideoSDKToken = (options = {}) => {
  const payload = {
    apikey: VIDEOSDK_API_KEY,
    permissions: options.permissions || ["allow_join", "allow_mod"],
    version: 2,
    roles: options.roles || ["CRAWLER", "RTMP"],
    ...options,
  };

  const token = jwt.sign(payload, VIDEOSDK_SECRET_KEY, {
    algorithm: "HS256",
    expiresIn: options.expiresIn || "24h",
  });

  return token;
};

/**
 * Create a new meeting/room
 * @param {Object} options - Meeting options
 * @returns {Promise<Object>} Meeting details
 */
export const createMeeting = async (options = {}) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(`${VIDEOSDK_API_ENDPOINT}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        region: options.region || "sg001",
        autoCloseConfig: options.autoCloseConfig || {
          type: "session-end-and-deactivate",
          duration: 1,
        },
        webhook: options.webhook || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create meeting: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      roomId: data.roomId,
      data: data,
    };
  } catch (error) {
    console.error("Error creating meeting:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Validate a meeting/room
 * @param {string} roomId - Room ID to validate
 * @returns {Promise<Object>} Validation result
 */
export const validateMeeting = async (roomId) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(
      `${VIDEOSDK_API_ENDPOINT}/rooms/validate/${roomId}`,
      {
        method: "GET",
        headers: {
          Authorization: token,
        },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: "Invalid room ID",
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error validating meeting:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * End a meeting/room
 * @param {string} roomId - Room ID to end
 * @returns {Promise<Object>} Result
 */
export const endMeeting = async (roomId) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(
      `${VIDEOSDK_API_ENDPOINT}/rooms/${roomId}/deactivate`,
      {
        method: "POST",
        headers: {
          Authorization: token,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to end meeting: ${response.statusText}`);
    }

    return {
      success: true,
      message: "Meeting ended successfully",
    };
  } catch (error) {
    console.error("Error ending meeting:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get meeting details
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Meeting details
 */
export const getMeetingDetails = async (roomId) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(`${VIDEOSDK_API_ENDPOINT}/rooms/${roomId}`, {
      method: "GET",
      headers: {
        Authorization: token,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get meeting details: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error getting meeting details:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Start recording
 * @param {string} roomId - Room ID
 * @param {Object} options - Recording options
 * @returns {Promise<Object>} Recording result
 */
export const startRecording = async (roomId, options = {}) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(
      `${VIDEOSDK_API_ENDPOINT}/recordings/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          roomId: roomId,
          ...options,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to start recording: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error starting recording:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Stop recording
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Result
 */
export const stopRecording = async (roomId) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(`${VIDEOSDK_API_ENDPOINT}/recordings/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        roomId: roomId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to stop recording: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error stopping recording:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Start livestream
 * @param {string} roomId - Room ID
 * @param {Object} outputs - Livestream outputs (YouTube, Facebook, etc.)
 * @returns {Promise<Object>} Livestream result
 */
export const startLivestream = async (roomId, outputs = []) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(
      `${VIDEOSDK_API_ENDPOINT}/livestreams/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          roomId: roomId,
          outputs: outputs,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to start livestream: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error starting livestream:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Stop livestream
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Result
 */
export const stopLivestream = async (roomId) => {
  try {
    const token = generateVideoSDKToken();
    
    const response = await fetch(`${VIDEOSDK_API_ENDPOINT}/livestreams/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        roomId: roomId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to stop livestream: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Error stopping livestream:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default {
  generateVideoSDKToken,
  createMeeting,
  validateMeeting,
  endMeeting,
  getMeetingDetails,
  startRecording,
  stopRecording,
  startLivestream,
  stopLivestream,
};
