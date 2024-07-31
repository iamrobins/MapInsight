const express = require("express");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const amqp = require("amqplib");
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const errorHandler = require("./errorMiddleware");
const logger = require("./logger");
const sampleData = require("./sample-data");
const app = express();

app.use(express.json());
let connection;
let channel;
const apiKey = process.env.MAP_INSIGHT_GCP_KEY;
const url = "https://places.googleapis.com/v1/places:searchText";

async function connectRabbitMQ() {
  try {
    connection = await amqp.connect("amqp://guest:guest@localhost:5672");

    connection.on("error", (err) => {
      logger.error("RabbitMQ connection error:", err);
      throw new Error("RabbitMQ connection error");
    });

    connection.on("close", () => {
      logger.info("RabbitMQ connection closed");
    });

    channel = await connection.createChannel();

    channel.consume("status", (msg) => {
      if (msg !== null) {
        const data = JSON.parse(msg.content);
        channel.ack(msg);
      } else {
        console.log("Consumer cancelled by server");
      }
    });
  } catch (error) {
    logger.error("Failed to connect to RabbitMQ:", error.message);
    throw error;
  }
}

// Connect to RabbitMQ
connectRabbitMQ();

app.get("/search", async (req, res, next) => {
  if (process.env.NODE_ENV != "production") {
    const jobId = uuidv4();

    logger.info("JobId generated and received places data");
    channel.sendToQueue(
      "insight",
      Buffer.from(JSON.stringify({ jobId, data: sampleData }))
    );
    logger.info("JobId and data added to insight Queue");
    return res.status(200).json({ jobId, data: sampleData });
  } else {
    try {
      if (!req.query.text)
        throw new Error("Please pass query string ?text=placename");

      const jobId = uuidv4();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.photos,places.websiteUri,places.currentOpeningHours,places.regularOpeningHours,places.nationalPhoneNumber,places.internationalPhoneNumber,places.reviews",
        },
        body: JSON.stringify({
          textQuery: req.query.text,
        }),
      });

      if (!response.ok)
        throw new Error(`Failed to fetch: ${response.statusText}`);

      logger.info("JobId generated and received places data");
      const data = await response.json();
      channel.sendToQueue(
        "insight",
        Buffer.from(JSON.stringify({ jobId, data }))
      );
      logger.info("JobId and data added to insight Queue");
      res.status(200).json({ jobId, data });
    } catch (error) {
      next(error); // Passes the error to the error handling middleware
    }
  }
});

app.get("/search", async (req, res, next) => {
  try {
    // Example: Send a message

    console.log("Message sent");

    // // Close the connection
    // await connection.close();
    res.json({ jobId });
  } catch (error) {
    next(error);
  }
});

// Apply the error handling middleware
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
