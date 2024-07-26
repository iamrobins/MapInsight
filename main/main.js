const express = require("express");
const dotenv = require("dotenv");
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const errorHandler = require("./errorMiddleware");
const logger = require("./logger");
const app = express();

app.use(express.json());

app.get("/", async (req, res, next) => {
  const apiKey = process.env.MAP_INSIGHT_GCP_KEY;
  const url = "https://places.googleapis.com/v1/places:searchText";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.reviews",
      },
      body: JSON.stringify({
        textQuery: "Peri Peri in Hatfield, UK",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data_res = await response.json();
    res.send(data_res);
  } catch (error) {
    next(error); // Passes the error to the error handling middleware
  }
});

// Apply the error handling middleware
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
