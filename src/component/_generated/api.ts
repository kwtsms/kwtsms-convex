/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as digits from "../digits.js";
import type * as kwtsms_message from "../kwtsms_message.js";
import type * as kwtsms_phone from "../kwtsms_phone.js";
import type * as lib from "../lib.js";
import type * as phone from "../phone.js";
import type * as shared from "../shared.js";
import type * as template from "../template.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  digits: typeof digits;
  kwtsms_message: typeof kwtsms_message;
  kwtsms_phone: typeof kwtsms_phone;
  lib: typeof lib;
  phone: typeof phone;
  shared: typeof shared;
  template: typeof template;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {
  smsWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"smsWorkpool">;
};
