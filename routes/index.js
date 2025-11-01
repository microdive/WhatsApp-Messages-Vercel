const express = require("express");
const router = express.Router();
const qrRoutes = require("./qr.routes");
const messageRoutes = require("./message.routes");
const statusRoutes = require("./status.routes");

router.use(qrRoutes);
router.use(messageRoutes);
router.use(statusRoutes);

module.exports = router;
