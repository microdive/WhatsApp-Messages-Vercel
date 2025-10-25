require("dotenv").config();

const express = require("express");
const { Client, RemoteAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const bodyParser = require("body-parser");
const { parsePhoneNumber, isValidPhoneNumber } = require("libphonenumber-js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
app.use(bodyParser.json());

let whatsappClient;
let isClientReady = false;
let currentQR = null;
let store;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;
let isInitializing = false;

// MongoDB Connection
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");

    // Initialize MongoStore with proper configuration
    store = new MongoStore({
      mongoose: mongoose,
      dbName: "whatsapp", // Specify database name
    });

    console.log("✅ MongoStore initialized successfully");

    // Initialize WhatsApp Client after MongoDB connection
    initializeWhatsAppClient();
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  if (reason.message && reason.message.includes("Protocol error")) {
    console.log(
      "🔄 Protocol error detected in unhandled rejection, attempting restart..."
    );
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      setTimeout(() => {
        initializeWhatsAppClient();
      }, 10000);
    } else {
      console.error(
        "❌ Maximum restart attempts reached. Please restart the application manually."
      );
    }
  }
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  if (error.message && error.message.includes("Protocol error")) {
    console.log(
      "🔄 Protocol error detected in uncaught exception, attempting restart..."
    );
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      setTimeout(() => {
        initializeWhatsAppClient();
      }, 10000);
    }
  }
});

// Initialize WhatsApp Client
function initializeWhatsAppClient() {
  if (!store) {
    console.error("❌ Store not initialized. Cannot create WhatsApp client.");
    return;
  }

  if (isInitializing) {
    console.log("⏳ Client initialization already in progress, skipping...");
    return;
  }

  isInitializing = true;

  // Reset restart attempts on successful initialization
  restartAttempts = 0;

  console.log("🚀 Initializing WhatsApp Client with MongoDB session store...");

  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000, // 5 minutes
    }),
    // puppeteer: {
    //   headless: true,
    //   args: [
    //     "--no-sandbox",
    //     "--disable-setuid-sandbox",
    //     "--disable-dev-shm-usage",
    //     "--disable-accelerated-2d-canvas",
    //     "--no-first-run",
    //     "--no-zygote",
    //     "--single-process",
    //     "--disable-gpu",
    //   ],
    // },
  });

  // QR Code Generation
  client.on("qr", (qr) => {
    console.log("🔗 QR RECEIVED - Session failed to load, need to scan QR:");
    console.log("📱 QR Code for WhatsApp Web:");
    qrcode.generate(qr, { small: true });
    currentQR = qr;
  });

  // Remote session saved event
  client.on("remote_session_saved", () => {
    console.log("💾 Session saved to MongoDB successfully!");
  });

  // Remote session failed to save event
  client.on("remote_session_failed", (error) => {
    console.error("❌ Failed to save session to MongoDB:", error);
  });

  // Remote session loaded event
  client.on("remote_session_loaded", () => {
    console.log("📂 Session loaded from MongoDB successfully!");
  });

  // Remote session failed to load event
  client.on("remote_session_failed", (error) => {
    console.error("❌ Failed to load session from MongoDB:", error);
  });

  // Loading screen events for debugging
  client.on("loading_screen", (percent, message) => {
    console.log(`📱 Loading: ${percent}% - ${message}`);
  });

  // Client Ready
  client.on("ready", () => {
    console.log("✅ WhatsApp Web.js Client is Ready!");
    whatsappClient = client;
    isClientReady = true;
  });

  // Authentication Success
  client.on("authenticated", () => {
    console.log("🔐 Authentication successful!");
  });

  // Authentication Failure
  client.on("auth_failure", (msg) => {
    console.error("❌ Authentication failure:", msg);
  });

  // Client Disconnected
  client.on("disconnected", (reason) => {
    console.log("📱 Client was logged out:", reason);
    isClientReady = false;
    whatsappClient = null;

    // Attempt to restart the client after a delay
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      setTimeout(() => {
        console.log(
          `🔄 Attempting to restart WhatsApp client... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
        );
        initializeWhatsAppClient();
      }, 5000);
    } else {
      console.error(
        "❌ Maximum restart attempts reached. Please restart the application manually."
      );
    }
  });

  // Handle critical errors
  client.on("change_state", (state) => {
    console.log("🔄 Client state changed to:", state);
    if (state === "CONFLICT" || state === "UNPAIRED") {
      console.log(
        "⚠️  Client in conflict or unpaired state, attempting restart..."
      );
      isClientReady = false;
      whatsappClient = null;
      if (restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        setTimeout(() => {
          console.log(
            `🔄 Attempting to restart WhatsApp client... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
          );
          initializeWhatsAppClient();
        }, 10000);
      } else {
        console.error(
          "❌ Maximum restart attempts reached. Please restart the application manually."
        );
      }
    }
  });
  // Add more debugging events
  client.on("change_state", (state) => {
    console.log(`🔄 Client state changed to: ${state}`);
  });

  // Initialize Client with error handling
  client.initialize().catch((error) => {
    console.error("❌ Failed to initialize WhatsApp client:", error);

    // Handle specific Puppeteer errors
    if (
      error.message.includes("Protocol error") ||
      error.message.includes("Execution context was destroyed") ||
      error.message.includes("Target closed") ||
      error.message.includes("Session closed")
    ) {
      console.log(
        "🔄 Puppeteer error detected, attempting restart in 10 seconds..."
      );
      if (restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        setTimeout(() => {
          console.log(
            `🔄 Attempting to restart WhatsApp client... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
          );
          initializeWhatsAppClient();
        }, 10000);
      } else {
        console.error(
          "❌ Maximum restart attempts reached. Please restart the application manually."
        );
      }
    }
  });
}

// Helper function to normalize phone number using libphonenumber-js
function normalizePhoneNumber(phone) {
  try {
    let phoneStr = String(phone || "").trim();

    if (!phoneStr) {
      console.log(`📞 Empty phone number provided`);
      return null;
    }

    // Remove the '=' prefix if present
    if (phoneStr.startsWith("=")) {
      phoneStr = phoneStr.substring(1);
      console.log(`📞 Removed '=' prefix: ${phoneStr}`);
    }

    // First check if the number is valid
    if (!isValidPhoneNumber(phoneStr)) {
      console.log(`📞 Invalid phone number format: ${phoneStr}`);
      return null;
    }

    // Parse the phone number
    const phoneNumber = parsePhoneNumber(phoneStr);

    if (!phoneNumber) {
      console.log(`📞 Could not parse phone number: ${phoneStr}`);
      return null;
    }

    // Get the international format
    const internationalNumber = phoneNumber.format("E.164");

    // Remove the '+' sign for WhatsApp format
    const cleanedNumber = internationalNumber.substring(1);

    console.log(`📞 Original: ${phone}`);
    console.log(`📞 Cleaned: ${phoneStr}`);
    console.log(`📞 Country: ${phoneNumber.country}`);
    console.log(`📞 International: ${internationalNumber}`);
    console.log(`📞 Final: ${cleanedNumber}`);

    return cleanedNumber;
  } catch (error) {
    console.log(`📞 Error parsing phone number ${phone}:`, error.message);
    return null;
  }
}

// Helper function to check if number exists
async function checkNumberExists(phoneNumber) {
  try {
    const numberId = await whatsappClient.getNumberId(phoneNumber);
    return numberId !== null;
  } catch (error) {
    console.log(`❌ Number check failed for ${phoneNumber}:`, error.message);
    return false;
  }
}

// Send message endpoint
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  console.log("📨 Incoming request:", req.body);

  // Check if client is ready
  if (!isClientReady || !whatsappClient) {
    return res.status(200).json({
      error: "WhatsApp client not ready",
      status: "failed",
    });
  }

  // Validate input
  const phoneStr = String(phone || "").trim();
  if (!phoneStr) {
    return res.status(200).json({
      error: "Phone number is required",
      status: "failed",
    });
  }

  if (!message || !message.trim()) {
    return res.status(200).json({
      error: "Message is required",
      status: "failed",
    });
  }

  try {
    // Normalize phone number
    const cleanedNumber = normalizePhoneNumber(phoneStr);

    if (!cleanedNumber) {
      return res.status(200).json({
        error: "Invalid phone number format",
        status: "failed",
      });
    }

    // Format phone number for WhatsApp
    const phoneNumber = `${cleanedNumber}@c.us`;

    console.log(`📞 Processing number: ${cleanedNumber}`);

    // Check if number exists
    const numberExists = await checkNumberExists(phoneNumber);

    if (!numberExists) {
      console.log(
        `⚠️  Number ${cleanedNumber} does not exist - but trying to send anyway`
      );
    }

    // Send message
    await whatsappClient.sendMessage(phoneNumber, message.trim());
    console.log(`✅ Message sent successfully to ${cleanedNumber}`);

    res.status(200).json({
      status: "sent",
      message: "Message sent successfully",
      mobileNumber: cleanedNumber,
      sent: true,
      exists: true,
    });
  } catch (err) {
    console.error("❌ Send Error:", err);

    const cleanedNumber = normalizePhoneNumber(phone);

    // Handle specific WhatsApp errors
    if (
      err.message.includes("number does not exist") ||
      err.message.includes("phone number is not registered")
    ) {
      console.log(
        `⚠️  Number ${cleanedNumber} does not exist - handled gracefully`
      );
      return res.status(200).json({
        status: "skipped",
        message: "Number does not exist",
        mobileNumber: cleanedNumber,
        sent: false,
        exists: false,
      });
    }

    // Handle rate limiting
    if (
      err.message.includes("rate limit") ||
      err.message.includes("too many")
    ) {
      console.log(`⏳ Rate limited for ${cleanedNumber}`);
      return res.status(200).json({
        status: "rate_limited",
        message: "Rate limited, try again later",
        mobileNumber: cleanedNumber,
        sent: false,
        exists: true,
        error: "Rate limited",
      });
    }

    // Return 200 for other errors too, but indicate failure
    res.status(200).json({
      status: "failed",
      message: "Failed to send message",
      mobileNumber: cleanedNumber,
      sent: false,
      exists: true,
      error: err.message || "Unknown error",
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: isClientReady ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
  });
});

// Get client info endpoint
app.get("/info", async (req, res) => {
  if (!isClientReady || !whatsappClient) {
    return res.status(500).json({ error: "Client not ready" });
  }

  try {
    const info = whatsappClient.info;
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
});

// Session store status endpoint
app.get("/session-status", async (req, res) => {
  try {
    const status = {
      mongodbConnected: mongoose.connection.readyState === 1,
      storeInitialized: !!store,
      clientReady: isClientReady,
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
        console.log("🚀 ~ filesCollection:", db);
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
});

// MongoDB collections info endpoint
app.get("/mongodb-info", async (req, res) => {
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
});

// Reset session endpoint
app.post("/reset-session", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "MongoDB not connected" });
    }

    const db = mongoose.connection.db;

    // Delete session files
    await db.collection("whatsapp-RemoteAuth-mySession.files").deleteMany({});
    await db.collection("whatsapp-RemoteAuth-mySession.chunks").deleteMany({});

    console.log("🗑️ Session data deleted from MongoDB");

    res.json({
      success: true,
      message:
        "Session reset successfully. Restart the app to generate new QR code.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`ℹ️  Client info: http://localhost:${PORT}/info`);
  console.log(`💾 Session status: http://localhost:${PORT}/session-status`);
  console.log(`🗄️  MongoDB info: http://localhost:${PORT}/mongodb-info`);
  console.log(`🔄 Reset session: POST http://localhost:${PORT}/reset-session`);
});

module.exports = app;
