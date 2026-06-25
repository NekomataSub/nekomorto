CREATE TABLE "auth_users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "role" TEXT DEFAULT 'normal',
  "banned" BOOLEAN DEFAULT false,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ,
  "twoFactorEnabled" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users" ("email");
CREATE INDEX "auth_users_role_idx" ON "auth_users" ("role");

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  "impersonatedBy" TEXT,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions" ("token");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions" ("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions" ("expiresAt");

CREATE TABLE "auth_accounts" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "auth_accounts_providerId_accountId_key" ON "auth_accounts" ("providerId", "accountId");
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts" ("userId");

CREATE TABLE "auth_verifications" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier");

CREATE TABLE "auth_two_factors" (
  "id" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "auth_two_factors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE INDEX "auth_two_factors_secret_idx" ON "auth_two_factors" ("secret");
CREATE INDEX "auth_two_factors_userId_idx" ON "auth_two_factors" ("userId");

CREATE TABLE "auth_passkeys" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "publicKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialID" TEXT NOT NULL,
  "counter" INTEGER NOT NULL,
  "deviceType" TEXT NOT NULL,
  "backedUp" BOOLEAN NOT NULL,
  "transports" TEXT,
  "createdAt" TIMESTAMPTZ,
  "aaguid" TEXT,
  CONSTRAINT "auth_passkeys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE INDEX "auth_passkeys_userId_idx" ON "auth_passkeys" ("userId");
CREATE INDEX "auth_passkeys_credentialID_idx" ON "auth_passkeys" ("credentialID");

DO $$
BEGIN
  IF EXISTS (
    WITH approved AS (
      SELECT "userId" FROM "allowed_users"
      UNION
      SELECT "userId" FROM "owner_ids"
    ), candidate_emails AS (
      SELECT LOWER(COALESCE(
        NULLIF(identity."emailNormalized", ''),
        NULLIF(u."data"->>'email', ''),
        u."id" || '@users.invalid'
      )) AS email
      FROM "users" u
      JOIN approved ON approved."userId" = u."id"
      LEFT JOIN LATERAL (
        SELECT i.* FROM "user_identities" i
        WHERE i."userId" = u."id" AND i."disabledAt" IS NULL
        ORDER BY i."emailVerified" DESC NULLS LAST, i."lastUsedAt" DESC NULLS LAST
        LIMIT 1
      ) identity ON true
    )
    SELECT 1 FROM candidate_emails GROUP BY email HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Better Auth cutover aborted: duplicate approved-user email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "userId" FROM "allowed_users"
      UNION
      SELECT "userId" FROM "owner_ids"
    ) approved
    LEFT JOIN "users" u ON u."id" = approved."userId"
    WHERE u."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Better Auth cutover aborted: approved user has no canonical users row';
  END IF;
END $$;

WITH approved AS (
  SELECT "userId" FROM "allowed_users"
  UNION
  SELECT "userId" FROM "owner_ids"
), candidates AS (
  SELECT
    u."id",
    COALESCE(NULLIF(u."data"->>'name', ''), NULLIF(v2."name", ''), u."id") AS "name",
    LOWER(COALESCE(NULLIF(identity."emailNormalized", ''), NULLIF(u."data"->>'email', ''), u."id" || '@users.invalid')) AS "email",
    COALESCE(identity."emailVerified", false) AS "emailVerified",
    COALESCE(NULLIF(u."data"->>'avatarUrl', ''), v2."avatarUrl") AS "image",
    CASE
      WHEN owner."userId" IS NOT NULL AND owner."position" = (SELECT MIN("position") FROM "owner_ids")
        THEN 'owner_primary'
      WHEN owner."userId" IS NOT NULL THEN 'owner_secondary'
      ELSE COALESCE(NULLIF(v2."accessRole", ''), NULLIF(u."accessRole", ''), 'normal')
    END AS "role",
    COALESCE(u."createdAt", NOW()) AS "createdAt",
    COALESCE(u."updatedAt", NOW()) AS "updatedAt",
    1 AS email_rank
  FROM "users" u
  JOIN approved ON approved."userId" = u."id"
  LEFT JOIN "users_v2" v2 ON v2."id" = u."id"
  LEFT JOIN "owner_ids" owner ON owner."userId" = u."id"
  LEFT JOIN LATERAL (
    SELECT i.* FROM "user_identities" i
    WHERE i."userId" = u."id" AND i."disabledAt" IS NULL
    ORDER BY i."emailVerified" DESC NULLS LAST, i."lastUsedAt" DESC NULLS LAST
    LIMIT 1
  ) identity ON true
)
INSERT INTO "auth_users" (
  "id", "name", "email", "emailVerified", "image", "role", "twoFactorEnabled", "createdAt", "updatedAt"
)
SELECT "id", "name", "email", "emailVerified", "image", "role", false, "createdAt", "updatedAt"
FROM candidates
WHERE email_rank = 1;

INSERT INTO "auth_accounts" (
  "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
)
SELECT
  i."id",
  i."providerSubject",
  i."provider",
  i."userId",
  COALESCE(i."createdAt", NOW()),
  COALESCE(i."updatedAt", NOW())
FROM "user_identities" i
JOIN "auth_users" u ON u."id" = i."userId"
WHERE i."disabledAt" IS NULL AND i."provider" IN ('discord', 'google')
ON CONFLICT ("providerId", "accountId") DO NOTHING;

-- Legacy express-session, TOTP and WebAuthn rows are intentionally retained for rollback,
-- but no session or MFA material is imported into Better Auth.
