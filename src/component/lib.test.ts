/*
FILE:      src/component/lib.test.ts
CREATED:   2026-11-16 02:08 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Send-path tests with the component as the convex-test root and a stubbed global fetch (no network, fake credentials):
           refusals, caps, idempotency, request shape, test mode, ERR codes, retry rules, onSmsEvent, OTP storage, log hygiene.
WHY:       convex-test cannot run a nested workpool, so the pool only enqueues here and each test runs the delivery worker
           (internal.lib.deliver) itself. That is the exact code the pool calls, with retries off.
*/
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { internalMutationGeneric } from "convex/server";
import workpool from "@convex-dev/workpool/test";
import schema from "./schema.js";
import { api, internal } from "./_generated/api.js";

const baseModules = import.meta.glob("./**/*.*s");
const NUM = "96551234567";
const OPTS = {
  testMode: true,
  allowedCountries: ["965"],
  perNumberPerHour: 5,
  globalPerHour: 100,
  dailyPointsCap: 500,
};

type Call = { url: string; body: Record<string, string> };
let calls: Call[];
const okResponse = () =>
  new Response(JSON.stringify({ result: "OK", "msg-id": "mid1", numbers: 1, "points-charged": 1, "balance-after": 99 }));

function stubFetch(handler: (n: number) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return handler(calls.length);
    }),
  );
}

beforeEach(() => {
  calls = [];
  process.env.KWTSMS_USERNAME = "test_user";
  process.env.KWTSMS_PASSWORD = "pw-xx";
  process.env.KWTSMS_SENDER_ID = "TESTSENDER";
  vi.useFakeTimers();
  stubFetch(okResponse);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(extra: Record<string, () => Promise<unknown>> = {}) {
  const t = convexTest(schema, { ...baseModules, ...extra });
  workpool.register(t, "smsWorkpool");
  const send = (args: Record<string, unknown> = {}, options = OPTS) =>
    t.mutation(api.lib.send, { to: NUM, text: "Hello", options, ...args });
  const deliver = (messageId: never) => t.action(internal.lib.deliver, { messageId });
  const status = (id: never) => t.query(api.lib.status, { id });
  return { t, send, deliver, status };
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ConvexError);
    return (e as ConvexError<{ code: string }>).data.code;
  }
  throw new Error("expected a refusal");
};

describe("refusals", () => {
  test("allowlist refuses other countries and garbage; no gateway call", async () => {
    const { send } = setup();
    expect(await refusal(send({ to: "+971501234567" }))).toBe("COUNTRY_NOT_ALLOWED");
    expect(await refusal(send({ to: "abc" }))).toBe("INVALID_PHONE");
    expect(calls).toHaveLength(0);
  });

  test("a wider allowlist accepts 971", async () => {
    const { send } = setup();
    await send({ to: "+971501234567" }, { ...OPTS, allowedCountries: ["965", "971"] });
  });

  test("per-number cap: 5 per hour, the 6th is refused, another number passes", async () => {
    const { send } = setup();
    for (let i = 0; i < 5; i++) await send();
    expect(await refusal(send())).toBe("RATE_LIMIT_NUMBER");
    await send({ to: "96561234567" });
  });

  test("global cap per hour", async () => {
    const { send } = setup();
    const o = { ...OPTS, globalPerHour: 3 };
    for (const n of ["96551234501", "96551234502", "96551234503"]) await send({ to: n }, o);
    expect(await refusal(send({ to: "96551234504" }, o))).toBe("RATE_LIMIT_GLOBAL");
  });

  test("daily points cap counts real points once known", async () => {
    const { send, deliver } = setup();
    const o = { ...OPTS, dailyPointsCap: 2 };
    const a = await send({ to: "96551234501" }, o);
    await send({ to: "96551234502" }, o);
    expect(await refusal(send({ to: "96551234503" }, o))).toBe("DAILY_CAP");
    await deliver(a as never); // 1 point charged
    expect(await refusal(send({ to: "96551234503" }, o))).toBe("DAILY_CAP");
  });

  test("the window moves: after an hour the per-number cap clears", async () => {
    const { send } = setup();
    for (let i = 0; i < 5; i++) await send();
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    await send();
  });

  test("empty text and a bad OTP code are refused", async () => {
    const { t, send } = setup();
    expect(await refusal(send({ text: "   " }))).toBe("EMPTY_MESSAGE");
    const bad = t.mutation(api.lib.sendOtp, { to: NUM, code: "12ab", lang: "en", appName: "App", options: OPTS });
    expect(await refusal(bad)).toBe("INVALID_CODE");
  });
});

describe("idempotency", () => {
  test("the same key returns the same id and one row", async () => {
    const { t, send, deliver } = setup();
    const a = await send({ idempotencyKey: "k1" });
    const b = await send({ idempotencyKey: "k1" });
    expect(b).toBe(a);
    await deliver(a as never);
    await deliver(b as never); // already claimed: no second send
    expect(calls).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toHaveLength(1);
  });
});

describe("gateway request", () => {
  test("testMode true sends test 1 to /API/send/ with normalized digits", async () => {
    const { send, deliver, status } = setup();
    const id = await send({ to: "+٩٦٥ ٥١٢٣ ٤٥٦٧" });
    await deliver(id as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://www.kwtsms.com/API/send/");
    expect(calls[0].body).toEqual({
      username: "test_user",
      password: "pw-xx",
      sender: "TESTSENDER",
      mobile: NUM,
      message: "Hello",
      test: "1",
    });
    expect(await status(id as never)).toMatchObject({
      status: "sent", testMode: true, msgId: "mid1", points: 1, balanceAfter: 99,
    });
  });

  test("testMode false sends test 0", async () => {
    const { send, deliver } = setup();
    const id = await send({}, { ...OPTS, testMode: false });
    await deliver(id as never);
    expect(calls[0].body.test).toBe("0");
  });

  test("an ERR code on HTTP 403 is read from the body and stored as failed", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ result: "ERROR", code: "ERR003", description: "Authentication error" }), { status: 403 }),
    );
    const { send, deliver, status } = setup();
    const id = await send();
    await deliver(id as never);
    expect(calls).toHaveLength(1);
    expect(await status(id as never)).toMatchObject({
      status: "failed", errorCode: "ERR003", errorMessage: "Authentication error",
    });
  });

  test("a non-JSON answer is stored as failed BAD_RESPONSE and not retried", async () => {
    stubFetch(() => new Response("<html>oops</html>", { status: 502 }));
    const { send, deliver, status } = setup();
    const id = await send();
    await deliver(id as never);
    expect(calls).toHaveLength(1);
    expect(await status(id as never)).toMatchObject({ status: "failed", errorCode: "BAD_RESPONSE" });
  });
});

describe("retry rules", () => {
  test("a pre-send network error (DNS) is retried, then succeeds", async () => {
    stubFetch((n) => {
      if (n === 1) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
      return okResponse();
    });
    const { send, deliver, status } = setup();
    const id = await send();
    const p = deliver(id as never);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(calls).toHaveLength(2);
    expect((await status(id as never))?.status).toBe("sent");
  });

  test("pre-send errors on every attempt: 3 calls, failed NETWORK_ERROR", async () => {
    stubFetch(() => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    });
    const { send, deliver, status } = setup();
    const id = await send();
    const p = deliver(id as never);
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    expect(calls).toHaveLength(3);
    expect(await status(id as never)).toMatchObject({ status: "failed", errorCode: "NETWORK_ERROR" });
  });

  test("a timeout after the request was sent is final: one call, UNKNOWN_OUTCOME", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const { send, deliver, status } = setup();
    const id = await send();
    await deliver(id as never);
    expect(calls).toHaveLength(1);
    expect(await status(id as never)).toMatchObject({ status: "failed", errorCode: "UNKNOWN_OUTCOME" });
  });

  test("an unknown thrown error is never retried", async () => {
    stubFetch(() => {
      throw new Error("socket hang up");
    });
    const { send, deliver } = setup();
    await deliver((await send()) as never);
    expect(calls).toHaveLength(1);
  });

  test("an ERR answer (200 or 4XX) is never retried", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ result: "ERROR", code: "ERR013", description: "queue full" }), { status: 200 }),
    );
    const { send, deliver, status } = setup();
    const id = await send();
    await deliver(id as never);
    expect(calls).toHaveLength(1);
    expect((await status(id as never))?.errorCode).toBe("ERR013");
  });

  test("a worker that dies after claim is marked failed by onComplete and never re-sent", async () => {
    const { t, send, deliver, status } = setup();
    const id = await send();
    await t.mutation(internal.lib.claim, { messageId: id });
    await t.mutation(internal.lib.finish, {
      messageId: id,
      outcome: { ok: false, errorCode: "WORKER_FAILED", errorMessage: "x" },
    });
    await deliver(id as never); // status is failed, claim returns null
    expect(calls).toHaveLength(0);
    expect((await status(id as never))?.status).toBe("failed");
  });
});

describe("events", () => {
  test("onSmsEvent is called on every state change with no number or text", async () => {
    const received: Array<{ id: string; event: Record<string, unknown> }> = [];
    const hook = async () => ({
      record: internalMutationGeneric({
        handler: async (_ctx: unknown, args: { id: string; event: Record<string, unknown> }) => {
          received.push(args);
        },
      }),
    });
    const { send, deliver } = setup({ "./hook.ts": hook });
    const id = await send({}, { ...OPTS, onSmsEvent: "function://;hook:record" } as never);
    await deliver(id as never);
    expect(received.map((r) => r.event.status)).toEqual(["queued", "sending", "sent"]);
    expect(received[2].event).toMatchObject({ msgId: "mid1", points: 1, testMode: true });
    expect(JSON.stringify(received)).not.toContain(NUM);
  });

  test("a failing app callback does not break the send", async () => {
    const hook = async () => ({
      record: internalMutationGeneric({
        handler: async () => {
          throw new Error("app bug");
        },
      }),
    });
    const { send, deliver, status } = setup({ "./hook.ts": hook });
    const id = await send({}, { ...OPTS, onSmsEvent: "function://;hook:record" } as never);
    await deliver(id as never);
    expect((await status(id as never))?.status).toBe("sent");
  });
});

describe("OTP and logs", () => {
  test("OTP text and code are never stored; credentials are not persisted", async () => {
    const { t, deliver, status } = setup();
    const id = await t.mutation(api.lib.sendOtp, {
      to: NUM, code: "482913", lang: "en", appName: "App", options: OPTS,
    });
    expect((await t.run((ctx) => ctx.db.get("messages", id)))?.text).toBe("[otp]");
    await deliver(id as never);
    expect(calls[0].body.message).toContain("482913"); // it was sent
    expect(calls[0].body.message).toContain("App:");
    const row = await t.run((ctx) => ctx.db.get("messages", id));
    expect(row?.pendingText).toBeUndefined();
    const dump = JSON.stringify(await t.run((ctx) => ctx.db.query("messages").collect()));
    for (const s of ["482913", "pw-xx", "test_user", "TESTSENDER"]) expect(dump).not.toContain(s);
    expect(row?.text).toBe("[otp]");
    expect(row?.textLength).toBeGreaterThan(10);
    expect(JSON.stringify(await status(id as never))).not.toContain("482913");
  });

  test("Arabic OTP text is sent as Arabic", async () => {
    const { t, deliver } = setup();
    const id = await t.mutation(api.lib.sendOtp, { to: NUM, code: "482913", lang: "ar", appName: "App", options: OPTS });
    await deliver(id as never);
    expect(calls[0].body.message).toContain("رمز التحقق");
  });

  test("no full number, text, code or credential reaches the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { t, send, deliver } = setup();
    const o = await t.mutation(api.lib.sendOtp, { to: NUM, code: "482913", lang: "en", appName: "App", options: OPTS });
    await deliver(o as never);
    const s = await send({ to: "96561234567", text: "Secret body text" });
    await deliver(s as never);
    stubFetch(() => new Response(JSON.stringify({ result: "ERROR", code: "ERR003", description: "bad" }), { status: 403 }));
    const f = await send({ to: "96561234568", text: "Secret body text" });
    await deliver(f as never);
    const out = JSON.stringify(spies.flatMap((x) => x.mock.calls));
    for (const secret of [NUM, "96561234567", "96561234568", "482913", "Secret body text", "pw-xx", "test_user"]) {
      expect(out).not.toContain(secret);
    }
  });
});

describe("balance", () => {
  test("returns available and purchased from /API/balance/", async () => {
    stubFetch(() => new Response(JSON.stringify({ result: "OK", available: 150, purchased: 500 })));
    const { t } = setup();
    expect(await t.action(api.lib.balance, {})).toEqual({ available: 150, purchased: 500 });
    expect(calls[0].url).toBe("https://www.kwtsms.com/API/balance/");
    expect(calls[0].body).toEqual({ username: "test_user", password: "pw-xx" });
  });

  test("an ERR answer throws a ConvexError with the code", async () => {
    stubFetch(() => new Response(JSON.stringify({ result: "ERROR", code: "ERR003", description: "bad" }), { status: 403 }));
    const { t } = setup();
    expect(await refusal(t.action(api.lib.balance, {}))).toBe("ERR003");
  });
});
