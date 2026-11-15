/*
FILE:      example/convex/schema.ts
CREATED:   2026-11-16 02:00 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Example app table: events received from onSmsEvent.
WHY:       Shows how an app records state changes of a message.
*/
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vSmsEvent } from "kwtsms-convex";

export default defineSchema({
  smsEvents: defineTable({
    smsId: v.string(),
    event: vSmsEvent,
  }),
});
