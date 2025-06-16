import * as crypto from "crypto";
import { WorkOrderPriority } from "./types";

/**
 * Calculates the due date for a Work Order based on its priority.
 *
 * @param {WorkOrderPriority | undefined} priority - The priority of the Work Order.
 * @returns {string | null} An ISO 8601 formatted date string for the due date, or null if calculation fails.
 */
export const calculateDueDate = (
  priority: WorkOrderPriority | undefined,
): string | null => {
  const today = new Date();
  let daysToAdd = 0;

  switch (priority) {
    case "HIGH":
      daysToAdd = 1; // Due tomorrow
      break;
    case "MEDIUM":
      daysToAdd = 3; // Due in 3 days
      break;
    case "LOW":
      daysToAdd = 7; // Due in 7 days
      break;
    case "NONE":
      daysToAdd = 14; // Default for 'NONE' priority
      break;
    default:
      console.warn(
        `[calculateDueDate] Unknown or undefined priority: "${priority}". Defaulting to 7 days.`,
      );
      daysToAdd = 7;
      break;
  }

  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + daysToAdd);

  return dueDate.toISOString();
};

/**
 * Verifies the signature of an incoming MaintainX webhook request.
 * This ensures the request originates from MaintainX and has not been tampered with.
 *
 * @param {string | undefined} signatureHeader - The value of the 'x-maintainx-webhook-body-signature' header.
 * @param {Buffer | undefined} rawBody - The raw request body as a Buffer.
 * @param {string} secret - The webhook secret configured in MaintainX.
 * @param {number} [toleranceMinutes=5] - The allowed time difference (in minutes) for the timestamp to prevent replay attacks.
 * @returns {boolean} True if the signature is valid and the timestamp is fresh, false otherwise.
 */
export const verifyWebhookSignature = (
  signatureHeader: string | undefined,
  rawBody: Buffer | undefined,
  secret: string,
  toleranceMinutes: number = 5,
): boolean => {
  if (!signatureHeader) {
    console.error("[verifyWebhookSignature] Signature header is missing.");
    return false;
  }
  if (!rawBody) {
    console.error(
      "[verifyWebhookSignature] Raw body is missing for verification.",
    );
    return false;
  }

  const [timestampPart, v1SignaturePart] = signatureHeader.split(",");
  const timestamp = timestampPart ? timestampPart.split("=")[1] : null;
  const signature = v1SignaturePart ? v1SignaturePart.split("=")[1] : null;

  if (!timestamp || !signature) {
    console.error("[verifyWebhookSignature] Malformed signature header parts.");
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // Compare signatures in a time-constant manner to prevent timing attacks
  const isValidSignature = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  // Check for replay attacks
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const now = Date.now();
  const receivedTimestamp = parseInt(timestamp, 10) * 1000; // Convert seconds to milliseconds
  const isFresh = now - receivedTimestamp < toleranceMs;

  if (!isValidSignature) {
    console.error("[verifyWebhookSignature] Signature mismatch.");
  }
  if (!isFresh) {
    console.error(
      `[verifyWebhookSignature] Webhook timestamp too old. Received: ${new Date(receivedTimestamp).toISOString()}, Now: ${new Date(now).toISOString()}`,
    );
  }

  return isValidSignature && isFresh;
};
