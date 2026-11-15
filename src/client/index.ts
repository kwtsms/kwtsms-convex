/*
FILE:      src/client/index.ts
CREATED:   2026-11-16 01:57 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Kwtsms client class: sendSms, sendOtp, getStatus, balance, called from the app's own functions.
WHY:       Apps use the component through one small class (as with @convex-dev/resend): defaults live here, testMode is ON.
*/
import {
  createFunctionHandle,
  type FunctionReference,
  type FunctionVisibility,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type {
  RuntimeOptions,
  SmsEvent,
  SmsStatus,
} from "../component/shared.js";

export type { SmsEvent, SmsStatus, RefusalCode } from "../component/shared.js";
export { vSmsEvent, vStatus } from "../component/shared.js";
export type SmsId = GenericId<"messages">;

export type KwtsmsOptions = {
  /** Default true: sends test "1" (kwtSMS accepts it, no handset gets it). Set false to go live. */
  testMode?: boolean;
  /** Country calling codes that may receive SMS. Default ["965"]. */
  allowedCountries?: string[];
  /** Max messages per phone number per hour. Default 5. */
  perNumberPerHour?: number;
  /** Max messages per hour for the whole app. Default 100. */
  globalPerHour?: number;
  /** Max points per 24 hours. Default 500. */
  dailyPointsCap?: number;
  /** Internal mutation called on every state change: (ctx, { id, event }). */
  onSmsEvent?: FunctionReference<
    "mutation",
    FunctionVisibility,
    { id: string; event: SmsEvent }
  >;
};

type RunMutation = {
  runMutation: (fn: never, args: never) => Promise<unknown>;
};
type RunQuery = { runQuery: (fn: never, args: never) => Promise<unknown> };
type RunAction = { runAction: (fn: never, args: never) => Promise<unknown> };

export type SmsStatusResult = {
  status: SmsStatus;
  testMode: boolean;
  msgId?: string;
  points?: number;
  balanceAfter?: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
  finalizedAt?: number;
} | null;

export class Kwtsms {
  constructor(
    public component: ComponentApi,
    private options: KwtsmsOptions = {},
  ) {}

  private async runtimeOptions(): Promise<RuntimeOptions> {
    const o = this.options;
    return {
      testMode: o.testMode ?? true,
      allowedCountries: o.allowedCountries ?? ["965"],
      perNumberPerHour: o.perNumberPerHour ?? 5,
      globalPerHour: o.globalPerHour ?? 100,
      dailyPointsCap: o.dailyPointsCap ?? 500,
      onSmsEvent: o.onSmsEvent
        ? await createFunctionHandle(o.onSmsEvent)
        : undefined,
    };
  }

  /** Queue one SMS. Throws ConvexError({ code }) when refused; returns the existing id when idempotencyKey repeats. */
  async sendSms(
    ctx: RunMutation,
    args: { to: string; text: string; idempotencyKey?: string },
  ): Promise<SmsId> {
    return (await ctx.runMutation(this.component.lib.send as never, {
      ...args,
      options: await this.runtimeOptions(),
    } as never)) as SmsId;
  }

  /** Queue one OTP. The code is never stored; keep this behind your own auth. */
  async sendOtp(
    ctx: RunMutation,
    args: {
      to: string;
      code: string;
      lang?: "en" | "ar";
      appName?: string;
      idempotencyKey?: string;
    },
  ): Promise<SmsId> {
    return (await ctx.runMutation(this.component.lib.sendOtp as never, {
      to: args.to,
      code: args.code,
      lang: args.lang ?? "en",
      appName: args.appName ?? "App",
      idempotencyKey: args.idempotencyKey,
      options: await this.runtimeOptions(),
    } as never)) as SmsId;
  }

  /** queued, sending, sent (accepted by the gateway, not proof of delivery) or failed. */
  async getStatus(ctx: RunQuery, id: SmsId): Promise<SmsStatusResult> {
    return (await ctx.runQuery(
      this.component.lib.status as never,
      { id } as never,
    )) as SmsStatusResult;
  }

  /** Credit balance. Server-side only: never return it to the browser. */
  async balance(
    ctx: RunAction,
  ): Promise<{ available: number; purchased: number }> {
    return (await ctx.runAction(
      this.component.lib.balance as never,
      {} as never,
    )) as { available: number; purchased: number };
  }
}
