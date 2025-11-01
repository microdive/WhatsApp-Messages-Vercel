const { parsePhoneNumber, isValidPhoneNumber } = require("libphonenumber-js");

/**
 * Normalize phone number using libphonenumber-js
 * @param {string} phone - Phone number to normalize
 * @returns {string|null} - Normalized phone number or null if invalid
 */
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

    // First check if the number is valid with default country
    if (!isValidPhoneNumber(phoneStr, "PK")) {
      console.log(`📞 Invalid phone number format: ${phoneStr}`);
      return null;
    }

    // Parse the phone number with default country
    const phoneNumber = parsePhoneNumber(phoneStr, "PK");

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

module.exports = { normalizePhoneNumber };
