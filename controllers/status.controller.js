const mongoose = require("mongoose");
const { isReady, getClient } = require("../services/whatsapp.service");
const { clearCurrentQR } = require("../services/qr.service");

let store = null;

/**
 * Set store instance (called from server.js)
 */
const setStore = (storeInstance) => {
  store = storeInstance;
};

/**
 * Root endpoint for basic connectivity test
 */
const getRoot = (req, res) => {
  res.json({
    message: "WhatsApp Web.js Server is running!",
    status: isReady() ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      info: "/info",
      qrCode: "/qr",
      qrStream: "/qr-stream",
      sessionStatus: "/session-status",
      mongodbInfo: "/mongodb-info",
      sendMessage: "POST /send",
      resetSession: "POST /reset-session",
    },
  });
};

/**
 * Health check endpoint
 */
const getHealth = (req, res) => {
  res.json({
    status: isReady() ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
  });
};

/**
 * Get client info endpoint
 */
const getInfo = async (req, res) => {
  if (!isReady() || !getClient()) {
    return res.status(500).json({ error: "Client not ready" });
  }

  try {
    const client = getClient();
    const info = client.info;
    res.json({
      status: "ready",
      clientInfo: {
        wid: info.wid,
        pushname: info.pushname,
        battery: info.battery,
        platform: info.platform,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Session store status endpoint
 */
const getSessionStatus = async (req, res) => {
  try {
    const status = {
      mongodbConnected: mongoose.connection.readyState === 1,
      storeInitialized: !!store,
      clientReady: isReady(),
      sessionExists: false,
    };

    // Check if session exists in MongoDB
    if (store && mongoose.connection.readyState === 1) {
      try {
        // Check if GridFS files exist for this session
        const db = mongoose.connection.db;
        const filesCollection = db.collection(
          "whatsapp-RemoteAuth-mySession.files"
        );
        const fileExists = await filesCollection.findOne({
          filename: "RemoteAuth-mySession.zip",
        });

        status.sessionExists = !!fileExists;
        if (fileExists) {
          status.sessionInfo = {
            hasData: true,
            filename: fileExists.filename,
            fileSize: fileExists.length,
            uploadDate: fileExists.uploadDate,
            chunkSize: fileExists.chunkSize,
          };
        }
      } catch (error) {
        console.log("Session check error:", error.message);
        // Fallback: try the original method
        try {
          const sessionData = await store.getSession("mySession");
          status.sessionExists = !!sessionData;
        } catch (fallbackError) {
          console.log("Fallback session check error:", fallbackError.message);
        }
      }
    }

    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * MongoDB collections info endpoint
 */
const getMongoDBInfo = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "MongoDB not connected" });
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    res.json({
      database: db.databaseName,
      collections: collections.map((col) => ({
        name: col.name,
        type: col.type,
      })),
      connectionState: mongoose.connection.readyState,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Reset session endpoint
 */
const resetSession = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "MongoDB not connected" });
    }

    const db = mongoose.connection.db;

    // Delete session files
    await db.collection("whatsapp-RemoteAuth-mySession.files").deleteMany({});
    await db.collection("whatsapp-RemoteAuth-mySession.chunks").deleteMany({});

    console.log("🗑️ Session data deleted from MongoDB");

    // Reset current QR
    clearCurrentQR();

    res.json({
      success: true,
      message:
        "Session reset successfully. Restart the app to generate new QR code.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  setStore,
  getRoot,
  getHealth,
  getInfo,
  getSessionStatus,
  getMongoDBInfo,
  resetSession,
};
