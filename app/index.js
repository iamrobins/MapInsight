const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const logger = require("./logger");
const sampleData = require("./mock/sample-data3");
const errorHandler = require("./errorMiddleware");
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(errorHandler);

app.use(express.json({ limit: "50mb" }));
const apiKey = process.env.MAP_INSIGHT_GCP_KEY;
const url = "https://places.googleapis.com/v1/places:searchText";

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

app.get("/wake-up", (req, res) => {
  logger.info("Woke up");
  res.status(200).send("Woke up");
});

function parseReviewSummary(summaryStr) {
  // Define regex patterns
  const positivePattern =
    /\*\*Key Positive Points:\*\*\n- (.+?)(?=\n\n\*\*|$)/s;
  const negativePattern =
    /\*\*Key Negative Points:\*\*\n- (.+?)(?=\n\n\*\*|$)/s;
  const overallPattern = /\*\*Overall Impression:\*\*\n(.+)/s;

  // Extract positive points
  const positiveMatch = summaryStr.match(positivePattern);
  const positivePoints = positiveMatch ? positiveMatch[1].split("\n- ") : [];

  // Extract negative points
  const negativeMatch = summaryStr.match(negativePattern);
  const negativePoints = negativeMatch ? negativeMatch[1].split("\n- ") : [];

  // Extract overall impression
  const overallMatch = summaryStr.match(overallPattern);
  const overallImpression = overallMatch ? overallMatch[1].trim() : "";

  // Create the dictionary
  const reviewSummary = {
    key_positives: positivePoints,
    key_negatives: negativePoints,
    overall_impression: overallImpression,
  };

  return reviewSummary;
}

const summarizeReviews = async (placeDetails) => {
  if (process.env.NODE_ENV != "production") {
    parsedSummary = parseReviewSummary(
      "**Summary for Sticks'n'Sushi Covent Garden**\n\n**Key Positive Points:**\n- High-quality food with fresh and flavorful ingredients.\n- Sushi platter is beautifully presented and well-received by customers.\n- The sticks, particularly the duck, are highlighted as exceptionally tasty.\n- Some customers praised the service as fantastic, particularly noting attentive staff who accommodated special dietary needs.\n- Consistent quality in food across different locations, with some new and innovative menu items appreciated.\n\n**Key Negative Points:**\n- Service issues are a common complaint, with many reviews noting inattentive or disengaged staff.\n- Long wait times for order taking, refills, and bill processing.\n- Some customers found the sushi to be average and not as impressive as expected.\n- High prices are mentioned, with desserts described as average and not worth trying.\n\n**Overall Impression:**\nSticks'n'Sushi Covent Garden offers excellent food with fresh and flavorful options, particularly praised for their sushi and sticks. However, the location struggles with service consistency, leading to a mixed dining experience. While some guests enjoy attentive service and innovative dishes, others report significant service lapses that detract from the overall experience. The location may appeal to those prioritizing food quality but could disappoint those seeking attentive service."
    );
    return parsedSummary;
  }

  const placeName = placeDetails.placeName || "Unknown Place";
  const reviews = placeDetails.reviews || [];

  if (reviews.length === 0) {
    console.log("No reviews found for the place.");
    return null;
  }

  // Extract review texts
  const reviewTexts = reviews.map((review) => review.text);

  // Create a prompt for the GPT model
  const prompt = `Summarize the following reviews for ${placeName}. Include key positive points, key negative points, and an overall impression.\n\nReviews:\n${reviewTexts.join(
    "\n"
  )}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant specialized in summarizing reviews for various locations. Your task is to analyze customer reviews and provide a structured summary. Each summary should include: 
                1. Key positive points that customers appreciate.
                2. Key negative points or common complaints.
                3. An overall impression of the place based on the reviews.
                Ensure the summary is concise, objective, and uses bullet points for clarity. 
                Do not add personal opinions or external information. 
                Focus on extracting sentiments and insights from the given reviews.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 256,
      top_p: 1,
      n: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    // Extract the summary from the response
    const summary = response.choices[0].message.content.trim();

    return parseReviewSummary(summary);
  } catch (error) {
    console.error("Error summarizing reviews:", error);
    return null;
  }
};

app.get("/search", async (req, res, next) => {
  if (process.env.NODE_ENV != "production") {
    if (!req.query.text)
      throw new Error("Please pass query string ?text=placename");

    const placesDev = sampleData["places"];
    // const placesDev = extractPlaces(places);
    const summarizedPlacesDev = await Promise.all(
      placesDev.map(async (place) => {
        const summary = await summarizeReviews(place);
        return { ...place, summary };
      })
    );

    return res.status(200).json({ places: summarizedPlacesDev });
  } else {
    try {
      if (!req.query.text)
        throw new Error("Please pass query string ?text=placename");

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

      const data = await response.json();
      const extractedPlaces = extractPlaces(data["places"]);
      const summarizedPlaces = await Promise.all(
        extractedPlaces.map(async (place) => {
          const summary = await summarizeReviews(place);
          return { ...place, summary };
        })
      );

      res.status(200).json({ places: summarizedPlaces });
    } catch (error) {
      next(error); // Passes the error to the error handling middleware
    }
  }
});

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
