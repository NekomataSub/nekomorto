import { getPrismaClient } from "../server/lib/prisma-client.js";

const prisma = getPrismaClient();

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

try {
  const [allowed, owners, users, identities] = await Promise.all([
    prisma.allowedUserRecord.findMany(),
    prisma.ownerIdRecord.findMany(),
    prisma.userRecord.findMany(),
    prisma.userIdentityRecord.findMany({ where: { disabledAt: null } }),
  ]);
  const approvedIds = new Set([...allowed, ...owners].map((entry) => String(entry.userId)));
  const approvedUsers = users.filter((entry) => approvedIds.has(String(entry.id)));
  const identitiesByUser = new Map();
  identities.forEach((entry) => {
    const current = identitiesByUser.get(entry.userId) || [];
    current.push(entry);
    identitiesByUser.set(entry.userId, current);
  });

  const emails = new Map();
  const missingIdentity = [];
  approvedUsers.forEach((user) => {
    const userIdentities = identitiesByUser.get(user.id) || [];
    if (!userIdentities.some((entry) => ["discord", "google"].includes(entry.provider))) {
      missingIdentity.push(user.id);
    }
    const email =
      userIdentities.map((entry) => normalize(entry.emailNormalized)).find(Boolean) ||
      normalize(user.data?.email) ||
      `${user.id}@users.invalid`;
    const current = emails.get(email) || [];
    current.push(user.id);
    emails.set(email, current);
  });
  const duplicateEmails = [...emails.entries()]
    .filter(([, userIds]) => userIds.length > 1)
    .map(([email, userIds]) => ({ email, userIds }));
  const orphanIdentities = identities
    .filter(
      (entry) =>
        approvedIds.has(String(entry.userId)) && !users.some((user) => user.id === entry.userId),
    )
    .map((entry) => entry.id);

  const report = {
    approvedUsers: approvedUsers.length,
    oauthIdentities: identities.filter(
      (entry) =>
        approvedIds.has(String(entry.userId)) && ["discord", "google"].includes(entry.provider),
    ).length,
    duplicateEmails,
    missingIdentity,
    orphanIdentities,
    ready: duplicateEmails.length === 0 && orphanIdentities.length === 0,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
