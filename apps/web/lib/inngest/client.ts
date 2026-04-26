import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "arvya-os",
  name: "Arvya OS Always-On Brain",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
