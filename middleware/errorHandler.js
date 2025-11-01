const { MAX_RESTART_ATTEMPTS } = require("../config/whatsapp");

let restartAttempts = 0;
let restartCallback = null;

/**
 * Set restart callback function
 * @param {Function} callback - Function to call when restart is needed
 */
function setRestartCallback(callback) {
  restartCallback = callback;
}

/**
 * Handle unhandled promise rejections
 */
function setupUnhandledRejectionHandler() {
  process.on("unhandledRejection", (reason, promise) => {
    // Silently ignore RemoteAuth temp zip unlink errors (library bug/no-op)
    if (
      reason &&
      (reason.code === "ENOENT" || /ENOENT/.test(String(reason))) &&
      (reason.syscall === "unlink" || /unlink/.test(String(reason))) &&
      /RemoteAuth\.zip$/.test(String(reason.path || reason))
    ) {
      console.log(
        "ℹ️  Ignored missing temp file cleanup for RemoteAuth.zip (safe to ignore)"
      );
      return;
    }

    // Handle "Execution context was destroyed" errors - common during page navigation
    if (
      reason &&
      reason.message &&
      reason.message.includes("Execution context was destroyed")
    ) {
      console.log(
        "ℹ️  Execution context destroyed during navigation (safe to ignore during initialization)"
      );
      return;
    }

    // Handle Protocol errors with restart logic
    if (reason && reason.message && reason.message.includes("Protocol error")) {
      console.log(
        "🔄 Protocol error detected in unhandled rejection, attempting restart..."
      );
      if (restartAttempts < MAX_RESTART_ATTEMPTS && restartCallback) {
        restartAttempts++;
        restartCallback();
      } else if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        console.error(
          "❌ Maximum restart attempts reached. Please restart the application manually."
        );
      }
      return;
    }

    // Log other unhandled rejections for debugging
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  });
}

/**
 * Handle uncaught exceptions
 */
function setupUncaughtExceptionHandler() {
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    if (error.message && error.message.includes("Protocol error")) {
      console.log(
        "🔄 Protocol error detected in uncaught exception, attempting restart..."
      );
      if (restartAttempts < MAX_RESTART_ATTEMPTS && restartCallback) {
        restartAttempts++;
        restartCallback();
      }
    }
  });
}

module.exports = {
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler,
  setRestartCallback,
};
