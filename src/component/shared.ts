/*
FILE:      src/component/shared.ts
CREATED:   2026-11-16 01:52 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Validators and types shared by the component and the client class.
WHY:       One definition of the options, the status values and the event passed to onSmsEvent.
*/
import { v, type Infer } from "convex/values";

export const vStatus = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
);
export type SmsStatus = Infer<typeof vStatus>;

/** Passed to the app's onSmsEvent mutation on every state change. */
export const vSmsEvent = v.object({
  status: vStatus,
  testMode: v.boolean(),
  msgId: v.optional(v.string()),
  points: v.optional(v.number()),
  errorCode: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
});
export type SmsEvent = Infer<typeof vSmsEvent>;

export const vOptions = v.object({
  testMode: v.boolean(),
  allowedCountries: v.array(v.string()),
  perNumberPerHour: v.number(),
  globalPerHour: v.number(),
  dailyPointsCap: v.number(),
  onSmsEvent: v.optional(v.string()),
});
export type RuntimeOptions = Infer<typeof vOptions>;

/** Refusal codes thrown as ConvexError({ code }) by send and sendOtp. */
export type RefusalCode =
  | "INVALID_PHONE"
  | "COUNTRY_NOT_ALLOWED"
  | "EMPTY_MESSAGE"
  | "INVALID_CODE"
  | "RATE_LIMIT_NUMBER"
  | "RATE_LIMIT_GLOBAL"
  | "DAILY_CAP";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
