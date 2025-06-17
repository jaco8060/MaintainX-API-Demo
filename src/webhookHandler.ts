import axios from "axios";
import { WorkOrderPayload, WorkOrderWebhookPayload } from "./types";
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
  const { workOrderId } = payload; // Only destructure workOrderId as newWorkOrder might be missing

  // Log the full payload received to see its structure
  console.log(
    `[processWebhookEvent] Received payload for WO ${workOrderId}:`,
    JSON.stringify(payload),
  );

  let workOrderDetails: WorkOrderPayload | undefined = payload.newWorkOrder;

  // If newWorkOrder is missing from the webhook payload (common for WORK_ORDER_CHANGE),
  // make an API call to fetch the full Work Order details.
  if (!workOrderDetails) {
    console.log(
      `[processWebhookEvent] NewWorkOrder data missing from webhook for WO ${workOrderId}. Fetching full Work Order details...`,
    );
    try {
      const maintainxApiHeaders: Record<string, string> = {
        Authorization: `Bearer ${MAINTAINX_API_KEY}`,
        "Content-Type": "application/json", // Not strictly needed for GET, but good to have
      };
      if (MAINTAINX_ORG_ID) {
        maintainxApiHeaders["x-organization-id"] = MAINTAINX_ORG_ID;
      }

      const response = await axios.get(
        `${MAINTAINX_BASE_URL}/workorders/${workOrderId}`, // GET endpoint
        { headers: maintainxApiHeaders },
      );
      workOrderDetails = response.data.workOrder as WorkOrderPayload; // API returns { workOrder: {...} }

      console.log(
        `[processWebhookEvent] Successfully fetched full details for WO ${workOrderId}.`,
      );
    } catch (error: any) {
      console.error(
        `[processWebhookEvent] Failed to fetch full details for WO ${workOrderId}:`,
        error.response ? error.response.data : error.message,
      );
      // If we can't fetch the details, we can't proceed with automation.
      return;
    }
  }

  // Now, workOrderDetails should contain the full WO, whether from webhook or GET call
  if (!workOrderDetails) {
    // Should not happen after the GET, but defensive
    console.error(
      `[processWebhookEvent] Could not obtain Work Order details for WO ${workOrderId}. Cannot proceed with automation.`,
    );
    return;
  }

  const currentPriority = workOrderDetails.priority;

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

  console.log("--- API Key Debug ---");
  console.log(`Full MAINTAINX_API_KEY (DEBUG):${MAINTAINX_API_KEY}`); // Remove this line for production

  // Update Work Order in MaintainX
  try {
    const maintainxApiHeaders: Record<string, string> = {
      Authorization: `Bearer ${MAINTAINX_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (MAINTAINX_ORG_ID) {
      maintainxApiHeaders["x-organization-id"] = MAINTAINX_ORG_ID;
    }

    const updatePayload = {
      dueDate: calculatedDueDate,
    };

    const response = await axios.patch(
      `${MAINTAINX_BASE_URL}/workorders/${workOrderId}`,
      updatePayload,
      { headers: maintainxApiHeaders },
    );

    console.log(
      `[processWebhookEvent] Successfully updated Work Order ${workOrderId}. Status: ${response.status}`,
    );
    console.log(
      `[processWebhookEvent] Rate Limit Remaining: ${response.headers["x-rate-limit-remaining"] || "N/A"}`,
    );
    console.log(
      `[processWebhookEvent] Rate Limit Reset: ${response.headers["x-rate-limit-reset"] || "N/A"} seconds`,
    );
  } catch (error: any) {
    console.error(
      `[processWebhookEvent] Failed to update Work Order ${workOrderId} in MaintainX:`,
      error.response ? error.response.data : error.message,
    );

    if (
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status === 429
    ) {
      const retryAfter = error.response.headers["x-rate-limit-reset"] || 10;
      console.warn(
        `[processWebhookEvent] Rate limited. Retrying after ${retryAfter} seconds. (In production, would queue for retry)`,
      );
    }
  }
}
