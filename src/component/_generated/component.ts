/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      balance: FunctionReference<
        "action",
        "internal",
        {},
        { available: number; purchased: number },
        Name
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          idempotencyKey?: string;
          options: {
            allowedCountries: Array<string>;
            dailyPointsCap: number;
            globalPerHour: number;
            onSmsEvent?: string;
            perNumberPerHour: number;
            testMode: boolean;
          };
          text: string;
          to: string;
        },
        string,
        Name
      >;
      sendOtp: FunctionReference<
        "mutation",
        "internal",
        {
          appName: string;
          code: string;
          idempotencyKey?: string;
          lang: "en" | "ar";
          options: {
            allowedCountries: Array<string>;
            dailyPointsCap: number;
            globalPerHour: number;
            onSmsEvent?: string;
            perNumberPerHour: number;
            testMode: boolean;
          };
          to: string;
        },
        string,
        Name
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        null | {
          balanceAfter?: number;
          createdAt: number;
          errorCode?: string;
          errorMessage?: string;
          finalizedAt?: number;
          msgId?: string;
          points?: number;
          status: "queued" | "sending" | "sent" | "failed";
          testMode: boolean;
        },
        Name
      >;
    };
  };
