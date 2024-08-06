// server.js
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dotenv = require("dotenv");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const errorHandler = require("../../middlewares/errorMiddleware");

dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const app = express();
const PORT = process.env.PORT || 80;

const proxy = httpProxy.createProxyServer({
  target: process.env.NOTIFICATION_SERVICE_URI,
  ws: true,
});
const server = require("http").createServer(app);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  statusCode: 429,
  headers: true,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.get("/v1/search", async (req, res, next) => {
  try {
    if (!req.query.text)
      throw new Error("Please pass query string ?text=placename");
    const response = await fetch(
      `${process.env.SEARCH_SERVICE_URI}/search/?text=${req.query.text}`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.get("/v1/summaries", async (req, res, next) => {
  try {
    if (!req.query.jobId) {
      throw new Error("Please pass query string ?jobId=jobId");
    }
    const response = await fetch(
      `${process.env.SEARCH_SERVICE_URI}/summaries/?jobId=${req.query.jobId}`
    );
    const data = await response.json();
    res.json(data);
    console.log(
      `${process.env.SEARCH_SERVICE_URI}/summaries/?jobId=${req.query.jobId}`
    );
  } catch (err) {
    res.json(err);
  }
});

// Proxy websockets
server.on("upgrade", function (req, socket, head) {
  console.log("proxying upgrade request", req.url);
  proxy.ws(req, socket, head);
});

app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
