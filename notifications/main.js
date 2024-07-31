const express = require("express");
const dotenv = require("dotenv");
const WebSocket = require("ws");
const http = require("http");

dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.dev",
});

const app = express();
const server = http.createServer(app); // Create an HTTP server that Express will use

const clients = new Map(); // To keep track of WebSocket clients

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Notification service using WebSockets and Express");
});

// WebSocket setup
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the same HTTP server

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    const { jobId } = JSON.parse(message);
    console.log(`Received connection request for jobId: ${jobId}`);

    // Store the client connection with jobId
    console.log("When setting", jobId);
    clients.set(String(jobId), ws);
    console.log(`Stored client connection for jobId: ${jobId}`);

    ws.send(`Connected to server. Waiting for updates on jobId: ${jobId}`);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.forEach((client, jobId) => {
      if (client === ws) {
        clients.delete(jobId);
        console.log(`Removed client connection for jobId: ${jobId}`);
      }
    });
  });
});

console.log("WebSocket server is running on ws://localhost:8080");

// Express endpoint to update status
app.post("/update-status", (req, res) => {
  const { jobId, status } = req.body;
  console.log(`Received update for jobId: ${jobId} with status: ${status}`);

  const client = clients.get(String(jobId));
  if (client) {
    client.send(`Your job with jobId ${jobId} is ${status}`);
    console.log(`Informed client with jobId ${jobId} about status: ${status}`);

    if (status === "complete") {
      client.close();
      clients.delete(jobId);
      console.log(`Closed connection and removed client for jobId: ${jobId}`);
    }
    res.send(`Status for jobId ${jobId} updated successfully.`);
  } else {
    console.error(`No client connected with jobId: ${jobId}`);
    res.status(404).send(`No client connected with jobId: ${jobId}`);
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
