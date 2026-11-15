/*
FILE:      src/component/lib.ts
CREATED:   2026-11-16 01:55 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      The component API: send and sendOtp (validate, cap, insert, enqueue), the delivery worker (POST /API/send/),
           status and balance.
WHY:       Sends go through @convex-dev/workpool with retries OFF at the pool level. The only retry is inside deliver and only
           when the request never left this machine (DNS or connect error): once kwtSMS may have seen the request the
           outcome is final, so there is never a double send or double credit.
           Logging: nothing here writes the full number, the text or the credentials to the console.
*/
import { ConvexError, v } from "convex/values";
import { Workpool } from "@convex-dev/workpool";
import type { FunctionHandle } from "convex/server";
import { components, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  action,
  env,
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import { normalizePhone } from "./phone.js";
import { buildOtpMessage } from "./template.js";
import { cleanMessage } from "./kwtsms_message.js";
import {
  DAY_MS,
  HOUR_MS,
  vOptions,
  vStatus,
  type RefusalCode,
  type RuntimeOptions,
  type SmsEvent,
} from "./shared.js";

const API_BASE = "https://www.kwtsms.com/API";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3; // only used for pre-send network errors
const BACKOFF_MS = [250, 750];
const SCAN_LIMIT = 5000;

// Retries are OFF in the pool: a retried action could send twice.
const smsPool = new Workpool(components.smsWorkpool, { maxParallelism: 3 });

function refuse(code: RefusalCode): never {
  throw new ConvexError({ code });
}

// 2026-11-16 02:08 +03: the app callback runs as a sub-mutation, not through a second pool. If the app's mutation throws,
// only that sub-transaction rolls back; the message state change stays. Why: convex-test cannot run a nested workpool,
// and a direct call keeps the event in the same transaction as the state change. int-convex
async function emit(ctx: MutationCtx, row: Doc<"messages">, event: SmsEvent) {
  if (!row.onSmsEvent) return;
  const handle = row.onSmsEvent as FunctionHandle<
    "mutation",
    { id: Id<"messages">; event: SmsEvent },
    void
  >;
  try {
    await ctx.runMutation(handle, { id: row._id, event });
  } catch {
    // The app's callback failed; never log its arguments (they hold the status of a message to a number).
  }
}

// Counts the caps from the table. Idempotency is checked before this.
async function checkCaps(
  ctx: MutationCtx,
  to: string,
  now: number,
  o: RuntimeOptions,
) {
  const lastHourForNumber = await ctx.db
    .query("messages")
    .withIndex("by_to_createdAt", (q) =>
      q.eq("to", to).gt("createdAt", now - HOUR_MS),
    )
    .take(o.perNumberPerHour);
  if (lastHourForNumber.length >= o.perNumberPerHour) refuse("RATE_LIMIT_NUMBER");

  const lastDay = await ctx.db
    .query("messages")
    .withIndex("by_createdAt", (q) => q.gt("createdAt", now - DAY_MS))
    .take(SCAN_LIMIT);
  const lastHour = lastDay.filter((m) => m.createdAt > now - HOUR_MS).length;
  if (lastHour >= o.globalPerHour) refuse("RATE_LIMIT_GLOBAL");
  // A queued or sending row has no points yet: count it as 1.
  const points = lastDay.reduce(
    (sum, m) => sum + (m.status === "failed" ? 0 : (m.points ?? 1)),
    0,
  );
  if (points >= o.dailyPointsCap) refuse("DAILY_CAP");
}

async function enqueue(
  ctx: MutationCtx,
  a: {
    to: string;
    kind: "sms" | "otp";
    text: string; // real text
    idempotencyKey?: string;
    options: RuntimeOptions;
  },
): Promise<Id<"messages">> {
  if (a.idempotencyKey !== undefined) {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", a.idempotencyKey),
      )
      .first();
    if (existing) return existing._id;
  }
  const phone = normalizePhone(a.to, a.options.allowedCountries);
  if (!phone.ok) refuse(phone.reason);
  const text = a.kind === "sms" ? cleanMessage(a.text) : a.text;
  if (text.trim() === "") refuse("EMPTY_MESSAGE");
  const now = Date.now();
  await checkCaps(ctx, phone.digits, now, a.options);

  const id = await ctx.db.insert("messages", {
    to: phone.digits,
    kind: a.kind,
    text: a.kind === "otp" ? "[otp]" : text,
    textLength: text.length,
    pendingText: a.kind === "otp" ? text : undefined,
    status: "queued",
    testMode: a.options.testMode,
    idempotencyKey: a.idempotencyKey,
    onSmsEvent: a.options.onSmsEvent,
    createdAt: now,
  });
  const row = (await ctx.db.get("messages", id))!;
  await smsPool.enqueueAction(
    ctx,
    internal.lib.deliver,
    { messageId: id },
    {
      onComplete: internal.lib.onDeliverComplete,
      context: { messageId: id },
    },
  );
  await emit(ctx, row, { status: "queued", testMode: row.testMode });
  return id;
}

export const send = mutation({
  args: {
    to: v.string(),
    text: v.string(),
    idempotencyKey: v.optional(v.string()),
    options: vOptions,
  },
  returns: v.id("messages"),
  handler: async (ctx, args) =>
    enqueue(ctx, { ...args, kind: "sms" }),
});

export const sendOtp = mutation({
  args: {
    to: v.string(),
    code: v.string(),
    lang: v.union(v.literal("en"), v.literal("ar")),
    appName: v.string(),
    idempotencyKey: v.optional(v.string()),
    options: vOptions,
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    if (!/^\d{4,8}$/.test(args.code)) refuse("INVALID_CODE");
    return enqueue(ctx, {
      to: args.to,
      kind: "otp",
      text: buildOtpMessage(args.lang, args.appName, args.code),
      idempotencyKey: args.idempotencyKey,
      options: args.options,
    });
  },
});

export const status = query({
  args: { id: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({
      status: vStatus,
      testMode: v.boolean(),
      msgId: v.optional(v.string()),
      points: v.optional(v.number()),
      balanceAfter: v.optional(v.number()),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      createdAt: v.number(),
      finalizedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const m = await ctx.db.get("messages", args.id);
    if (!m) return null;
    return {
      status: m.status,
      testMode: m.testMode,
      msgId: m.msgId,
      points: m.points,
      balanceAfter: m.balanceAfter,
      errorCode: m.errorCode,
      errorMessage: m.errorMessage,
      createdAt: m.createdAt,
      finalizedAt: m.finalizedAt,
    };
  },
});

// queued -> sending. Returns the text once and clears the OTP copy before any network call.
export const claim = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({ to: v.string(), text: v.string(), testMode: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const m = await ctx.db.get("messages", args.messageId);
    if (!m || m.status !== "queued") return null;
    const text = m.pendingText ?? m.text;
    await ctx.db.patch("messages", m._id, {
      status: "sending",
      pendingText: undefined,
    });
    await emit(ctx, { ...m, status: "sending" }, {
      status: "sending",
      testMode: m.testMode,
    });
    return { to: m.to, text, testMode: m.testMode };
  },
});

export const finish = internalMutation({
  args: {
    messageId: v.id("messages"),
    outcome: v.union(
      v.object({
        ok: v.literal(true),
        msgId: v.optional(v.string()),
        points: v.optional(v.number()),
        balanceAfter: v.optional(v.number()),
      }),
      v.object({
        ok: v.literal(false),
        errorCode: v.string(),
        errorMessage: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const m = await ctx.db.get("messages", args.messageId);
    if (!m || (m.status !== "sending" && m.status !== "queued")) return null;
    const o = args.outcome;
    const patch = o.ok
      ? {
          status: "sent" as const,
          msgId: o.msgId,
          points: o.points,
          balanceAfter: o.balanceAfter,
        }
      : {
          status: "failed" as const,
          errorCode: o.errorCode,
          errorMessage: o.errorMessage,
        };
    await ctx.db.patch("messages", m._id, {
      ...patch,
      pendingText: undefined,
      finalizedAt: Date.now(),
    });
    await emit(ctx, m, {
      status: patch.status,
      testMode: m.testMode,
      ...(o.ok
        ? { msgId: o.msgId, points: o.points }
        : { errorCode: o.errorCode, errorMessage: o.errorMessage }),
    });
    return null;
  },
});

export const onDeliverComplete = smsPool.defineOnComplete({
  context: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args) => {
    if (args.result.kind === "success") return;
    // The worker died or was cancelled: the outcome is unknown, never retry.
    await ctx.runMutation(internal.lib.finish, {
      messageId: args.context.messageId,
      outcome: {
        ok: false,
        errorCode: "WORKER_FAILED",
        errorMessage: "Delivery worker stopped; outcome unknown, not retried.",
      },
    });
  },
});

// Only these mean the request never reached the network.
const PRE_SEND_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

export function isPreSendError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const x = e as { name?: string; code?: string; cause?: { code?: string } };
  if (x.name === "AbortError") return false;
  const code = x.cause?.code ?? x.code;
  return code !== undefined && PRE_SEND_CODES.has(code);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson(path: string, body: Record<string, string>) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${path}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    // Errors come with HTTP 4XX and a JSON body: always read the body.
    const raw = await res.text();
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { result: "ERROR", code: "BAD_RESPONSE", description: `HTTP ${res.status}, body not JSON` };
    }
  } finally {
    clearTimeout(timer);
  }
}

export const deliver = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.lib.claim, {
      messageId: args.messageId,
    });
    if (!claimed) return null;
    const body = {
      username: env.KWTSMS_USERNAME,
      password: env.KWTSMS_PASSWORD,
      sender: env.KWTSMS_SENDER_ID,
      mobile: claimed.to,
      message: claimed.text,
      test: claimed.testMode ? "1" : "0",
    };
    let data: Record<string, unknown> | null = null;
    let fail: { errorCode: string; errorMessage: string } | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        data = await postJson("send", body);
        break;
      } catch (e) {
        if (isPreSendError(e) && attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS[attempt - 1] ?? 750);
          continue;
        }
        fail = isPreSendError(e)
          ? { errorCode: "NETWORK_ERROR", errorMessage: "Could not reach kwtSMS; nothing was sent." }
          : {
              errorCode: "UNKNOWN_OUTCOME",
              errorMessage: "No answer from kwtSMS after the request was sent; outcome unknown, not retried.",
            };
        break;
      }
    }
    if (data && data.result === "OK") {
      await ctx.runMutation(internal.lib.finish, {
        messageId: args.messageId,
        outcome: {
          ok: true,
          msgId: typeof data["msg-id"] === "string" ? data["msg-id"] : undefined,
          points: typeof data["points-charged"] === "number" ? data["points-charged"] : undefined,
          balanceAfter: typeof data["balance-after"] === "number" ? data["balance-after"] : undefined,
        },
      });
      return null;
    }
    if (data) {
      fail = {
        errorCode: String(data.code ?? "ERROR"),
        errorMessage: String(data.description ?? "kwtSMS returned an error"),
      };
    }
    await ctx.runMutation(internal.lib.finish, {
      messageId: args.messageId,
      outcome: { ok: false, ...fail! },
    });
    return null;
  },
});

// Server-side only: expose it behind your own auth, never to the browser.
export const balance = action({
  args: {},
  returns: v.object({ available: v.number(), purchased: v.number() }),
  handler: async () => {
    const data = await postJson("balance", {
      username: env.KWTSMS_USERNAME,
      password: env.KWTSMS_PASSWORD,
    });
    if (data.result !== "OK") {
      throw new ConvexError({ code: String(data.code ?? "ERROR") });
    }
    return {
      available: Number(data.available ?? 0),
      purchased: Number(data.purchased ?? 0),
    };
  },
});
