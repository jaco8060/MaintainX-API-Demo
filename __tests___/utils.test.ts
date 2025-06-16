import { calculateDueDate, verifyWebhookSignature } from "../src/utils"; // Corrected import path
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

// Placeholder for verifyWebhookSignature tests, will be added in a later commit
describe("verifyWebhookSignature", () => {
  it("should be a placeholder for now", () => {
    expect(true).toBe(true);
  });
});
