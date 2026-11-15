/*
FILE:      src/component/convex.config.ts
CREATED:   2026-11-16 01:52 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Component definition: name, typed env (kwtSMS credentials) and a workpool.
WHY:       Components cannot read the app's process.env; the app passes the credentials in app.use(kwtsms, { env }).
           The workpool queues the sends (same pattern as @convex-dev/resend).
*/
import { defineComponent } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config.js";

const component = defineComponent("kwtsms", {
  env: {
    KWTSMS_USERNAME: v.string(),
    KWTSMS_PASSWORD: v.string(),
    KWTSMS_SENDER_ID: v.string(),
  },
});
component.use(workpool, { name: "smsWorkpool" });

export default component;
