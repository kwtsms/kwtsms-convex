/*
FILE:      example/convex/example.ts
CREATED:   2026-11-16 02:00 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Example app functions: send an SMS and an OTP, read status, receive events.
WHY:       Shows the whole client surface. Real apps must put sendOtp behind their own auth.
*/
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { Kwtsms, vSmsEvent, type SmsId } from "kwtsms-convex";

// testMode defaults to true: nothing reaches a handset until you pass testMode: false.
const kwtsms: Kwtsms = new Kwtsms(components.kwtsms, {
  onSmsEvent: internal.example.onSmsEvent,
});

export const sendSms = mutation({
  args: { to: v.string(), text: v.string(), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, args) => kwtsms.sendSms(ctx, args),
});

export const sendOtp = mutation({
  args: { to: v.string(), code: v.string(), lang: v.optional(v.union(v.literal("en"), v.literal("ar"))) },
  handler: async (ctx, args) => kwtsms.sendOtp(ctx, { ...args, appName: "Example" }),
});

export const getStatus = query({
  args: { id: v.string() },
  handler: async (ctx, args) => kwtsms.getStatus(ctx, args.id as SmsId),
});

export const balance = action({
  args: {},
  handler: async (ctx) => kwtsms.balance(ctx),
});

export const onSmsEvent = internalMutation({
  args: { id: v.string(), event: vSmsEvent },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsEvents", { smsId: args.id, event: args.event });
  },
});

export const events = query({
  args: {},
  handler: async (ctx) => ctx.db.query("smsEvents").collect(),
});
