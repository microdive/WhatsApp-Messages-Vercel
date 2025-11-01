const { Client, RemoteAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { MongoStore } = require("wwebjs-mongo");
const {
  getPuppeteerArgs,
  MAX_RESTART_ATTEMPTS,
} = require("../config/whatsapp");
const {
  generateQRImage,
  broadcastQRUpdate,
  setCurrentQR,
  clearCurrentQR,
} = require("./qr.service");

let whatsappClient = null;
let isClientReady = false;
let restartAttempts = 0;
let isInitializing = false;
let store = null;

/**
 * Initialize WhatsApp Client
 * @param {MongoStore} mongoStore - MongoDB store instance
 */
function initializeWhatsAppClient(mongoStore) {
  if (!mongoStore) {
    console.error("❌ Store not initialized. Cannot create WhatsApp client.");
    return;
  }

  if (isInitializing) {
    console.log("⏳ Client initialization already in progress, skipping...");
    return;
  }

  store = mongoStore;
  isInitializing = true;
  restartAttempts = 0;

  console.log("🚀 Initializing WhatsApp Client with MongoDB session store...");

  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000, // 5 minutes
    }),
    puppeteer: {
      headless: true,
      args: getPuppeteerArgs(),
    },
  });

  // QR Code Generation
  client.on("qr", async (qr) => {
    console.log("🔗 QR RECEIVED - Session failed to load, need to scan QR:");
    console.log("📱 QR Code for WhatsApp Web:");
    qrcode.generate(qr, { small: true });

    // Generate QR image for web display
    const qrImage = await generateQRImage(qr);
    setCurrentQR(qr, qrImage);

    // Broadcast to all connected clients
    broadcastQRUpdate(qrImage, "qr_ready");
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
    clearCurrentQR();
    broadcastQRUpdate(null, "session_loaded");
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
    isInitializing = false;
    clearCurrentQR();
    broadcastQRUpdate(null, "ready");
  });

  // Authentication Success
  client.on("authenticated", () => {
    console.log("🔐 Authentication successful!");
    broadcastQRUpdate(null, "authenticated");
  });

  // Authentication Failure
  client.on("auth_failure", (msg) => {
    console.error("❌ Authentication failure:", msg);
    broadcastQRUpdate(null, "auth_failure");
  });

  // Client Disconnected
  client.on("disconnected", (reason) => {
    console.log("📱 Client was logged out:", reason);
    isClientReady = false;
    whatsappClient = null;
    isInitializing = false;

    // Attempt to restart the client after a delay
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      setTimeout(() => {
        console.log(
          `🔄 Attempting to restart WhatsApp client... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
        );
        initializeWhatsAppClient(store);
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
      isInitializing = false;
      if (restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        setTimeout(() => {
          console.log(
            `🔄 Attempting to restart WhatsApp client... (Attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
          );
          initializeWhatsAppClient(store);
        }, 10000);
      } else {
        console.error(
          "❌ Maximum restart attempts reached. Please restart the application manually."
        );
      }
    }
  });

  // Initialize Client with error handling
  client.initialize().catch((error) => {
    console.error("❌ Failed to initialize WhatsApp client:", error);
    isInitializing = false;

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
          initializeWhatsAppClient(store);
        }, 10000);
      } else {
        console.error(
          "❌ Maximum restart attempts reached. Please restart the application manually."
        );
      }
    }
  });
}

/**
 * Check if number exists on WhatsApp
 * @param {string} phoneNumber - Phone number in WhatsApp format
 * @returns {Promise<boolean>} - True if number exists
 */
async function checkNumberExists(phoneNumber) {
  try {
    if (!whatsappClient) {
      return false;
    }
    const numberId = await whatsappClient.getNumberId(phoneNumber);
    return numberId !== null;
  } catch (error) {
    console.log(`❌ Number check failed for ${phoneNumber}:`, error.message);
    return false;
  }
}

/**
 * Send message via WhatsApp
 * @param {string} phoneNumber - Phone number in WhatsApp format
 * @param {string} message - Message to send
 * @returns {Promise<object>} - Result object
 */
async function sendMessage(phoneNumber, message) {
  if (!whatsappClient || !isClientReady) {
    throw new Error("WhatsApp client not ready");
  }

  return await whatsappClient.sendMessage(phoneNumber, message.trim());
}

/**
 * Get client instance
 * @returns {Client|null} - WhatsApp client instance
 */
function getClient() {
  return whatsappClient;
}

/**
 * Check if client is ready
 * @returns {boolean} - True if client is ready
 */
function isReady() {
  return isClientReady;
}

module.exports = {
  initializeWhatsAppClient,
  checkNumberExists,
  sendMessage,
  getClient,
  isReady,
};
