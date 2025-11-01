const { normalizePhoneNumber } = require("../utils/phoneNumber");
const {
  isReady,
  checkNumberExists,
  sendMessage,
} = require("../services/whatsapp.service");

/**
 * Send WhatsApp message
 */
const sendWhatsAppMessage = async (req, res) => {
  const { phone, message } = req.body;
  console.log("📨 Incoming request:", req.body);

  // Check if client is ready
  if (!isReady()) {
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
    console.log("🚀 ~ numberExists:", numberExists);

    if (!numberExists) {
      console.log(
        `⚠️  Number ${cleanedNumber} does not exist - skipping message`
      );
      return res.status(200).json({
        status: "skipped",
        message: "Number does not exist on WhatsApp",
        mobileNumber: cleanedNumber,
        sent: false,
        exists: false,
      });
    }

    // Send message
    await sendMessage(phoneNumber, message);
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
};

module.exports = {
  sendWhatsAppMessage,
};
