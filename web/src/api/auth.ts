import { createAuthClient } from "better-auth/react";

/** Same-origin Better Auth client; Vite proxies this path in development. */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
});
