import { redirect } from "next/navigation";
import { getRepository } from "@/lib/db/repository";

// Auto-route the /brains entry. There is one Company Brain per user in the
// new product framing - no Sell-Side / Buy-Side picker, no "create another
// brain" form. Behavior:
//
//   - 0 brains -> /onboarding (sign up flow that creates the first brain
//     after the user picks connectors)
//   - 1+ brains -> /brains/<first> (drop straight into the dashboard)
//
// The legacy picker (which exposed Sell-Side Deal Brain / Buy-Side / PE Deal
// Brain templates) is intentionally gone - those templates predate the
// Company Brain rewrite and will be removed from packages/core/brain-templates
// in a follow-up.

export default async function BrainsPage() {
  const brains = await getRepository().listBrains();
  if (brains.length === 0) {
    redirect("/onboarding");
  }
  redirect(`/brains/${brains[0].id}`);
}
