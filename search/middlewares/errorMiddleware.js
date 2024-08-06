// errorMiddleware.js
const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error("Error: %o", err);

  res.status(500).json({
    message: err.message,
    // Only include stack trace in development mode
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
