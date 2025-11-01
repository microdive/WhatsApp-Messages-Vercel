const express = require("express");
const router = express.Router();
const {
  getRoot,
  getHealth,
  getInfo,
  getSessionStatus,
  getMongoDBInfo,
  resetSession,
} = require("../controllers/status.controller");

router.get("/", getRoot);
router.get("/health", getHealth);
router.get("/info", getInfo);
router.get("/session-status", getSessionStatus);
router.get("/mongodb-info", getMongoDBInfo);
router.post("/reset-session", resetSession);

module.exports = router;
