import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Defence in depth.
 *
 * The proxy gates routes, but a proxy is one config line away from silently
 * authorising everything — which is exactly what happened here before the
 * `authorized` callback was added. Every page and every server action checks
 * the session itself as well, so that a gate misconfiguration degrades to a
 * redirect rather than to an open door.
 *
 * Redirecting rather than throwing also gives an expired session a sensible
 * ending: the user lands on sign-in instead of a runtime error page.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session.user;
}
