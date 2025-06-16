import crypto from "crypto";
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

// Placeholder for verifyWebhookSignature, will be implemented in a later commit
export const verifyWebhookSignature = (
  signatureHeader: string | undefined,
  rawBody: Buffer | undefined,
  secret: string,
  toleranceMinutes: number = 5,
): boolean => {
  // Placeholder: actual implementation in a later commit
  return false;
};
