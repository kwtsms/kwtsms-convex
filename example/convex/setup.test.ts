/*
FILE:      example/convex/setup.test.ts
CREATED:   2026-11-16 02:00 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Test helper: convex-test instance with the kwtsms component registered, credentials fake.
WHY:       Tests run with a stubbed global fetch; no network, no real credentials.
*/
/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import component from "kwtsms-convex/test";

export const modules = import.meta.glob("./**/*.*s");

export function initConvexTest() {
  // Fake credentials: the component reads them from env.
  process.env.KWTSMS_USERNAME = "test_user";
  process.env.KWTSMS_PASSWORD = "pw-xx";
  process.env.KWTSMS_SENDER_ID = "TESTSENDER";
  const t = convexTest(schema, modules);
  component.register(t);
  return t;
}

test("setup", () => {});
