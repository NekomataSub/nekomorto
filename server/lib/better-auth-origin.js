import { buildOriginConfig } from "./origin-config.js";

const DEFAULT_BETTER_AUTH_ORIGIN = "http://localhost:8080";

export const resolveBetterAuthOriginConfig = ({
  appOriginEnv = "",
  adminOriginsEnv = "",
  isProduction = false,
} = {}) => {
  const originConfig = buildOriginConfig({
    appOriginEnv,
    adminOriginsEnv,
    isProduction,
    devPrimaryOriginFallback: DEFAULT_BETTER_AUTH_ORIGIN,
  });
  return {
    baseURL: originConfig.primaryAppOrigin,
    trustedOrigins: Array.from(
      new Set([originConfig.primaryAppOrigin, ...originConfig.allowedOrigins]),
    ),
  };
};
