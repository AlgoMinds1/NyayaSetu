import { describe, expect, it } from "vitest";
import { bandFor, parseScan, redactAadhaar } from "@/lib/ocr/extract";

describe("OCR confidence bands", () => {
  it("uses 80 and 50 as the cut-offs", () => {
    expect(bandFor(80)).toBe("high");
    expect(bandFor(79)).toBe("medium");
    expect(bandFor(50)).toBe("medium");
    expect(bandFor(49)).toBe("low");
  });
});

describe("Aadhaar masking", () => {
  it("masks 12-digit numbers with or without spaces", () => {
    expect(redactAadhaar("Aadhaar 1234 5678 9012 on card")).toBe("Aadhaar XXXX XXXX XXXX on card");
    expect(redactAadhaar("123456789012")).toBe("XXXX XXXX XXXX");
  });

  it("never leaves an Aadhaar number in the parsed output and flags it", () => {
    const raw = "Name: Asha Verma\nAadhaar 2345 6789 0123";
    const result = parseScan(raw, 85, []);
    expect(result.aadhaarFound).toBe(true);
    expect(result.raw).not.toContain("2345 6789 0123");
    expect(result.raw).toContain("XXXX XXXX XXXX");
  });
});

describe("parseScan", () => {
  it("extracts a field with its band from line-level confidence", () => {
    const lines = [{ text: "Name: Asha Verma", confidence: 85 }, { text: "Enrollment No: EN2026-114", confidence: 62 }];
    const result = parseScan(lines.map((l) => l.text).join("\n"), 73, lines);
    expect(result.fields.name).toEqual({ value: "Asha Verma", confidence: 85, band: "high" });
    expect(result.fields.enrollment_no?.band).toBe("medium");
  });

  it("falls back to manual entry when average confidence is below 40", () => {
    expect(parseScan("blurry", 25, []).fallback).toBe(true);
    expect(parseScan("clear", 90, []).fallback).toBe(false);
  });
});
