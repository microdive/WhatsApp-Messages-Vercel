const express = require("express");
const router = express.Router();
const { sendWhatsAppMessage } = require("../controllers/message.controller");

router.post("/send", sendWhatsAppMessage);

module.exports = router;
