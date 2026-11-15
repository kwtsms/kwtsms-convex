/*
FILE:      example/convex/kwtsms.test.ts
CREATED:   2026-11-16 02:05 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      App-level test: the example app installs the component through register() and queues an SMS with a recorded event.
WHY:       Proves the packaged component, its test helper and the client class work from an app, with testMode on by default.
           The send-path tests live in src/component/lib.test.ts.
*/
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { initConvexTest } from "./setup.test";

test("sendSms queues, getStatus reads it, onSmsEvent saw queued", async () => {
  const t = initConvexTest();
  const id = await t.mutation(api.example.sendSms, { to: "96551234567", text: "Hello", idempotencyKey: "a" });
  expect(await t.mutation(api.example.sendSms, { to: "96551234567", text: "Hello", idempotencyKey: "a" })).toBe(id);
  expect(await t.query(api.example.getStatus, { id })).toMatchObject({ status: "queued", testMode: true });
  const events = await t.query(api.example.events, {});
  expect(events.map((e: { event: { status: string } }) => e.event.status)).toEqual(["queued"]);
});

test("a refused number throws", async () => {
  const t = initConvexTest();
  await expect(t.mutation(api.example.sendSms, { to: "+971501234567", text: "Hello" })).rejects.toThrow();
});
