import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { getApiBase } from "@/lib/api-base";

export const authClient = createAuthClient({
  baseURL: getApiBase(),
  basePath: "/api/auth",
  plugins: [twoFactorClient({ twoFactorPage: "/login?mfa=required" }), passkeyClient()],
});
