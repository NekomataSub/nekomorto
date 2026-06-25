import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const betterAuthStatements = {
  ...defaultStatements,
  content: [
    "posts",
    "projetos",
    "comentarios",
    "paginas",
    "uploads",
    "analytics",
    "usuarios",
    "configuracoes",
    "audit_log",
    "integracoes",
  ],
};

export const betterAuthAccessControl = createAccessControl(betterAuthStatements);

const noAdminActions = {
  user: [],
  session: [],
};

const allContentActions = [...betterAuthStatements.content];

export const betterAuthRoles = {
  normal: betterAuthAccessControl.newRole({
    ...noAdminActions,
    content: [],
  }),
  admin: betterAuthAccessControl.newRole({
    user: ["list", "get", "update"],
    session: ["list", "revoke", "delete"],
    content: ["posts", "projetos", "comentarios", "paginas", "uploads", "analytics", "usuarios"],
  }),
  owner_secondary: betterAuthAccessControl.newRole({
    user: [...betterAuthStatements.user],
    session: [...betterAuthStatements.session],
    content: allContentActions,
  }),
  owner_primary: betterAuthAccessControl.newRole({
    user: [...betterAuthStatements.user],
    session: [...betterAuthStatements.session],
    content: allContentActions,
  }),
};
