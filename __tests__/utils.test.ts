import * as crypto from "crypto";
import { calculateDueDate, verifyWebhookSignature } from "../src/utils";

// Mock Date to control 'today' for consistent testing of calculateDueDate
const MOCK_DATE = new Date("2024-06-15T12:00:00.000Z"); // A Saturday
const REAL_DATE = Date; // Store original Date to restore later

beforeAll(() => {
  global.Date = class extends REAL_DATE {
    constructor(dateString?: string | number | Date) {
      // If 'dateString' was explicitly provided (i.e., new Date(someArg) was called),
      // then call super with that argument.
      if (dateString !== undefined) {
        super(dateString);
      } else {
        // If 'dateString' is undefined (i.e., new Date() was called with no arguments),
        // then call super with no arguments.
        super();
      }
      if (dateString) {
        return new REAL_DATE(dateString);
      }
      return MOCK_DATE;
    }
    static now() {
      return MOCK_DATE.getTime();
    }
  } as any;
});

afterAll(() => {
  global.Date = REAL_DATE; // Restore original Date object
});

describe("calculateDueDate", () => {
  it("should calculate due date correctly for HIGH priority (1 day)", () => {
    const dueDate = calculateDueDate("HIGH");
    expect(dueDate).toMatch(/^2024-06-16T.*Z$/);
  });
  it("should calculate due date correctly for MEDIUM priority (3 days)", () => {
    const dueDate = calculateDueDate("MEDIUM");
    expect(dueDate).toMatch(/^2024-06-18T.*Z$/);
  });
  it("should calculate due date correctly for LOW priority (7 days)", () => {
    const dueDate = calculateDueDate("LOW");
    expect(dueDate).toMatch(/^2024-06-22T.*Z$/);
  });
  it("should calculate due date correctly for NONE priority (14 days)", () => {
    const dueDate = calculateDueDate("NONE");
    expect(dueDate).toMatch(/^2024-06-29T.*Z$/);
  });
  it("should default to 7 days for unknown priority and log a warning", () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const dueDate = calculateDueDate("UNKNOWN" as any);
    expect(dueDate).toMatch(/^2024-06-22T.*Z$/);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown or undefined priority"),
    );
    consoleWarnSpy.mockRestore();
  });
  it("should return a valid ISO string", () => {
    const dueDate = calculateDueDate("HIGH");
    expect(typeof dueDate).toBe("string");
    expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("verifyWebhookSignature", () => {
  const WEBHOOK_SECRET = "test_secret_123";
  const TEST_PAYLOAD = JSON.stringify({ key: "value", data: 123 });
  const RAW_BODY_BUFFER = Buffer.from(TEST_PAYLOAD, "utf8");

  it("should return true for a valid signature and fresh timestamp", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${TEST_PAYLOAD}`;
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature(
      signatureHeader,
      RAW_BODY_BUFFER,
      WEBHOOK_SECRET,
    );
    expect(isValid).toBe(true);
  });

  it("should return false if signature header is missing", () => {
    const isValid = verifyWebhookSignature(
      undefined,
      RAW_BODY_BUFFER,
      WEBHOOK_SECRET,
    );
    expect(isValid).toBe(false);
  });

  it("should return false if raw body is missing", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${TEST_PAYLOAD}`;
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature(
      signatureHeader,
      undefined,
      WEBHOOK_SECRET,
    );
    expect(isValid).toBe(false);
  });

  it("should return false for an invalid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${TEST_PAYLOAD}`;
    const correctSignature = crypto // Calculate a real signature first
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");

    // Create an invalid signature that is guaranteed to have the correct length
    // by altering one character of the correct signature.
    const invalidSignature =
      (correctSignature[0] === "a" ? "b" : "a") + correctSignature.substring(1);

    const signatureHeader = `t=${timestamp},v1=${invalidSignature}`;
    const isValid = verifyWebhookSignature(
      signatureHeader,
      RAW_BODY_BUFFER,
      WEBHOOK_SECRET,
    );
    expect(isValid).toBe(false);
  });

  it("should return false for an old timestamp (replay attack)", () => {
    const oldTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000); // 10 minutes ago
    const signedPayload = `${oldTimestamp}.${TEST_PAYLOAD}`;
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");
    const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature(
      signatureHeader,
      RAW_BODY_BUFFER,
      WEBHOOK_SECRET,
      5,
    ); // 5 minutes tolerance
    expect(isValid).toBe(false);
  });

  it("should return true for a timestamp within tolerance", () => {
    const timestamp = Math.floor((Date.now() - 2 * 60 * 1000) / 1000); // 2 minutes ago
    const signedPayload = `${timestamp}.${TEST_PAYLOAD}`;
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature(
      signatureHeader,
      RAW_BODY_BUFFER,
      WEBHOOK_SECRET,
      5,
    ); // 5 minutes tolerance
    expect(isValid).toBe(true);
  });
});
