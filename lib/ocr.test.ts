import { describe, it, expect } from "vitest";
import { isMatchType, diffParsedCorrected } from "./ocr";

describe("isMatchType", () => {
  it("accepts exact/substring, rejects others", () => {
    expect(isMatchType("exact")).toBe(true);
    expect(isMatchType("substring")).toBe(true);
    expect(isMatchType("")).toBe(false);
    expect(isMatchType("fuzzy")).toBe(false);
  });
});

describe("diffParsedCorrected", () => {
  it("returns null when corrected is empty/absent", () => {
    expect(diffParsedCorrected({ merchant: "A" }, null)).toBeNull();
    expect(diffParsedCorrected({ merchant: "A" }, {})).toBeNull();
    expect(diffParsedCorrected({ merchant: "A" }, undefined)).toBeNull();
  });

  it("flags changed fields and formats amount as KRW", () => {
    const parsed = {
      merchant: "다이님원세이브존부천점",
      amount: 45000,
      date: "2026.07.19",
      itemName: "잡음",
    };
    const corrected = {
      merchant: "다이닝원세이브존부천점",
      amount: 45000,
      date: "2026.07.19",
      itemName: "주말/공휴일 디너",
    };
    const diff = diffParsedCorrected(parsed, corrected);
    expect(diff).not.toBeNull();
    const byKey = Object.fromEntries((diff ?? []).map((d) => [d.key, d]));

    expect(byKey.merchant.changed).toBe(true);
    expect(byKey.merchant.before).toBe("다이님원세이브존부천점");
    expect(byKey.merchant.after).toBe("다이닝원세이브존부천점");

    expect(byKey.amount.changed).toBe(false);
    expect(byKey.amount.after).toBe("₩45,000");

    expect(byKey.date.changed).toBe(false);
    expect(byKey.itemName.changed).toBe(true);
    expect(byKey.itemName.after).toBe("주말/공휴일 디너");
  });

  it("treats missing parsed field as '-' and marks it changed", () => {
    const diff = diffParsedCorrected({}, { merchant: "스타벅스" });
    const merchant = (diff ?? []).find((d) => d.key === "merchant");
    expect(merchant?.before).toBe("-");
    expect(merchant?.after).toBe("스타벅스");
    expect(merchant?.changed).toBe(true);
  });
});
