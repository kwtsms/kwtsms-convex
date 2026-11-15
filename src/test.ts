/*
FILE:      src/test.ts
CREATED:   2026-11-16 01:58 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      register(t) for apps testing with convex-test: registers the component and its workpool.
WHY:       Same helper shape as the official template and @convex-dev/resend.
*/
/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import workpool from "@convex-dev/workpool/test";
import schema from "./component/schema.js";
import type { ComponentApi } from "./component/_generated/component.js";
const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register the component and its children.
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 */
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "kwtsms",
) {
  workpool.register(t, `${name}/smsWorkpool`);
  return t.registerComponent(name, schema, modules) as unknown as ComponentApi;
}
export default { register, schema, modules };
