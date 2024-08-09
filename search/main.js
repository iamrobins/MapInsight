const express = require("express");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const amqp = require("amqplib");
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const errorHandler = require("./middlewares/errorMiddleware");
const logger = require("./utils/logger");
const sampleData = require("./mock/sample-data");
const app = express();

const mongoClient = new MongoClient(process.env.MONGO_URI);

const dbName = "MapInsight";
let db;
let jobStatusCollection;
let placesCollection;

async function connectMongo() {
  // Use connect method to connect to the server
  await mongoClient.connect();
  console.log("Connected successfully to server");
  db = mongoClient.db(dbName);
  jobStatusCollection = db.collection("jobStatus");
  placesCollection = db.collection("places");
}

connectMongo();

app.use(express.json({ limit: "50mb" }));
let connection;
let channel;
const apiKey = process.env.MAP_INSIGHT_GCP_KEY;
const url = "https://places.googleapis.com/v1/places:searchText";

async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBIT_MQ_URI);

    connection.on("error", (err) => {
      logger.error("RabbitMQ connection error:", err);
      throw new Error("RabbitMQ connection error");
    });

    connection.on("close", () => {
      logger.info("RabbitMQ connection closed");
    });

    channel = await connection.createChannel();

    await channel.assertQueue("insight", {
      durable: true,
    });

    await connection.createChannel();
  } catch (error) {
    logger.error("Failed to connect to RabbitMQ:", error.message);
    throw error;
  }
}
// Connect to RabbitMQ
connectRabbitMQ();
const extractPlaces = (places) =>
  places
    .filter(
      (p) =>
        p.photos && p.photos.length > 0 && p.reviews && p.reviews.length > 0
    )
    .map((d) => ({
      id: d.id,
      placeName: d.displayName.text,
      address: d.formattedAddress,
      location: d.location,
      phoneNumber: d.internationalPhoneNumber,
      website: d.websiteUri,
      gMapsUri: d.googleMapsUri,
      rating: d.rating,
      userRatingCount: d.userRatingCount,
      photos: d.photos.slice(0, 5).map((p) => ({
        name: p.name,
        heightPx: p.heightPx,
        widthPx: p.widthPx,
      })),
      reviews: d.reviews.slice(0, 5).map((r) => ({
        authorName: r.authorAttribution.displayName,
        authorPhoto: r.authorAttribution.photoUri,
        text: r.originalText.text,
        rating: r.rating,
        publishTime: r.publishTime,
        relativePublishTimeDescription: r.relativePublishTimeDescription,
      })),
    }));

app.get("/search", async (req, res, next) => {
  if (process.env.NODE_ENV != "production") {
    if (!req.query.text)
      throw new Error("Please pass query string ?text=placename");

    const jobId = uuidv4();
    const places = sampleData["places"];
    const placesDev = extractPlaces(places);

    logger.info("JobId generated and received places data");
    channel.sendToQueue(
      "insight",
      Buffer.from(JSON.stringify({ jobId, data: placesDev }))
    );
    logger.info("JobId and data added to insight Queue");
    return res.status(200).json({ jobId, data: placesDev });
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
            "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.photos,places.websiteUri,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.reviews",
        },
        body: JSON.stringify({
          textQuery: req.query.text,
          pageSize: 5,
        }),
      });

      if (!response.ok)
        throw new Error(`Failed to fetch: ${response.statusText}`);

      logger.info("JobId generated and received places data");
      const data = await response.json();
      const places = extractPlaces(data["places"]);

      channel.sendToQueue(
        "insight",
        Buffer.from(JSON.stringify({ jobId, data: places }))
      );
      logger.info("JobId and data added to insight Queue");
      res.status(200).json({ jobId, data: places });
    } catch (error) {
      next(error); // Passes the error to the error handling middleware
    }
  }
});

app.get("/summaries", async (req, res, next) => {
  try {
    if (!req.query.jobId) {
      throw new Error("Please pass query string ?jobId=jobId");
    }

    const jobId = req.query.jobId; // Convert jobId to number if necessary
    const job = await jobStatusCollection.findOne({ jobId });

    if (!job) {
      throw new Error(`No job found with jobId: ${jobId}`);
    }

    const { status, placeIds } = job;
    if (status !== "complete") {
      throw new Error(`Job with jobId: ${jobId} is not complete`);
    }

    // Fetch summaries for each place
    const summaries = await Promise.all(
      placeIds.map(async (placeId) => {
        const summary = await placesCollection.findOne({ id: placeId });
        return summary; // Return the summary for each place
      })
    );

    return res.send(summaries);
  } catch (error) {
    next(error); // Passes the error to the error handling middleware
  }
});

// Apply the error handling middleware
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
