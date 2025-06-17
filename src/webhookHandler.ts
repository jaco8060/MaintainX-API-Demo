import axios from "axios";
import { WorkOrderWebhookPayload } from "./types";
import { calculateDueDate } from "./utils"; // Import utility for date calculation

// --- Environment Variables for API interaction ---
// These will be loaded via dotenv in index.ts and made available globally.
const MAINTAINX_BASE_URL: string =
  process.env.MAINTAINX_BASE_URL || "https://api.getmaintainx.com/v1";
const MAINTAINX_API_KEY: string = process.env.MAINTAINX_API_KEY as string;
const MAINTAINX_ORG_ID: string | undefined = process.env.MAINTAINX_ORG_ID;

/**
 * Processes an incoming MaintainX Work Order webhook event.
 * This function retrieves the Work Order priority, calculates the new due date,
 * and updates the Work Order in MaintainX via its API.
 *
 * @param {WorkOrderWebhookPayload} payload - The parsed webhook payload.
 * @returns {Promise<void>} A promise that resolves when processing is complete.
 */
export async function processWebhookEvent(
  payload: WorkOrderWebhookPayload,
): Promise<void> {
  const { workOrderId, newWorkOrder } = payload;

  // Add a basic check for newWorkOrder being present, as it contains the priority.
  if (!newWorkOrder) {
    console.log(
      `[processWebhookEvent] Work Order event for WO ${workOrderId} missing newWorkOrder data. Skipping automation.`,
    );
    return;
  }

  const currentPriority = newWorkOrder.priority;

  if (!currentPriority) {
    console.log(
      `[processWebhookEvent] Work Order ${workOrderId} has no priority set. Skipping due date automation.`,
    );
    return;
  }

  const calculatedDueDate = calculateDueDate(currentPriority);

  if (!calculatedDueDate) {
    console.error(
      `[processWebhookEvent] Could not calculate due date for Work Order ${workOrderId} with priority ${currentPriority}.`,
    );
    return;
  }

  console.log(
    `[processWebhookEvent] Calculated new due date for WO ${workOrderId} (Priority: ${currentPriority}): ${calculatedDueDate}`,
  );

  // console.log("--- API Key Debug ---");
  // console.log(`Full MAINTAINX_API_KEY (DEBUG):${MAINTAINX_API_KEY}`);

  // Update Work Order in MaintainX
  try {
    // Headers for MaintainX API call: Authorization (Bearer Token) and Content-Type.
    // x-organization-id is added if using a multi-organization token.
    const maintainxApiHeaders: Record<string, string> = {
      Authorization: `Bearer ${MAINTAINX_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (MAINTAINX_ORG_ID) {
      maintainxApiHeaders["x-organization-id"] = MAINTAINX_ORG_ID;
    }

    // Payload for PATCH /workorders/{id} request, setting the 'dueDate' field.
    const updatePayload = {
      dueDate: calculatedDueDate,
    };

    const response = await axios.patch(
      `${MAINTAINX_BASE_URL}/workorders/${workOrderId}`, // Endpoint: PATCH /workorders/{id}
      updatePayload,
      { headers: maintainxApiHeaders },
    );

    console.log(
      `[processWebhookEvent] Successfully updated Work Order ${workOrderId}. Status: ${response.status}`,
    );
    // Log rate limit headers for monitoring/debugging.
    console.log(
      `[processWebhookEvent] Rate Limit Remaining: ${response.headers["x-rate-limit-remaining"] || "N/A"}`,
    );
    console.log(
      `[processWebhookEvent] Rate Limit Reset: ${response.headers["x-rate-limit-reset"] || "N/A"} seconds`,
    );
  } catch (error: any) {
    // Using 'any' to access axios-specific error properties

    // Error Handling & Rate Limiting Retries
    // Handle 429 Too Many Requests errors specifically.
    if (
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status === 429
    ) {
      const retryAfter = error.response.headers["x-rate-limit-reset"] || 10; // Use x-rate-limit-reset for retry-after period
      console.warn(
        `[processWebhookEvent] Rate limited. Retrying after ${retryAfter} seconds. (In production, would queue for retry)`,
      );
    } else {
      // Log other errors for investigation (e.g., 400 Bad Request, 404 Not Found, 5xx Server Error)
      console.error(
        `[processWebhookEvent] Failed to update Work Order ${workOrderId} in MaintainX:`,
        error.response ? error.response.data : error.message,
      );
    }
  }
}
