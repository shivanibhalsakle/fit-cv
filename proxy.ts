import { auth } from "@/lib/auth";

// Everything is gated except the sign-in page and the auth endpoints themselves.
// Next 16 renamed the "middleware" convention to "proxy".
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)",
  ],
};
