import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Single-user auth.
 *
 * This app holds a complete personal work history, so the deployed URL must not
 * be publicly readable. GitHub OAuth is used purely as an identity check: only
 * the one GitHub login named in ALLOWED_GITHUB_LOGIN may sign in. Everyone else
 * is rejected at the signIn callback, before a session is ever issued.
 *
 * No database adapter — sessions are JWTs. There is exactly one user; there is
 * nothing to persist.
 */
const allowedLogin = process.env.ALLOWED_GITHUB_LOGIN?.trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    signIn({ profile }) {
      // Fail closed: an unset allowlist locks everyone out rather than letting
      // any GitHub account in.
      if (!allowedLogin) return false;
      const login = (profile?.login as string | undefined)?.toLowerCase();
      return login === allowedLogin;
    },

    /**
     * REQUIRED for the proxy to gate anything.
     *
     * `export default auth` as the proxy does not block unauthenticated
     * requests on its own — next-auth defaults `authorized` to true and only
     * consults this callback when it is defined. Without it the proxy attaches
     * session info and lets every request through, which left every page in
     * this app publicly readable.
     */
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
  },
});
