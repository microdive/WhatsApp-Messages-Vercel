const QRCode = require("qrcode");

let qrClients = [];
let currentQR = null;
let currentQRImage = null;

/**
 * Generate QR code as base64 image
 * @param {string} qrText - QR code text
 * @returns {Promise<string|null>} - Base64 image or null on error
 */
async function generateQRImage(qrText) {
  try {
    const qrImage = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: "H",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      width: 400,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
    return qrImage;
  } catch (err) {
    console.error("Error generating QR image:", err);
    return null;
  }
}

/**
 * Broadcast QR update to all connected SSE clients
 * @param {string|null} qrImage - QR image as base64
 * @param {string} status - Status message
 */
function broadcastQRUpdate(qrImage, status) {
  const data = JSON.stringify({
    qr: qrImage,
    status: status,
    timestamp: new Date().toISOString(),
  });

  qrClients.forEach((client) => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      console.error("Error broadcasting to client:", err);
    }
  });
}

/**
 * Add SSE client to the list
 * @param {object} res - Express response object
 */
function addQRClient(res) {
  qrClients.push(res);
}

/**
 * Remove SSE client from the list
 * @param {object} res - Express response object
 */
function removeQRClient(res) {
  qrClients = qrClients.filter((client) => client !== res);
}

/**
 * Set current QR code
 * @param {string} qr - QR code text
 * @param {string|null} qrImage - QR image as base64
 */
function setCurrentQR(qr, qrImage) {
  currentQR = qr;
  currentQRImage = qrImage;
}

/**
 * Clear current QR code
 */
function clearCurrentQR() {
  currentQR = null;
  currentQRImage = null;
}

/**
 * Get current QR code
 * @returns {object} - Current QR code and image
 */
function getCurrentQR() {
  return {
    qr: currentQR,
    qrImage: currentQRImage,
  };
}

module.exports = {
  generateQRImage,
  broadcastQRUpdate,
  addQRClient,
  removeQRClient,
  setCurrentQR,
  clearCurrentQR,
  getCurrentQR,
};
