ALTER TABLE "auth_users"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "auth_users" au
SET "permissions" = COALESCE(legacy."permissions", ARRAY[]::TEXT[])
FROM (
  SELECT
    u."id",
    ARRAY(
      SELECT DISTINCT LOWER(TRIM(value))
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(u."data"::jsonb -> 'permissions') = 'array'
            THEN u."data"::jsonb -> 'permissions'
          ELSE '[]'::jsonb
        END
      ) AS value
      WHERE TRIM(value) <> ''
    ) AS "permissions"
  FROM "users" u
) legacy
WHERE au."id" = legacy."id";

UPDATE "auth_users" au
SET
  "role" = CASE
    WHEN owners."position" = 0 THEN 'owner_primary'
    ELSE 'owner_secondary'
  END,
  "permissions" = ARRAY[
    'posts',
    'projetos',
    'comentarios',
    'paginas',
    'uploads',
    'analytics',
    'usuarios',
    'configuracoes',
    'audit_log',
    'integracoes'
  ]::TEXT[]
FROM "owner_ids" owners
WHERE au."id" = owners."userId";
