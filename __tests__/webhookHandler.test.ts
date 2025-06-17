// __tests__/webhookHandler.test.ts

// Mock environment variables as `process.env` is a dependency.
process.env.MAINTAINX_BASE_URL = "https://api.testmaintainx.com/v1";
process.env.MAINTAINX_API_KEY = "test_api_key";
process.env.MAINTAINX_ORG_ID = "test_org_id";

import axios from "axios";
import { WorkOrderPayload, WorkOrderWebhookPayload } from "../src/types";

// Mock axios globally to prevent actual HTTP requests during tests.
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Partially mock '../src/utils' to control `calculateDueDate` specifically.
jest.mock("../src/utils", () => ({
  ...jest.requireActual("../src/utils"),
  calculateDueDate: jest.fn(), // Create a mock function for `calculateDueDate`.
}));
// Import the mocked `calculateDueDate` to gain access to its Jest spy methods.
import { calculateDueDate } from "../src/utils";

// Import the module under test. It will now receive the mocked dependencies.
import { processWebhookEvent } from "../src/webhookHandler";

describe("processWebhookEvent", () => {
  // Spies for console methods to assert on logs without cluttering test output.
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks (axios, calculateDueDate, console spies) for test isolation.
    jest.clearAllMocks();

    // IMPORTANT FIX: Mock axios.isAxiosError to always return true.
    // This simplifies the behavior and ensures the `if` condition in webhookHandler.ts is met.
    mockedAxios.isAxiosError.mockReturnValue(true);

    // Set up console spies for each test, mocking their implementation.
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Provide a default return value for `calculateDueDate` for tests that don't override it.
    (calculateDueDate as jest.Mock).mockReturnValue(
      new Date("2024-06-16T00:00:00.000Z").toISOString(),
    );
  });

  afterEach(() => {
    // Restore original console methods after each test.
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("should calculate and update due date for a new HIGH priority work order", async () => {
    const mockDueDate = new Date("2024-06-16T00:00:00.000Z").toISOString();
    // Override default `calculateDueDate` mock for this specific test case.
    (calculateDueDate as jest.Mock).mockReturnValue(mockDueDate);

    // Mock a successful axios patch response including headers.
    mockedAxios.patch.mockResolvedValueOnce({
      status: 200,
      headers: { "x-rate-limit-remaining": "99", "x-rate-limit-reset": "30" },
      data: {},
      statusText: "OK",
      config: {},
      request: {},
    });

    const payload: WorkOrderWebhookPayload = {
      workOrderId: 404,
      orgId: 456,
      occurredAt: new Date().toISOString(),
      newWorkOrder: undefined, // Simulate newWorkOrder missing from webhook
    };

    await processWebhookEvent(payload);

    // Assert `calculateDueDate` was called correctly.
    expect(calculateDueDate).toHaveBeenCalledWith("HIGH");
    expect(calculateDueDate).toHaveBeenCalledTimes(1);

    // Assert `axios.patch` was called with correct URL, payload, and headers.
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      "https://api.testmaintainx.com/v1/workorders/101",
      { dueDate: mockDueDate },
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test_api_key",
          "Content-Type": "application/json",
          "x-organization-id": "test_org_id",
        },
      }),
    );
    expect(mockedAxios.patch).toHaveBeenCalledTimes(1);

    // Assert success and rate limit logs.
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Calculated new due date for WO 101 (Priority: HIGH): ${mockDueDate}`,
      ),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Successfully updated Work Order 101. Status: 200",
      ),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Rate Limit Remaining: 99"),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Rate Limit Reset: 30 seconds"),
    );
  });

  it("should log an error if MaintainX API call fails", async () => {
    // Create a mock AxiosError object for rejection. Crucial for `axios.isAxiosError` check.
    const mockErrorResponse = {
      response: { status: 500, data: "Internal Server Error", headers: {} },
      isAxiosError: true,
      message: "Request failed with status code 500",
      name: "AxiosError",
      config: {} as any,
      code: "ERR_BAD_RESPONSE",
      toJSON: () => ({}),
    };
    mockedAxios.patch.mockRejectedValueOnce(mockErrorResponse);

    const payload: WorkOrderWebhookPayload = {
      workOrderId: 404,
      orgId: 456,
      occurredAt: new Date().toISOString(),
      newWorkOrder: undefined, // Simulate newWorkOrder missing from webhook
    };

    await processWebhookEvent(payload);

    expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    // Assert `console.error` was called with the correct arguments (string message, and the specific error data).
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to update Work Order 202 in MaintainX:"),
      mockErrorResponse.response.data,
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled(); // Ensure no rate limit warning.
  });

  it("should handle rate limiting (429 error) and log warning", async () => {
    // Create a mock AxiosError object for a 429 rate limit response.
    const mockErrorResponse = {
      response: {
        status: 429,
        data: "Too Many Requests",
        headers: { "x-rate-limit-reset": "60" },
      },
      isAxiosError: true,
      message: "Request failed with status code 429",
      name: "AxiosError",
      config: {} as any,
      code: "ERR_TOO_MANY_REQUESTS",
      toJSON: () => ({}),
    };
    mockedAxios.patch.mockRejectedValueOnce(mockErrorResponse);

    const payload: WorkOrderWebhookPayload = {
      workOrderId: 404,
      orgId: 456,
      occurredAt: new Date().toISOString(),
      newWorkOrder: undefined, // Simulate newWorkOrder missing from webhook
    };

    await processWebhookEvent(payload);

    expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    // Assert `console.warn` was called for rate limiting.
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Rate limited. Retrying after 60 seconds."),
    );
    // This assertion now passes because `axios.isAxiosError` is correctly mocked to true,
    // ensuring the `else` block (which calls console.error) is skipped.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
