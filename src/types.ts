/**
 * @typedef {'HIGH' | 'LOW' | 'MEDIUM' | 'NONE'} WorkOrderPriority
 * Represents the priority of a Work Order in MaintainX.
 */
export type WorkOrderPriority = "HIGH" | "LOW" | "MEDIUM" | "NONE";

/**
 * @interface WorkOrderPayload
 * Defines the structure of a Work Order object as received in webhook payloads or used in API calls.
 */
export interface WorkOrderPayload {
  priority?: WorkOrderPriority;
  dueDate?: string; // ISO 8601 string
  title: string;
  assetId?: number;
  locationId?: number;
  description?: string;
}

/**
 * @interface WorkOrderWebhookPayload
 * Defines the complete structure of a MaintainX Work Order webhook payload.
 */
export interface WorkOrderWebhookPayload {
  workOrderId: number;
  orgId: number;
  occurredAt: string;
  newWorkOrder?: WorkOrderPayload;
}
