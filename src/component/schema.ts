/*
FILE:      src/component/schema.ts
CREATED:   2026-11-16 01:52 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      The messages table: one row per SMS or OTP, with status, gateway msg-id and points.
WHY:       Caps (per number, global, daily points) and idempotency are counted from this table, so they survive restarts.
           OTP rows keep text "[otp]" and the length only; pendingText holds the OTP text until the worker claims it.
*/
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vStatus } from "./shared.js";

export default defineSchema({
  messages: defineTable({
    to: v.string(),
    kind: v.union(v.literal("sms"), v.literal("otp")),
    text: v.string(),
    textLength: v.number(),
    // Present only between enqueue and claim for OTP rows; cleared before the gateway call.
    pendingText: v.optional(v.string()),
    status: vStatus,
    testMode: v.boolean(),
    idempotencyKey: v.optional(v.string()),
    onSmsEvent: v.optional(v.string()),
    msgId: v.optional(v.string()),
    points: v.optional(v.number()),
    balanceAfter: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    finalizedAt: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_to_createdAt", ["to", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
});
