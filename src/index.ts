// src/index.ts

import bodyParser from "body-parser";
import "dotenv/config"; // Loads environment variables from .env
import express, { Request, Response } from "express";
import { WorkOrderWebhookPayload } from "./types"; // Import types
import { verifyWebhookSignature } from "./utils"; // Import webhook verification utility
import { processWebhookEvent } from "./webhookHandler"; // Import webhook processing logic

const app = express();
const PORT: number = parseInt(process.env.SERVICE_PORT || "3000", 10);
const MAINTAINX_WEBHOOK_SECRET: string = process.env
  .MAINTAINX_WEBHOOK_SECRET as string;

// Ensure critical environment variables are set
if (!MAINTAINX_WEBHOOK_SECRET) {
  console.error("Error: MAINTAINX_WEBHOOK_SECRET is not set in .env. Exiting.");
  process.exit(1);
}

// Middleware to parse raw body for signature verification first.
// The 'verify' function is critical here to capture the raw Buffer before JSON parsing.
app.use(
  bodyParser.json({
    verify: (req: Request, res: Response, buf: Buffer) => {
      (req as any).rawBody = buf; // Store raw body on the request object
    },
  }),
);

/**
 * Main endpoint for MaintainX webhooks.
 * It verifies the webhook signature and then asynchronously processes the event.
 * This endpoint is designed to receive POST requests from MaintainX when
 * Work Order events (New or Change) occur.
 * @route POST /maintainx-webhook
 */
app.post("/maintainx-webhook", (req: Request, res: Response) => {
  // 1. Verify Webhook Signature using the utility function.
  // This relies on the 'x-maintainx-webhook-body-signature' header and the raw request body.
  if (
    !verifyWebhookSignature(
      req.headers["x-maintainx-webhook-body-signature"] as string | undefined,
      (req as any).rawBody,
      MAINTAINX_WEBHOOK_SECRET,
    )
  ) {
    console.error(
      "[index] Webhook signature verification failed or timestamp is old. Denying request.",
    );
    res.status(401).send("Unauthorized"); // Send the response
    return; // <-- Explicitly return to stop further execution in this handler
  }

  // 2. Acknowledge receipt immediately as per MaintainX webhook best practices.
  // This prevents MaintainX from retrying the webhook unnecessarily.
  res.status(200).send("Webhook received, processing asynchronously."); // Send the response (no `return` here)

  // 3. Process the webhook event asynchronously.
  // This offloads the heavy lifting from the HTTP request thread,
  // allowing the 200 OK response to be sent quickly.
  // The payload is cast to WorkOrderWebhookPayload for type safety.
  processWebhookEvent(req.body as WorkOrderWebhookPayload);
});

/**
 * Basic health check endpoint.
 * Useful for load balancers or container orchestration (e.g., Kubernetes liveness/readiness probes).
 * @route GET /health
 */
app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("Service is healthy!");
});

// Start the server
app.listen(PORT, () => {
  console.log(
    `MaintainX Work Order Due Date Automation service running on port ${PORT}`,
  );
  console.log(
    `Webhook URL for MaintainX: http://localhost:${PORT}/maintainx-webhook`,
  );
  console.log(
    "(Remember to use ngrok or similar for a public URL if testing locally)",
  );
});
