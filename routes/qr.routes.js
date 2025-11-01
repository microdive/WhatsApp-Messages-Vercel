const express = require("express");
const router = express.Router();
const { getQRPage, getQRStream } = require("../controllers/qr.controller");

router.get("/qr", getQRPage);
router.get("/qr-stream", getQRStream);

module.exports = router;
