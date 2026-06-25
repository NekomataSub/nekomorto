import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

const TWO_FACTOR_COOKIE_NAME = "two_factor";

export const oauthTwoFactorGate = ({ loginPath = "/login", maxAge = 600 } = {}) => ({
  id: "nekomorto-oauth-two-factor-gate",
  hooks: {
    after: [
      {
        matcher: (context) => context.path === "/callback/:id",
        handler: createAuthMiddleware(async (ctx) => {
          const data = ctx.context.newSession;
          if (!data?.user?.twoFactorEnabled) {
            return;
          }

          deleteSessionCookie(ctx, true);
          await ctx.context.internalAdapter.deleteSession(data.session.token);
          ctx.context.setNewSession(null);

          const identifier = `2fa-${generateRandomString(20)}`;
          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: data.user.id,
            expiresAt: new Date(Date.now() + maxAge * 1000),
          });
          const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, { maxAge });
          await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);

          throw ctx.redirect(`${loginPath}?mfa=required`);
        }),
      },
    ],
  },
});
