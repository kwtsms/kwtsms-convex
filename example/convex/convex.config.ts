/*
FILE:      example/convex/convex.config.ts
CREATED:   2026-11-16 02:00 +03
TASK:      int-convex
AUTHOR:    M Alhassoun
WHAT:      Example app: installs kwtsms and passes its credentials from the app's own env.
WHY:       Components cannot read the app's process.env, so the app hands the values over by reference.
*/
import { defineApp } from "convex/server";
import { v } from "convex/values";
import kwtsms from "kwtsms-convex/convex.config.js";

const app = defineApp({
  env: {
    KWTSMS_USERNAME: v.string(),
    KWTSMS_PASSWORD: v.string(),
    KWTSMS_SENDER_ID: v.string(),
  },
});
app.use(kwtsms, {
  env: {
    KWTSMS_USERNAME: app.env.KWTSMS_USERNAME,
    KWTSMS_PASSWORD: app.env.KWTSMS_PASSWORD,
    KWTSMS_SENDER_ID: app.env.KWTSMS_SENDER_ID,
  },
});

export default app;
