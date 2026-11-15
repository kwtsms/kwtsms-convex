/*
FILE:      src/component/phone.test.ts
CREATED:   2026-11-16 02:05 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Unit tests for normalizePhone: the normalization table reused from kwtsms-better-auth, plus refusals.
WHY:       Every kwtSMS integration must normalize the same input to the same digits.
*/
import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone.js";

describe("normalization", () => {
  it.each([
    ["96551234567", "96551234567"],
    ["+965 5123 4567", "96551234567"],
    ["0096551234567", "96551234567"],
    ["51234567", "96551234567"],
    ["٥١٢٣٤٥٦٧", "96551234567"],
    ["۵۱۲۳۴۵۶۷", "96551234567"],
    ["+٩٦٥٥١٢٣٤٥٦٧", "96551234567"],
  ])("%s -> %s", (input, digits) => {
    expect(normalizePhone(input, ["965"])).toMatchObject({ ok: true, digits });
  });

  it("refuses other countries and garbage", () => {
    expect(normalizePhone("+971501234567", ["965"])).toEqual({
      ok: false,
      reason: "COUNTRY_NOT_ALLOWED",
    });
    expect(normalizePhone("abc", ["965"])).toEqual({ ok: false, reason: "INVALID_PHONE" });
    expect(normalizePhone("123", ["965"])).toEqual({ ok: false, reason: "INVALID_PHONE" });
    expect(normalizePhone("+971501234567", ["965", "971"])).toMatchObject({ ok: true });
  });
});
