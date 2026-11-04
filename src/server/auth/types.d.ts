import "next-auth";

declare module "next-auth" {
  /** What the client sees: no profile, no token. */
  interface Session {
    user: { id: string; name: string; email: string };
  }
}
