import DashboardShell from "@/components/DashboardShell";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import DashboardPageContainer from "@/components/dashboard/DashboardPageContainer";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import { Combobox, Input, Textarea } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardAnimationDelay,
  dashboardMotionDelays,
} from "@/components/dashboard/dashboard-motion";
import {
  dashboardPageLayoutTokens,
  dashboardStrongFocusFieldClassName,
  dashboardStrongFocusScopeClassName,
  dashboardStrongFocusTriggerClassName,
  dashboardStrongSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AsyncState from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from "@/components/ui/color-picker";
import CompactPagination from "@/components/ui/compact-pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { useDashboardRefreshToast } from "@/hooks/use-dashboard-refresh-toast";
import { usePageMeta } from "@/hooks/use-page-meta";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { resolveGrants } from "@/lib/access-control";
import { ClipboardPaste, Copy, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type ChannelKey = "posts" | "projects";
type EventKey = "post_create" | "post_update" | "project_release" | "project_adjust";
type WebhookProvider = "discord";
type SaveSectionKey = "types" | "posts" | "projects" | "operational" | "security";

const SECTION_REVEAL_DELAYS: Record<SaveSectionKey, number> = {
  types: 0,
  posts: dashboardMotionDelays.sectionStepMs,
  projects: dashboardMotionDelays.sectionStepMs * 2,
  operational: dashboardMotionDelays.sectionStepMs * 3,
  security: dashboardMotionDelays.sectionStepMs * 4,
};

const deliveryScopeOptions = [
  { value: "all", label: "Todos" },
  { value: "editorial", label: "Editorial" },
  { value: "ops_alerts", label: "Alertas operacionais" },
  { value: "security", label: "Segurança" },
];

const deliveryStatusOptions = [
  { value: "all", label: "Todos" },
  { value: "queued", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "retrying", label: "Reagendado" },
  { value: "failed", label: "Falhou" },
  { value: "sent", label: "Enviado" },
];

const deliveryChannelOptions = [
  { value: "all", label: "Todos" },
  { value: "posts", label: "Posts" },
  { value: "projects", label: "Projetos" },
];

type TemplateField = { name: string; value: string; inline: boolean };
type TemplateEmbed = {
  title: string;
  description: string;
  footerText: string;
  footerIconUrl: string;
  url: string;
  color: string;
  authorName: string;
  authorIconUrl: string;
  authorUrl: string;
  thumbnailUrl: string;
  imageUrl: string;
  fields: TemplateField[];
};
type Template = { content: string; embed: TemplateEmbed };
type TypeRole = { type: string; roleId: string; enabled: boolean; order: number };
type DashboardCurrentUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  permissions?: string[];
  grants?: Partial<Record<string, boolean>>;
};

type WebhookDeliveryStatus = "queued" | "processing" | "retrying" | "sent" | "failed";
type WebhookDeliveryScope = "editorial" | "ops_alerts" | "security";
type WebhookDeliveryItem = {
  id: string;
  scope: WebhookDeliveryScope | string;
  channel: string;
  eventKey: string;
  eventLabel: string;
  status: WebhookDeliveryStatus | string;
  provider: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  statusCode: number | null;
  error: string | null;
  targetLabel: string;
  resourceIds: {
    postId?: string;
    projectId?: string;
    securityEventId?: string;
  };
  isRetryable: boolean;
};
type WebhookDeliverySummary = {
  queued: number;
  processing: number;
  retrying: number;
  failed: number;
  sentLast24h: number;
};

type EditorialSettings = {
  version: 1;
  mentionMode: "role_id";
  mentionFallback: "skip";
  generalReleaseRoleId: string;
  typeRoles: TypeRole[];
  channels: {
    posts: {
      enabled: boolean;
      webhookUrl: string;
      timeoutMs: number;
      retries: number;
      events: { post_create: boolean; post_update: boolean };
      templates: { post_create: Template; post_update: Template };
    };
    projects: {
      enabled: boolean;
      webhookUrl: string;
      timeoutMs: number;
      retries: number;
      events: { project_release: boolean; project_adjust: boolean };
      templates: { project_release: Template; project_adjust: Template };
    };
  };
};
type OperationalWebhookSettings = {
  enabled: boolean;
  provider: WebhookProvider;
  webhookUrl: string;
  timeoutMs: number;
  intervalMs: number;
};
type SecurityWebhookSettings = {
  enabled: boolean;
  provider: WebhookProvider;
  webhookUrl: string;
  timeoutMs: number;
};
type UnifiedWebhookSettings = {
  version: 2;
  editorial: EditorialSettings;
  operational: OperationalWebhookSettings;
  security: SecurityWebhookSettings;
};
type WebhookSettingsSources = {
  editorial: string;
  operational: string;
  security: string;
};
type EditorialWebhookTemplatePackage = {
  kind: "nekomorto.editorialWebhookTemplate";
  version: 1;
  channelKey: ChannelKey;
  eventKey: EventKey;
  template: Template;
};
type TemplateClipboardDialogState = {
  mode: "copy" | "paste";
  channelKey: ChannelKey;
  eventKey: EventKey;
  value: string;
} | null;

const CHANNEL_EVENTS: Record<ChannelKey, EventKey[]> = {
  posts: ["post_create", "post_update"],
  projects: ["project_release", "project_adjust"],
};

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  posts: "Posts",
  projects: "Projetos",
};

const EVENT_LABELS: Record<EventKey, string> = {
  post_create: "Novo post",
  post_update: "Post atualizado",
  project_release: "Novo lançamento",
  project_adjust: "Ajuste em capítulo/episódio",
};
const WEBHOOK_DELIVERY_SCOPE_LABELS: Record<string, string> = {
  editorial: "Editorial",
  ops_alerts: "Alertas operacionais",
  security: "Segurança",
};
const WEBHOOK_DELIVERY_STATUS_LABELS: Record<string, string> = {
  queued: "Na fila",
  processing: "Processando",
  retrying: "Reagendado",
  sent: "Enviado",
  failed: "Falhou",
};
const WEBHOOK_DELIVERY_STATUS_VARIANTS: Record<
  string,
  "neutral" | "warning" | "success" | "danger" | "outline"
> = {
  queued: "neutral",
  processing: "warning",
  retrying: "warning",
  sent: "success",
  failed: "danger",
};
const WEBHOOK_ACCORDION_CONTENT_CLASSNAME = "space-y-4 px-1";
const EDITORIAL_WEBHOOK_TEMPLATE_KIND = "nekomorto.editorialWebhookTemplate";
const EDITORIAL_WEBHOOK_TEMPLATE_VERSION = 1;

const COMMON_PLACEHOLDERS = [
  "evento.chave",
  "evento.rotulo",
  "evento.ocorridoEm",
  "site.nome",
  "site.url",
  "site.logoUrl",
  "site.capaUrl",
  "site.faviconUrl",
  "mencao.tipo",
  "mencao.projeto",
  "mencao.lancamento",
  "mencao.todos",
  "autor.nome",
  "autor.avatarUrl",
];

const POST_PLACEHOLDERS = [
  "postagem.id",
  "postagem.titulo",
  "postagem.slug",
  "postagem.url",
  "postagem.status",
  "postagem.autor",
  "postagem.autorAvatarUrl",
  "postagem.publicadoEm",
  "postagem.atualizadoEm",
  "postagem.resumo",
  "postagem.tags",
  "postagem.capaUrl",
  "postagem.capaAlt",
  "postagem.imagemUrl",
  "postagem.ogImagemUrl",
];

const PROJECT_PLACEHOLDERS = [
  "projeto.id",
  "projeto.titulo",
  "projeto.tipo",
  "projeto.categoria",
  "projeto.url",
  "projeto.capaUrl",
  "projeto.bannerUrl",
  "projeto.heroImagemUrl",
  "projeto.imagemUrl",
  "projeto.fundoImagemUrl",
  "projeto.ogImagemUrl",
  "projeto.sinopse",
  "projeto.tags",
  "projeto.generos",
];

const CONTENT_PLACEHOLDERS = [
  "conteudo.tipo",
  "conteudo.numero",
  "conteudo.volume",
  "conteudo.titulo",
  "conteudo.sinopse",
  "conteudo.url",
  "conteudo.dataLancamento",
  "conteudo.atualizadoEm",
  "conteudo.capaUrl",
  "conteudo.imagemUrl",
  "conteudo.ogImagemUrl",
  "conteudo.formato",
  "conteudo.status",
  "conteudo.rotulo",
];

const UPDATE_PLACEHOLDERS = ["atualizacao.tipo", "atualizacao.motivo"];

const PLACEHOLDERS: Record<EventKey, string[]> = {
  post_create: [...COMMON_PLACEHOLDERS, ...POST_PLACEHOLDERS, ...PROJECT_PLACEHOLDERS],
  post_update: [...COMMON_PLACEHOLDERS, ...POST_PLACEHOLDERS, ...PROJECT_PLACEHOLDERS],
  project_release: [
    ...COMMON_PLACEHOLDERS,
    ...PROJECT_PLACEHOLDERS,
    ...CONTENT_PLACEHOLDERS,
    ...UPDATE_PLACEHOLDERS,
  ],
  project_adjust: [
    ...COMMON_PLACEHOLDERS,
    ...PROJECT_PLACEHOLDERS,
    ...CONTENT_PLACEHOLDERS,
    ...UPDATE_PLACEHOLDERS,
  ],
};

const PLACEHOLDER_DESCRIPTIONS: Record<string, string> = {
  "evento.chave": "Mostra a chave técnica do evento. Ex.: post_create ou project_release.",
  "evento.rotulo": "Mostra o nome legível do evento. Ex.: Novo lançamento.",
  "evento.ocorridoEm":
    "Mostra a data e hora em que o evento ocorreu. Ex.: 2026-03-01T12:00:00.000Z.",
  "site.nome": "Mostra o nome público do site. Ex.: Nekomata.",
  "site.url": "Mostra a URL pública principal do site. Ex.: https://nekomata.example.",
  "site.logoUrl": "Mostra a URL do logo do site. Ex.: https://nekomata.example/logo.png.",
  "site.capaUrl": "Mostra a imagem padrão de compartilhamento do site. Ex.: /uploads/og-site.jpg.",
  "site.faviconUrl": "Mostra a URL do favicon do site. Ex.: /favicon.ico.",
  "mencao.tipo": "Mostra a menção do cargo configurado para o tipo do projeto. Ex.: <@&123456789>.",
  "mencao.projeto": "Mostra a menção do cargo específico do projeto. Ex.: <@&234567890>.",
  "mencao.lancamento": "Mostra a menção do cargo geral de lançamentos. Ex.: <@&345678901>.",
  "mencao.todos": "Mostra todas as menções aplicáveis ao evento. Ex.: <@&123> <@&456>.",
  "autor.nome": "Mostra o nome do autor ou editor relacionado. Ex.: Equipe Nekomata.",
  "autor.avatarUrl": "Mostra a URL do avatar do autor ou editor. Ex.: /uploads/avatars/editor.png.",
  "postagem.id": "Mostra o ID interno da postagem. Ex.: post_01hxyz.",
  "postagem.titulo": "Mostra o título da postagem. Ex.: Guia da temporada.",
  "postagem.slug": "Mostra o slug público da postagem. Ex.: guia-da-temporada.",
  "postagem.url": "Mostra a URL pública da postagem. Ex.: https://nekomata.example/postagem/guia.",
  "postagem.status": "Mostra o status salvo da postagem. Ex.: published ou draft.",
  "postagem.autor": "Mostra o nome do autor da postagem. Ex.: Akira.",
  "postagem.autorAvatarUrl":
    "Mostra a URL do avatar do autor da postagem. Ex.: /uploads/avatars/akira.png.",
  "postagem.publicadoEm": "Mostra a data de publicação da postagem. Ex.: 2026-03-01.",
  "postagem.atualizadoEm":
    "Mostra a data da última atualização da postagem. Ex.: 2026-03-02T10:30:00.000Z.",
  "postagem.resumo": "Mostra o resumo ou excerto da postagem. Ex.: Confira os destaques da semana.",
  "postagem.tags":
    "Mostra as tags da postagem, separadas por vírgula. Ex.: anime, guia, temporada.",
  "postagem.capaUrl": "Mostra a URL da capa cadastrada na postagem. Ex.: /uploads/posts/capa.jpg.",
  "postagem.capaAlt":
    "Mostra o texto alternativo da capa da postagem. Ex.: Personagem principal em destaque.",
  "postagem.imagemUrl":
    "Mostra a melhor imagem disponível para a postagem. Ex.: capa, OG ou imagem padrão.",
  "postagem.ogImagemUrl":
    "Mostra a imagem OG gerada ou resolvida para a postagem. Ex.: /api/og/post/guia.",
  "projeto.id": "Mostra o ID público do projeto. Ex.: minha-obra.",
  "projeto.titulo": "Mostra o título do projeto. Ex.: Minha Obra.",
  "projeto.tipo": "Mostra o tipo do projeto. Ex.: Anime, Manga ou Light Novel.",
  "projeto.categoria": "Mostra a categoria usada para menções do projeto. Ex.: Anime.",
  "projeto.url":
    "Mostra a URL pública do projeto. Ex.: https://nekomata.example/projeto/minha-obra.",
  "projeto.capaUrl": "Mostra a URL da capa cadastrada no projeto. Ex.: /uploads/projects/capa.jpg.",
  "projeto.bannerUrl":
    "Mostra a URL do banner cadastrado no projeto. Ex.: /uploads/projects/banner.jpg.",
  "projeto.heroImagemUrl":
    "Mostra a URL da imagem hero do projeto. Ex.: /uploads/projects/hero.jpg.",
  "projeto.imagemUrl":
    "Mostra a melhor imagem principal disponível para o projeto. Ex.: capa, hero ou OG.",
  "projeto.fundoImagemUrl":
    "Mostra a melhor imagem ampla ou de fundo do projeto. Ex.: banner ou hero.",
  "projeto.ogImagemUrl":
    "Mostra a imagem OG gerada ou resolvida para o projeto. Ex.: /api/og/project/minha-obra.",
  "projeto.sinopse": "Mostra a sinopse do projeto. Ex.: Uma história sobre recomeços.",
  "projeto.tags": "Mostra as tags do projeto, separadas por vírgula. Ex.: ação, drama, fantasia.",
  "projeto.generos":
    "Mostra os gêneros do projeto, separados por vírgula. Ex.: Aventura, Mistério.",
  "conteudo.tipo":
    "Mostra Capítulo, Episódio, Extra ou Especial conforme o conteúdo. Ex.: Capítulo.",
  "conteudo.numero": "Mostra o número do capítulo ou episódio. Ex.: 7.",
  "conteudo.volume": "Mostra o volume do conteúdo quando existir. Ex.: 2.",
  "conteudo.titulo": "Mostra o título do conteúdo, ou um fallback seguro. Ex.: O reencontro.",
  "conteudo.sinopse":
    "Mostra a sinopse do capítulo, episódio ou extra. Ex.: O grupo chega à capital.",
  "conteudo.url":
    "Mostra a URL pública de leitura do conteúdo. Ex.: /projeto/minha-obra/leitura/7.",
  "conteudo.dataLancamento": "Mostra a data de lançamento do conteúdo. Ex.: 2026-03-01.",
  "conteudo.atualizadoEm":
    "Mostra a data da última atualização do conteúdo. Ex.: 2026-03-02T10:30:00.000Z.",
  "conteudo.capaUrl":
    "Mostra a capa do conteúdo ou a imagem hero do projeto. Ex.: /uploads/capitulos/7.jpg.",
  "conteudo.imagemUrl":
    "Mostra a melhor imagem disponível para o conteúdo. Ex.: capa, banner, OG ou placeholder.",
  "conteudo.ogImagemUrl":
    "Mostra a imagem OG do conteúdo ou do projeto. Ex.: /api/og/project/minha-obra/reading/7.",
  "conteudo.formato":
    "Mostra o formato humano do conteúdo. Ex.: Imagem para images, Texto para lexical.",
  "conteudo.status": "Mostra o status humano do conteúdo. Ex.: Publicado ou Rascunho.",
  "conteudo.rotulo": "Mostra o rótulo público do conteúdo. Ex.: Capítulo 7.",
  "atualizacao.tipo": "Mostra o tipo da atualização. Ex.: Lançamento ou Ajuste.",
  "atualizacao.motivo":
    "Mostra o texto que resume o motivo da atualização. Ex.: Capítulo 7 disponível.",
};

const describePlaceholder = (placeholder: string) =>
  PLACEHOLDER_DESCRIPTIONS[placeholder] ||
  `Mostra o valor de ${placeholder}. Ex.: valor disponível no evento.`;

const DEFAULT_PROJECT_TYPES = ["Anime", "Manga", "Light Novel"];
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_OPERATIONAL_INTERVAL_MS = 60_000;
const MIN_OPERATIONAL_INTERVAL_MS = 10_000;
const MAX_OPERATIONAL_INTERVAL_MS = 60 * 60 * 1_000;
const ROLE_ID_PATTERN = /^\d+$/;
const DISCORD_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);
const DISCORD_WEBHOOK_PATH_PATTERN = /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/i;
const DEFAULT_EVENT_COLORS: Record<EventKey, string> = {
  post_create: "#3b82f6",
  post_update: "#f59e0b",
  project_release: "#10b981",
  project_adjust: "#f59e0b",
};

const TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;
const PLACEHOLDER_ALIAS_MAP: Record<string, string> = {
  "event.key": "evento.chave",
  "event.label": "evento.rotulo",
  "event.occurredAt": "evento.ocorridoEm",
  "site.name": "site.nome",
  "site.coverImageUrl": "site.capaUrl",
  "mention.type": "mencao.tipo",
  "mention.category": "mencao.tipo",
  "mention.project": "mencao.projeto",
  "mention.release": "mencao.lancamento",
  "mention.general": "mencao.lancamento",
  "mention.all": "mencao.todos",
  "author.name": "autor.nome",
  "author.avatarUrl": "autor.avatarUrl",
  "post.id": "postagem.id",
  "post.title": "postagem.titulo",
  "post.slug": "postagem.slug",
  "post.url": "postagem.url",
  "post.status": "postagem.status",
  "post.author": "postagem.autor",
  "post.authorAvatarUrl": "postagem.autorAvatarUrl",
  "post.publishedAt": "postagem.publicadoEm",
  "post.updatedAt": "postagem.atualizadoEm",
  "post.excerpt": "postagem.resumo",
  "post.tags": "postagem.tags",
  "post.coverImageUrl": "postagem.capaUrl",
  "post.coverAlt": "postagem.capaAlt",
  "post.imageUrl": "postagem.imagemUrl",
  "post.ogImageUrl": "postagem.ogImagemUrl",
  "project.id": "projeto.id",
  "project.title": "projeto.titulo",
  "project.type": "projeto.tipo",
  "project.category": "projeto.categoria",
  "project.url": "projeto.url",
  "project.cover": "projeto.capaUrl",
  "project.banner": "projeto.bannerUrl",
  "project.heroImageUrl": "projeto.heroImagemUrl",
  "project.imageUrl": "projeto.imagemUrl",
  "project.backdropImageUrl": "projeto.fundoImagemUrl",
  "project.ogImageUrl": "projeto.ogImagemUrl",
  "project.synopsis": "projeto.sinopse",
  "chapter.number": "conteudo.numero",
  "chapter.volume": "conteudo.volume",
  "chapter.title": "conteudo.titulo",
  "chapter.synopsis": "conteudo.sinopse",
  "chapter.releaseDate": "conteudo.dataLancamento",
  "chapter.updatedAt": "conteudo.atualizadoEm",
  "chapter.coverImageUrl": "conteudo.capaUrl",
  "chapter.imageUrl": "conteudo.imagemUrl",
  "chapter.ogImageUrl": "conteudo.ogImagemUrl",
  "content.type": "conteudo.tipo",
  "content.number": "conteudo.numero",
  "content.volume": "conteudo.volume",
  "content.title": "conteudo.titulo",
  "content.synopsis": "conteudo.sinopse",
  "content.url": "conteudo.url",
  "content.releaseDate": "conteudo.dataLancamento",
  "content.updatedAt": "conteudo.atualizadoEm",
  "content.coverImageUrl": "conteudo.capaUrl",
  "content.imageUrl": "conteudo.imagemUrl",
  "content.ogImageUrl": "conteudo.ogImagemUrl",
  "content.format": "conteudo.formato",
  "content.status": "conteudo.status",
  "content.label": "conteudo.rotulo",
  "update.kind": "atualizacao.tipo",
  "update.reason": "atualizacao.motivo",
  "update.unit": "conteudo.tipo",
  "update.episodeNumber": "conteudo.numero",
  "update.volume": "conteudo.volume",
};

const replaceTemplatePlaceholderAliases = (value: string) =>
  String(value || "").replace(TEMPLATE_PLACEHOLDER_PATTERN, (match, rawPath: string) => {
    const path = String(rawPath || "").trim();
    const canonicalPath = PLACEHOLDER_ALIAS_MAP[path] || path;
    return canonicalPath === path ? match : `{{${canonicalPath}}}`;
  });

const migrateTemplateAliasesDeep = <T,>(value: T): T => {
  if (typeof value === "string") {
    return replaceTemplatePlaceholderAliases(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => migrateTemplateAliasesDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, migrateTemplateAliasesDeep(item)]),
    ) as T;
  }
  return value;
};

const defaultTemplate = (eventKey: EventKey): Template =>
  migrateTemplateAliasesDeep({
    content: "{{mencao.todos}}",
    embed: {
      title: eventKey.startsWith("post") ? "{{postagem.titulo}}" : "{{projeto.titulo}}",
      description: eventKey.startsWith("post")
        ? "{{postagem.resumo}}\n{{postagem.url}}"
        : "{{atualizacao.motivo}}\n{{projeto.url}}",
      footerText: "{{site.nome}}",
      footerIconUrl: "{{site.logoUrl}}",
      url: eventKey.startsWith("post") ? "{{postagem.url}}" : "{{projeto.url}}",
      color:
        eventKey === "post_create"
          ? "#3b82f6"
          : eventKey === "project_release"
            ? "#10b981"
            : "#f59e0b",
      authorName: eventKey.startsWith("post") ? "{{autor.nome}}" : "{{evento.rotulo}}",
      authorIconUrl: eventKey.startsWith("post") ? "{{autor.avatarUrl}}" : "{{site.logoUrl}}",
      authorUrl: "{{site.url}}",
      thumbnailUrl: eventKey.startsWith("post")
        ? "{{postagem.imagemUrl}}"
        : "{{projeto.imagemUrl}}",
      imageUrl: eventKey.startsWith("post")
        ? "{{projeto.fundoImagemUrl}}"
        : "{{conteudo.imagemUrl}}",
      fields: eventKey.startsWith("post")
        ? [
            { name: "Status", value: "{{postagem.status}}", inline: true },
            { name: "Projeto", value: "{{projeto.titulo}}", inline: true },
          ]
        : [
            { name: "{{conteudo.tipo}}", value: "{{conteudo.numero}}", inline: true },
            { name: "Título", value: "{{chapter.title}}", inline: true },
          ],
    },
  });

const makeDefaultSettings = (
  projectTypes: string[] = DEFAULT_PROJECT_TYPES,
): EditorialSettings => ({
  version: 1,
  mentionMode: "role_id",
  mentionFallback: "skip",
  generalReleaseRoleId: "",
  typeRoles: projectTypes.map((type, order) => ({ type, roleId: "", enabled: true, order })),
  channels: {
    posts: {
      enabled: false,
      webhookUrl: "",
      timeoutMs: 5000,
      retries: 1,
      events: { post_create: true, post_update: true },
      templates: {
        post_create: defaultTemplate("post_create"),
        post_update: defaultTemplate("post_update"),
      },
    },
    projects: {
      enabled: false,
      webhookUrl: "",
      timeoutMs: 5000,
      retries: 1,
      events: { project_release: true, project_adjust: true },
      templates: {
        project_release: defaultTemplate("project_release"),
        project_adjust: defaultTemplate("project_adjust"),
      },
    },
  },
});

const asSettings = (value: unknown, projectTypes: string[]): EditorialSettings => {
  const fallback = makeDefaultSettings(projectTypes);
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const parsed = migrateTemplateAliasesDeep(value as Partial<EditorialSettings>);
  return {
    ...fallback,
    ...parsed,
    generalReleaseRoleId: String(parsed.generalReleaseRoleId || "").replace(/\D/g, ""),
    typeRoles: projectTypes.map((type, order) => {
      const existing = (Array.isArray(parsed.typeRoles) ? parsed.typeRoles : []).find(
        (item) =>
          String(item?.type || "")
            .trim()
            .toLowerCase() === type.toLowerCase(),
      );
      return {
        type,
        roleId: String(existing?.roleId || "").replace(/\D/g, ""),
        enabled: existing?.enabled !== false,
        order,
      };
    }),
  };
};

const makeDefaultOperationalSettings = (): OperationalWebhookSettings => ({
  enabled: false,
  provider: "discord",
  webhookUrl: "",
  timeoutMs: DEFAULT_TIMEOUT_MS,
  intervalMs: DEFAULT_OPERATIONAL_INTERVAL_MS,
});

const makeDefaultSecuritySettings = (): SecurityWebhookSettings => ({
  enabled: false,
  provider: "discord",
  webhookUrl: "",
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

const makeDefaultWebhookSettings = (
  projectTypes: string[] = DEFAULT_PROJECT_TYPES,
): UnifiedWebhookSettings => ({
  version: 2,
  editorial: makeDefaultSettings(projectTypes),
  operational: makeDefaultOperationalSettings(),
  security: makeDefaultSecuritySettings(),
});

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numeric)));
};

const asOperationalSettings = (value: unknown): OperationalWebhookSettings => {
  const fallback = makeDefaultOperationalSettings();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const parsed = value as Partial<OperationalWebhookSettings>;
  return {
    enabled: parsed.enabled === true,
    provider: "discord",
    webhookUrl: String(parsed.webhookUrl || "").trim(),
    timeoutMs: clampInt(parsed.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, fallback.timeoutMs),
    intervalMs: clampInt(
      parsed.intervalMs,
      MIN_OPERATIONAL_INTERVAL_MS,
      MAX_OPERATIONAL_INTERVAL_MS,
      fallback.intervalMs,
    ),
  };
};

const asSecuritySettings = (value: unknown): SecurityWebhookSettings => {
  const fallback = makeDefaultSecuritySettings();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const parsed = value as Partial<SecurityWebhookSettings>;
  return {
    enabled: parsed.enabled === true,
    provider: "discord",
    webhookUrl: String(parsed.webhookUrl || "").trim(),
    timeoutMs: clampInt(parsed.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, fallback.timeoutMs),
  };
};

const asUnifiedSettings = (value: unknown, projectTypes: string[]): UnifiedWebhookSettings => {
  const parsed =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const hasUnifiedEnvelope =
    Number(parsed.version || 0) === 2 ||
    Object.prototype.hasOwnProperty.call(parsed, "editorial") ||
    Object.prototype.hasOwnProperty.call(parsed, "operational") ||
    Object.prototype.hasOwnProperty.call(parsed, "security");

  return {
    version: 2,
    editorial: asSettings(hasUnifiedEnvelope ? parsed.editorial : parsed, projectTypes),
    operational: asOperationalSettings(hasUnifiedEnvelope ? parsed.operational : null),
    security: asSecuritySettings(hasUnifiedEnvelope ? parsed.security : null),
  };
};

const isValidWebhookUrl = (value: string) => {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }
  try {
    const parsed = new URL(text);
    return (
      parsed.protocol === "https:" &&
      DISCORD_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase()) &&
      DISCORD_WEBHOOK_PATH_PATTERN.test(parsed.pathname)
    );
  } catch {
    return false;
  }
};

const cloneSettings = (value: EditorialSettings): EditorialSettings =>
  JSON.parse(JSON.stringify(value)) as EditorialSettings;

const cloneWebhookSettings = (value: UnifiedWebhookSettings): UnifiedWebhookSettings =>
  JSON.parse(JSON.stringify(value)) as UnifiedWebhookSettings;

const WEBHOOKS_CACHE_TTL_MS = 60_000;

type WebhookSettingsCacheEntry = {
  projectTypes: string[];
  revision: string;
  settings: UnifiedWebhookSettings;
  savedSettings: UnifiedWebhookSettings;
  sources: WebhookSettingsSources;
  expiresAt: number;
};

let webhookSettingsCache: WebhookSettingsCacheEntry | null = null;

const DEFAULT_WEBHOOK_SOURCES: WebhookSettingsSources = {
  editorial: "stored",
  operational: "stored",
  security: "stored",
};

const readWebhookSettingsCache = () => {
  if (!webhookSettingsCache) {
    return null;
  }
  if (webhookSettingsCache.expiresAt <= Date.now()) {
    webhookSettingsCache = null;
    return null;
  }
  return {
    projectTypes: [...webhookSettingsCache.projectTypes],
    revision: String(webhookSettingsCache.revision || ""),
    settings: cloneWebhookSettings(webhookSettingsCache.settings),
    savedSettings: cloneWebhookSettings(webhookSettingsCache.savedSettings),
    sources: { ...webhookSettingsCache.sources },
  };
};

const writeWebhookSettingsCache = (value: {
  projectTypes: string[];
  revision: string;
  settings: UnifiedWebhookSettings;
  savedSettings: UnifiedWebhookSettings;
  sources?: WebhookSettingsSources;
}) => {
  webhookSettingsCache = {
    projectTypes: [...value.projectTypes],
    revision: String(value.revision || ""),
    settings: cloneWebhookSettings(value.settings),
    savedSettings: cloneWebhookSettings(value.savedSettings),
    sources: { ...DEFAULT_WEBHOOK_SOURCES, ...(value.sources || {}) },
    expiresAt: Date.now() + WEBHOOKS_CACHE_TTL_MS,
  };
};

const settingsMatch = (left: UnifiedWebhookSettings, right: UnifiedWebhookSettings) =>
  JSON.stringify(left) === JSON.stringify(right);

export const __testing = {
  clearWebhookSettingsCache: () => {
    webhookSettingsCache = null;
  },
  clearEditorialSettingsCache: () => {
    webhookSettingsCache = null;
  },
};

const normalizeHexColor = (value: string, fallback: string) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(prefixed)) {
    return prefixed.toLowerCase();
  }
  return fallback;
};

const normalizeTemplateField = (value: unknown): TemplateField => {
  const parsed =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<TemplateField>)
      : {};
  return {
    name: String(parsed.name || ""),
    value: String(parsed.value || ""),
    inline: parsed.inline === true,
  };
};

const normalizeTemplateEmbed = (value: unknown, fallbackColor: string): TemplateEmbed => {
  const parsed =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<TemplateEmbed>)
      : {};
  return {
    title: String(parsed.title || ""),
    description: String(parsed.description || ""),
    footerText: String(parsed.footerText || ""),
    footerIconUrl: String(parsed.footerIconUrl || ""),
    url: String(parsed.url || ""),
    color: normalizeHexColor(String(parsed.color || ""), fallbackColor),
    authorName: String(parsed.authorName || ""),
    authorIconUrl: String(parsed.authorIconUrl || ""),
    authorUrl: String(parsed.authorUrl || ""),
    thumbnailUrl: String(parsed.thumbnailUrl || ""),
    imageUrl: String(parsed.imageUrl || ""),
    fields: Array.isArray(parsed.fields) ? parsed.fields.map(normalizeTemplateField) : [],
  };
};

const normalizeTemplateForClipboard = (template: Template, eventKey: EventKey): Template =>
  migrateTemplateAliasesDeep({
    content: String(template.content || ""),
    embed: normalizeTemplateEmbed(template.embed, DEFAULT_EVENT_COLORS[eventKey]),
  });

const buildEditorialTemplatePackage = (
  channelKey: ChannelKey,
  eventKey: EventKey,
  template: Template,
): EditorialWebhookTemplatePackage => ({
  kind: EDITORIAL_WEBHOOK_TEMPLATE_KIND,
  version: EDITORIAL_WEBHOOK_TEMPLATE_VERSION,
  channelKey,
  eventKey,
  template: normalizeTemplateForClipboard(template, eventKey),
});

const parseEditorialTemplatePackage = (value: string, fallbackEventKey: EventKey) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("invalid_json");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_template_package");
  }
  const envelope = parsed as Partial<EditorialWebhookTemplatePackage>;
  if (
    envelope.kind !== EDITORIAL_WEBHOOK_TEMPLATE_KIND ||
    envelope.version !== EDITORIAL_WEBHOOK_TEMPLATE_VERSION
  ) {
    throw new Error("invalid_template_package");
  }
  if (
    !envelope.template ||
    typeof envelope.template !== "object" ||
    Array.isArray(envelope.template)
  ) {
    throw new Error("invalid_template_package");
  }

  const templateCandidate = envelope.template as Partial<Template>;
  if (
    typeof templateCandidate.content !== "string" ||
    !templateCandidate.embed ||
    typeof templateCandidate.embed !== "object" ||
    Array.isArray(templateCandidate.embed)
  ) {
    throw new Error("invalid_template_package");
  }

  return {
    channelKey: envelope.channelKey,
    eventKey: envelope.eventKey,
    template: normalizeTemplateForClipboard(
      {
        content: templateCandidate.content,
        embed: templateCandidate.embed as TemplateEmbed,
      },
      fallbackEventKey,
    ),
  };
};

const EMPTY_DELIVERY_SUMMARY: WebhookDeliverySummary = {
  queued: 0,
  processing: 0,
  retrying: 0,
  failed: 0,
  sentLast24h: 0,
};

const asWebhookDeliverySummary = (value: unknown): WebhookDeliverySummary => {
  if (!value || typeof value !== "object") {
    return EMPTY_DELIVERY_SUMMARY;
  }
  const parsed = value as Partial<WebhookDeliverySummary>;
  return {
    queued: Number(parsed.queued || 0),
    processing: Number(parsed.processing || 0),
    retrying: Number(parsed.retrying || 0),
    failed: Number(parsed.failed || 0),
    sentLast24h: Number(parsed.sentLast24h || 0),
  };
};

const asWebhookDeliveryItems = (value: unknown): WebhookDeliveryItem[] =>
  Array.isArray(value)
    ? value.map((item) => {
        const candidate =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Partial<WebhookDeliveryItem>)
            : {};
        return {
          id: String(candidate.id || ""),
          scope: String(candidate.scope || ""),
          channel: String(candidate.channel || ""),
          eventKey: String(candidate.eventKey || ""),
          eventLabel: String(candidate.eventLabel || ""),
          status: String(candidate.status || ""),
          provider: String(candidate.provider || ""),
          attemptCount: Number(candidate.attemptCount || 0),
          maxAttempts: Number(candidate.maxAttempts || 0),
          createdAt: candidate.createdAt ? String(candidate.createdAt) : null,
          nextAttemptAt: candidate.nextAttemptAt ? String(candidate.nextAttemptAt) : null,
          lastAttemptAt: candidate.lastAttemptAt ? String(candidate.lastAttemptAt) : null,
          statusCode: Number.isFinite(Number(candidate.statusCode))
            ? Number(candidate.statusCode)
            : null,
          error: candidate.error ? String(candidate.error) : null,
          targetLabel: String(candidate.targetLabel || ""),
          resourceIds:
            candidate.resourceIds && typeof candidate.resourceIds === "object"
              ? candidate.resourceIds
              : {},
          isRetryable: candidate.isRetryable === true,
        };
      })
    : [];

const formatWebhookTs = (value: string | null | undefined) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString("pt-BR");
};

const describeDeliveryResources = (delivery: WebhookDeliveryItem) => {
  const parts: string[] = [];
  if (delivery.resourceIds.postId) {
    parts.push(`Post ${delivery.resourceIds.postId}`);
  }
  if (delivery.resourceIds.projectId) {
    parts.push(`Projeto ${delivery.resourceIds.projectId}`);
  }
  if (delivery.resourceIds.securityEventId) {
    parts.push(`Evento ${delivery.resourceIds.securityEventId}`);
  }
  return parts.join(" | ");
};

const describeInvalidWebhookChannels = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) {
    return "Revise as URLs de webhook configuradas.";
  }
  const first =
    value[0] && typeof value[0] === "object" && !Array.isArray(value[0])
      ? (value[0] as { channel?: unknown; reason?: unknown; code?: unknown })
      : {};
  const channel = String(first.channel || "").trim();
  const label =
    channel === "posts" || channel === "projects"
      ? CHANNEL_LABELS[channel]
      : channel === "operational"
        ? "Alertas operacionais"
        : channel === "security"
          ? "Segurança"
          : channel || "canal";
  return `${label}: ${String(first.reason || first.code || "url inválida")}`;
};

const WebhookPlaceholderField = ({ label, wide = false }: { label: string; wide?: boolean }) => (
  <DashboardFieldStack className={wide ? "md:col-span-2" : undefined}>
    <Label>{label}</Label>
    <Skeleton className="h-10 w-full" />
  </DashboardFieldStack>
);

const WebhookTypesPlaceholder = () => (
  <div className="space-y-4 min-h-76" data-testid="dashboard-webhooks-placeholder-types">
    <DashboardFieldStack data-testid="dashboard-webhooks-general-role-placeholder-field">
      <Label>Role geral de lançamentos (ID)</Label>
      <Skeleton className="h-10 w-full" />
    </DashboardFieldStack>
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`dashboard-webhooks-placeholder-type-${index}`}
          className={`grid gap-3 ${dashboardPageLayoutTokens.surfaceInset} rounded-xl p-3 md:grid-cols-[1fr_280px]`}
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  </div>
);

const WebhookChannelPlaceholder = ({
  channelKey,
  testId,
}: {
  channelKey: ChannelKey;
  testId: string;
}) => (
  <div className="space-y-4 min-h-156" data-testid={testId}>
    <div className="grid gap-3 md:grid-cols-3">
      <WebhookPlaceholderField label="Webhook URL" wide />
      <WebhookPlaceholderField label="Timeout (ms)" />
      <WebhookPlaceholderField label="Tentativas" />
    </div>
    <div
      className={`flex w-fit items-center gap-2 ${dashboardPageLayoutTokens.cardActionSurface} px-3 py-2`}
    >
      <Skeleton className="h-5 w-10 rounded-full" />
      <span className="text-xs text-muted-foreground">Canal ativo</span>
    </div>
    <div className="space-y-3">
      {CHANNEL_EVENTS[channelKey].map((eventKey) => (
        <section
          key={`dashboard-webhooks-placeholder-${channelKey}-${eventKey}`}
          className={`${dashboardPageLayoutTokens.surfaceInset} rounded-xl px-3 py-4`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{EVENT_LABELS[eventKey]}</span>
            <Badge variant="outline">{eventKey}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Evento ativo</span>
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-2 md:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
          </div>
        </section>
      ))}
    </div>
  </div>
);

const DashboardWebhooks = () => {
  usePageMeta({ title: "Webhooks", noIndex: true });
  const navigate = useNavigate();
  const apiBase = getApiBase();
  const initialCacheRef = useRef(readWebhookSettingsCache());
  const { currentUser, isLoadingUser } = useDashboardCurrentUser<DashboardCurrentUser>({
    revalidateBootstrap: false,
  });
  const [isInitialLoading, setIsInitialLoading] = useState(!initialCacheRef.current);
  const [isRefreshing, setIsRefreshing] = useState(Boolean(initialCacheRef.current));
  const [loadError, setLoadError] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(initialCacheRef.current));
  const [projectTypes, setProjectTypes] = useState<string[]>(
    initialCacheRef.current?.projectTypes ?? DEFAULT_PROJECT_TYPES,
  );
  const [revision, setRevision] = useState(initialCacheRef.current?.revision ?? "");
  const [settings, setSettings] = useState<UnifiedWebhookSettings>(
    initialCacheRef.current?.settings ?? makeDefaultWebhookSettings(DEFAULT_PROJECT_TYPES),
  );
  const [savedSettings, setSavedSettings] = useState<UnifiedWebhookSettings>(
    initialCacheRef.current?.savedSettings ?? makeDefaultWebhookSettings(DEFAULT_PROJECT_TYPES),
  );
  const [sources, setSources] = useState<WebhookSettingsSources>(
    initialCacheRef.current?.sources ?? DEFAULT_WEBHOOK_SOURCES,
  );
  const [openSections, setOpenSections] = useState<string[]>([
    "types",
    "posts",
    "projects",
    "operational",
    "security",
    "deliveries",
  ]);
  const [savingBySection, setSavingBySection] = useState<Record<SaveSectionKey, boolean>>({
    types: false,
    posts: false,
    projects: false,
    operational: false,
    security: false,
  });
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [testingByEvent, setTestingByEvent] = useState<Record<EventKey, boolean>>({
    post_create: false,
    post_update: false,
    project_release: false,
    project_adjust: false,
  });
  const [isTestingOperational, setIsTestingOperational] = useState(false);
  const [isTestingSecurity, setIsTestingSecurity] = useState(false);
  const [templateClipboardDialog, setTemplateClipboardDialog] =
    useState<TemplateClipboardDialogState>(null);
  const [templateClipboardBusyKey, setTemplateClipboardBusyKey] = useState("");
  const [deliveryFilters, setDeliveryFilters] = useState<{
    scope: string;
    status: string;
    channel: string;
    page: number;
  }>({
    scope: "",
    status: "",
    channel: "",
    page: 1,
  });
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [deliveriesSummary, setDeliveriesSummary] =
    useState<WebhookDeliverySummary>(EMPTY_DELIVERY_SUMMARY);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState("");
  const loadRequestIdRef = useRef(0);
  const deliveryRequestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(hasLoadedOnce);
  const settingsRef = useRef(settings);
  const savedSettingsRef = useRef(savedSettings);
  const sourcesRef = useRef(sources);
  const revisionRef = useRef(revision);

  useEffect(() => {
    hasLoadedOnceRef.current = hasLoadedOnce;
  }, [hasLoadedOnce]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    savedSettingsRef.current = savedSettings;
  }, [savedSettings]);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  const canManageIntegrations = useMemo(
    () => resolveGrants(currentUser || null).integracoes === true,
    [currentUser],
  );

  const isSectionOpen = useCallback(
    (sectionKey: SaveSectionKey | ChannelKey) => openSections.includes(sectionKey),
    [openSections],
  );

  const loadSettings = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background ?? hasLoadedOnceRef.current;
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }
      setLoadError("");
      try {
        const response = await apiFetch(apiBase, "/api/integrations/webhooks", {
          auth: true,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("load_failed");
        }
        const payload = await response.json();
        if (loadRequestIdRef.current !== requestId) {
          return;
        }
        const remoteTypes = Array.isArray(payload?.projectTypes)
          ? payload.projectTypes.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : DEFAULT_PROJECT_TYPES;
        const nextSettings = asUnifiedSettings(payload?.settings, remoteTypes);
        const nextSources =
          payload?.sources && typeof payload.sources === "object"
            ? ({ ...DEFAULT_WEBHOOK_SOURCES, ...payload.sources } as WebhookSettingsSources)
            : DEFAULT_WEBHOOK_SOURCES;
        const currentSettings = settingsRef.current;
        const currentSavedSettings = savedSettingsRef.current;
        const shouldPreserveDrafts =
          background && settingsMatch(currentSettings, currentSavedSettings) === false;
        const nextDraftSettings = shouldPreserveDrafts ? currentSettings : nextSettings;
        setProjectTypes(remoteTypes);
        setRevision(String(payload?.revision || ""));
        setSavedSettings(nextSettings);
        setSettings(nextDraftSettings);
        setSources(nextSources);
        writeWebhookSettingsCache({
          projectTypes: remoteTypes,
          revision: String(payload?.revision || ""),
          settings: nextDraftSettings,
          savedSettings: nextSettings,
          sources: nextSources,
        });
        setHasLoadedOnce(true);
      } catch {
        if (loadRequestIdRef.current !== requestId) {
          return;
        }
        setLoadError("Não foi possível atualizar os Webhooks.");
      } finally {
        if (loadRequestIdRef.current !== requestId) {
          return;
        }
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [apiBase],
  );

  const loadDeliveries = useCallback(
    async (options?: { page?: number }) => {
      const nextPage = options?.page ?? deliveryFilters.page;
      const requestId = deliveryRequestIdRef.current + 1;
      deliveryRequestIdRef.current = requestId;
      setIsLoadingDeliveries(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "25",
        });
        if (deliveryFilters.scope) {
          params.set("scope", deliveryFilters.scope);
        }
        if (deliveryFilters.status) {
          params.set("status", deliveryFilters.status);
        }
        if (deliveryFilters.channel) {
          params.set("channel", deliveryFilters.channel);
        }
        const response = await apiFetch(
          apiBase,
          `/api/integrations/webhooks/deliveries?${params.toString()}`,
          {
            auth: true,
            cache: "no-store",
          },
        );
        if (!response.ok) {
          throw new Error("deliveries_load_failed");
        }
        const payload = await response.json();
        if (deliveryRequestIdRef.current !== requestId) {
          return;
        }
        setDeliveries(asWebhookDeliveryItems(payload?.items));
        setDeliveriesSummary(asWebhookDeliverySummary(payload?.summary));
        setDeliveriesTotal(Number(payload?.total || 0));
      } catch {
        if (deliveryRequestIdRef.current !== requestId) {
          return;
        }
        toast({
          title: "Falha ao carregar entregas",
          description: "Não foi possível atualizar o histórico de webhooks.",
          variant: "destructive",
        });
      } finally {
        if (deliveryRequestIdRef.current !== requestId) {
          return;
        }
        setIsLoadingDeliveries(false);
      }
    },
    [
      apiBase,
      deliveryFilters.channel,
      deliveryFilters.page,
      deliveryFilters.scope,
      deliveryFilters.status,
    ],
  );

  useEffect(() => {
    void loadSettings({ background: Boolean(initialCacheRef.current) });
  }, [loadSettings]);

  useEffect(() => {
    void loadDeliveries({ page: deliveryFilters.page });
  }, [deliveryFilters.page, loadDeliveries]);

  const patchChannel = useCallback(
    (
      channelKey: ChannelKey,
      updater: (
        value: EditorialSettings["channels"][ChannelKey],
      ) => EditorialSettings["channels"][ChannelKey],
    ) => {
      setSettings((previous) => ({
        ...previous,
        editorial: {
          ...previous.editorial,
          channels: {
            ...previous.editorial.channels,
            [channelKey]: updater(previous.editorial.channels[channelKey]),
          },
        },
      }));
    },
    [],
  );

  const setTemplate = useCallback(
    (channelKey: ChannelKey, eventKey: EventKey, updater: (value: Template) => Template) => {
      patchChannel(
        channelKey,
        (channel) =>
          ({
            ...channel,
            templates: {
              ...channel.templates,
              [eventKey]: updater((channel.templates as Record<string, Template>)[eventKey]),
            },
          }) as EditorialSettings["channels"][ChannelKey],
      );
    },
    [patchChannel],
  );

  const setEmbedValue = useCallback(
    (
      channelKey: ChannelKey,
      eventKey: EventKey,
      key: keyof Omit<TemplateEmbed, "fields">,
      value: string,
    ) => {
      setTemplate(channelKey, eventKey, (template) => ({
        ...template,
        embed: {
          ...template.embed,
          [key]: value,
        },
      }));
    },
    [setTemplate],
  );

  const validateSection = useCallback(
    (sectionKey: SaveSectionKey, value: UnifiedWebhookSettings) => {
      const errors: string[] = [];
      if (sectionKey === "types") {
        if (
          value.editorial.generalReleaseRoleId &&
          !ROLE_ID_PATTERN.test(value.editorial.generalReleaseRoleId)
        ) {
          errors.push("Role geral inválida.");
        }
        value.editorial.typeRoles.forEach((item) => {
          if (item.roleId && !ROLE_ID_PATTERN.test(item.roleId)) {
            errors.push(`ID de cargo inválido em ${item.type}.`);
          }
        });
        return errors;
      }

      if (sectionKey === "operational") {
        if (value.operational.enabled && !String(value.operational.webhookUrl || "").trim()) {
          errors.push("Webhook URL obrigatória em Alertas operacionais.");
        }
        if (!isValidWebhookUrl(value.operational.webhookUrl || "")) {
          errors.push("Webhook URL inválida em Alertas operacionais.");
        }
        return errors;
      }

      if (sectionKey === "security") {
        if (value.security.enabled && !String(value.security.webhookUrl || "").trim()) {
          errors.push("Webhook URL obrigatória em Segurança.");
        }
        if (!isValidWebhookUrl(value.security.webhookUrl || "")) {
          errors.push("Webhook URL inválida em Segurança.");
        }
        return errors;
      }

      const channelKey = sectionKey as ChannelKey;
      const channel = value.editorial.channels[channelKey];
      const channelLabel = CHANNEL_LABELS[channelKey];
      if (channel.enabled && !String(channel.webhookUrl || "").trim()) {
        errors.push(`Webhook URL obrigatória em ${channelLabel}.`);
      }
      if (!isValidWebhookUrl(channel.webhookUrl || "")) {
        errors.push(`Webhook URL inválida em ${channelLabel}.`);
      }
      return errors;
    },
    [],
  );

  const buildSettingsPayloadForSection = useCallback(
    (
      sectionKey: SaveSectionKey,
      draftSettings: UnifiedWebhookSettings,
      savedBase: UnifiedWebhookSettings,
    ) => {
      const next = cloneWebhookSettings(savedBase);
      if (sectionKey === "types") {
        next.editorial.generalReleaseRoleId = draftSettings.editorial.generalReleaseRoleId;
        next.editorial.typeRoles = cloneSettings(draftSettings.editorial).typeRoles;
        return next;
      }
      if (sectionKey === "operational") {
        next.operational = { ...draftSettings.operational };
        return next;
      }
      if (sectionKey === "security") {
        next.security = { ...draftSettings.security };
        return next;
      }
      if (sectionKey === "posts") {
        next.editorial.channels.posts = cloneSettings(draftSettings.editorial).channels.posts;
        return next;
      }
      next.editorial.channels.projects = cloneSettings(draftSettings.editorial).channels.projects;
      return next;
    },
    [],
  );

  const mergeServerWithUnsavedDrafts = useCallback(
    (
      sectionKey: SaveSectionKey,
      serverSettings: UnifiedWebhookSettings,
      draftBeforeSave: UnifiedWebhookSettings,
    ) => {
      const next = cloneWebhookSettings(serverSettings);
      if (sectionKey !== "types") {
        next.editorial.generalReleaseRoleId = draftBeforeSave.editorial.generalReleaseRoleId;
        next.editorial.typeRoles = cloneSettings(draftBeforeSave.editorial).typeRoles;
      }
      if (sectionKey !== "posts") {
        next.editorial.channels.posts = cloneSettings(draftBeforeSave.editorial).channels.posts;
      }
      if (sectionKey !== "projects") {
        next.editorial.channels.projects = cloneSettings(
          draftBeforeSave.editorial,
        ).channels.projects;
      }
      if (sectionKey !== "operational") {
        next.operational = { ...draftBeforeSave.operational };
      }
      if (sectionKey !== "security") {
        next.security = { ...draftBeforeSave.security };
      }
      return next;
    },
    [],
  );

  const handleSaveSection = useCallback(
    async (sectionKey: SaveSectionKey) => {
      const errors = validateSection(sectionKey, settings);
      if (errors.length > 0) {
        toast({
          title: "Configuração inválida",
          description: errors[0],
          variant: "destructive",
        });
        return;
      }

      const draftBeforeSave = cloneWebhookSettings(settings);
      const payloadSettings = buildSettingsPayloadForSection(
        sectionKey,
        draftBeforeSave,
        savedSettings,
      );

      setSavingBySection((previous) => ({ ...previous, [sectionKey]: true }));
      try {
        const response = await apiFetch(apiBase, "/api/integrations/webhooks", {
          method: "PUT",
          auth: true,
          json: {
            settings: payloadSettings,
            ifRevision: revisionRef.current,
          },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (payload?.error === "edit_conflict") {
            const remoteTypes = Array.isArray(payload?.projectTypes)
              ? payload.projectTypes
                  .map((item: unknown) => String(item || "").trim())
                  .filter(Boolean)
              : projectTypes;
            const serverSettings = asUnifiedSettings(payload?.settings, remoteTypes);
            const preservedDraft = asUnifiedSettings(draftBeforeSave, remoteTypes);
            const nextSources =
              payload?.sources && typeof payload.sources === "object"
                ? ({ ...DEFAULT_WEBHOOK_SOURCES, ...payload.sources } as WebhookSettingsSources)
                : sourcesRef.current;
            const nextRevision = String(payload?.currentRevision || revisionRef.current || "");
            setProjectTypes(remoteTypes);
            setRevision(nextRevision);
            setSavedSettings(serverSettings);
            setSettings(preservedDraft);
            setSources(nextSources);
            writeWebhookSettingsCache({
              projectTypes: remoteTypes,
              revision: nextRevision,
              settings: preservedDraft,
              savedSettings: serverSettings,
              sources: nextSources,
            });
            toast({
              title: "Configuração desatualizada",
              description:
                "Outro admin alterou os webhooks. Seu rascunho foi preservado para revisar e salvar novamente.",
              variant: "destructive",
            });
            return;
          }
          if (payload?.error === "invalid_webhook_url") {
            toast({
              title: "Webhook URL inválida",
              description: describeInvalidWebhookChannels(payload?.channels),
              variant: "destructive",
            });
            return;
          }
          if (payload?.error === "invalid_placeholders" && Array.isArray(payload?.placeholders)) {
            const first = payload.placeholders[0];
            toast({
              title: "Placeholder inválido",
              description: first
                ? `${first.placeholder} em ${first.eventKey} (${first.templatePath})`
                : "Revise os placeholders configurados.",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Falha ao salvar",
            description: payload?.error || "Não foi possível atualizar os webhooks.",
            variant: "destructive",
          });
          return;
        }

        const remoteTypes = Array.isArray(payload?.projectTypes)
          ? payload.projectTypes.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : projectTypes;
        const serverSettings = asUnifiedSettings(payload?.settings, remoteTypes);
        const nextSources =
          payload?.sources && typeof payload.sources === "object"
            ? ({ ...DEFAULT_WEBHOOK_SOURCES, ...payload.sources } as WebhookSettingsSources)
            : DEFAULT_WEBHOOK_SOURCES;
        const nextRevision = String(payload?.revision || revisionRef.current || "");
        const nextDraft = mergeServerWithUnsavedDrafts(sectionKey, serverSettings, draftBeforeSave);

        setProjectTypes(remoteTypes);
        setRevision(nextRevision);
        setSavedSettings(serverSettings);
        setSettings(nextDraft);
        setSources(nextSources);
        writeWebhookSettingsCache({
          projectTypes: remoteTypes,
          revision: nextRevision,
          settings: nextDraft,
          savedSettings: serverSettings,
          sources: nextSources,
        });
        const sectionSuccessDescription =
          sectionKey === "types"
            ? "Tipos e menções atualizados com sucesso."
            : sectionKey === "posts"
              ? "Configurações de posts atualizadas com sucesso."
              : sectionKey === "projects"
                ? "Configurações de projetos atualizadas com sucesso."
                : sectionKey === "operational"
                  ? "Alertas operacionais atualizados com sucesso."
                  : "Configurações de segurança atualizadas com sucesso.";
        toast({
          title: "Seção salva",
          description: sectionSuccessDescription,
          intent: "success",
        });
      } finally {
        setSavingBySection((previous) => ({ ...previous, [sectionKey]: false }));
      }
    },
    [
      apiBase,
      buildSettingsPayloadForSection,
      mergeServerWithUnsavedDrafts,
      projectTypes,
      savedSettings,
      settings,
      validateSection,
    ],
  );

  const handleSaveAll = useCallback(async () => {
    const errors = [
      ...validateSection("types", settings),
      ...validateSection("posts", settings),
      ...validateSection("projects", settings),
      ...validateSection("operational", settings),
      ...validateSection("security", settings),
    ];
    if (errors.length > 0) {
      toast({
        title: "Configuração inválida",
        description: errors[0],
        variant: "destructive",
      });
      return;
    }

    setIsSavingAll(true);
    try {
      const response = await apiFetch(apiBase, "/api/integrations/webhooks", {
        method: "PUT",
        auth: true,
        json: {
          settings,
          ifRevision: revisionRef.current,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (payload?.error === "edit_conflict") {
          const remoteTypes = Array.isArray(payload?.projectTypes)
            ? payload.projectTypes.map((item: unknown) => String(item || "").trim()).filter(Boolean)
            : projectTypes;
          const serverSettings = asUnifiedSettings(payload?.settings, remoteTypes);
          const preservedDraft = asUnifiedSettings(settings, remoteTypes);
          const nextSources =
            payload?.sources && typeof payload.sources === "object"
              ? ({ ...DEFAULT_WEBHOOK_SOURCES, ...payload.sources } as WebhookSettingsSources)
              : sourcesRef.current;
          const nextRevision = String(payload?.currentRevision || revisionRef.current || "");
          setProjectTypes(remoteTypes);
          setRevision(nextRevision);
          setSavedSettings(serverSettings);
          setSettings(preservedDraft);
          setSources(nextSources);
          writeWebhookSettingsCache({
            projectTypes: remoteTypes,
            revision: nextRevision,
            settings: preservedDraft,
            savedSettings: serverSettings,
            sources: nextSources,
          });
          toast({
            title: "Configuração desatualizada",
            description:
              "Outro admin alterou os webhooks. Seu rascunho foi preservado para revisar e salvar novamente.",
            variant: "destructive",
          });
          return;
        }
        if (payload?.error === "invalid_webhook_url") {
          toast({
            title: "Webhook URL inválida",
            description: describeInvalidWebhookChannels(payload?.channels),
            variant: "destructive",
          });
          return;
        }
        if (payload?.error === "invalid_placeholders" && Array.isArray(payload?.placeholders)) {
          const first = payload.placeholders[0];
          toast({
            title: "Placeholder inválido",
            description: first
              ? `${first.placeholder} em ${first.eventKey} (${first.templatePath})`
              : "Revise os placeholders configurados.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Falha ao salvar",
          description: payload?.error || "Não foi possível atualizar os webhooks.",
          variant: "destructive",
        });
        return;
      }

      const remoteTypes = Array.isArray(payload?.projectTypes)
        ? payload.projectTypes.map((item: unknown) => String(item || "").trim()).filter(Boolean)
        : projectTypes;
      const serverSettings = asUnifiedSettings(payload?.settings, remoteTypes);
      const nextSources =
        payload?.sources && typeof payload.sources === "object"
          ? ({ ...DEFAULT_WEBHOOK_SOURCES, ...payload.sources } as WebhookSettingsSources)
          : DEFAULT_WEBHOOK_SOURCES;
      const nextRevision = String(payload?.revision || revisionRef.current || "");
      setProjectTypes(remoteTypes);
      setRevision(nextRevision);
      setSavedSettings(serverSettings);
      setSettings(serverSettings);
      setSources(nextSources);
      writeWebhookSettingsCache({
        projectTypes: remoteTypes,
        revision: nextRevision,
        settings: serverSettings,
        savedSettings: serverSettings,
        sources: nextSources,
      });
      toast({
        title: "Configurações salvas",
        description: "Webhooks atualizados com sucesso.",
        intent: "success",
      });
    } finally {
      setIsSavingAll(false);
    }
  }, [apiBase, projectTypes, settings, validateSection]);

  const applyTemplatePackage = useCallback(
    (channelKey: ChannelKey, eventKey: EventKey, rawValue: string) => {
      try {
        const parsed = parseEditorialTemplatePackage(rawValue, eventKey);
        setTemplate(channelKey, eventKey, () => parsed.template);
        const isDifferentEvent = parsed.channelKey !== channelKey || parsed.eventKey !== eventKey;
        toast({
          title: isDifferentEvent ? "Template colado com aviso" : "Template colado",
          description: isDifferentEvent
            ? "Template colado de outro evento; revise os placeholders antes de salvar."
            : "Template aplicado ao rascunho do evento.",
          intent: isDifferentEvent ? "warning" : "success",
        });
        return true;
      } catch {
        toast({
          title: "Template inválido",
          description: "Cole um JSON de template editorial válido.",
          variant: "destructive",
        });
        return false;
      }
    },
    [setTemplate],
  );

  const handleCopyTemplate = useCallback(
    async (channelKey: ChannelKey, eventKey: EventKey, template: Template) => {
      const clipboardKey = `${channelKey}:${eventKey}`;
      const serialized = JSON.stringify(
        buildEditorialTemplatePackage(channelKey, eventKey, template),
        null,
        2,
      );
      setTemplateClipboardBusyKey(clipboardKey);
      try {
        await navigator.clipboard.writeText(serialized);
        toast({
          title: "Template copiado",
          description: "JSON do template copiado para a área de transferência.",
          intent: "success",
        });
      } catch {
        setTemplateClipboardDialog({
          mode: "copy",
          channelKey,
          eventKey,
          value: serialized,
        });
      } finally {
        setTemplateClipboardBusyKey("");
      }
    },
    [],
  );

  const handlePasteTemplate = useCallback(
    async (channelKey: ChannelKey, eventKey: EventKey) => {
      const clipboardKey = `${channelKey}:${eventKey}`;
      setTemplateClipboardBusyKey(clipboardKey);
      try {
        const rawValue = await navigator.clipboard.readText();
        applyTemplatePackage(channelKey, eventKey, rawValue);
      } catch {
        setTemplateClipboardDialog({
          mode: "paste",
          channelKey,
          eventKey,
          value: "",
        });
      } finally {
        setTemplateClipboardBusyKey("");
      }
    },
    [applyTemplatePackage],
  );

  const handleTest = useCallback(
    async (eventKey: EventKey) => {
      setTestingByEvent((previous) => ({ ...previous, [eventKey]: true }));
      try {
        const response = await apiFetch(apiBase, "/api/integrations/webhooks/editorial/test", {
          method: "POST",
          auth: true,
          json: { eventKey, settings: settingsRef.current },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          if (payload?.error === "invalid_webhook_url") {
            toast({
              title: "Webhook URL inválida",
              description: describeInvalidWebhookChannels(payload?.channels),
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Teste falhou",
            description:
              payload?.errorDetail || payload?.error || payload?.code || "Falha ao enviar teste.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Teste enviado",
          description: `${EVENT_LABELS[eventKey]} enviado com sucesso.`,
          intent: "success",
        });
      } finally {
        setTestingByEvent((previous) => ({ ...previous, [eventKey]: false }));
      }
    },
    [apiBase],
  );

  const handleOperationalTest = useCallback(async () => {
    setIsTestingOperational(true);
    try {
      const response = await apiFetch(apiBase, "/api/integrations/webhooks/operational/test", {
        method: "POST",
        auth: true,
        json: { settings: settingsRef.current },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        if (payload?.error === "invalid_webhook_url") {
          toast({
            title: "Webhook URL inválida",
            description: describeInvalidWebhookChannels(payload?.channels),
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Teste falhou",
          description:
            payload?.errorDetail || payload?.error || payload?.code || "Falha ao enviar teste.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Teste enviado",
        description: "Alerta operacional enviado com sucesso.",
        intent: "success",
      });
    } finally {
      setIsTestingOperational(false);
    }
  }, [apiBase]);

  const handleSecurityTest = useCallback(async () => {
    setIsTestingSecurity(true);
    try {
      const response = await apiFetch(apiBase, "/api/integrations/webhooks/security/test", {
        method: "POST",
        auth: true,
        json: { settings: settingsRef.current },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        if (payload?.error === "invalid_webhook_url") {
          toast({
            title: "Webhook URL inválida",
            description: describeInvalidWebhookChannels(payload?.channels),
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Teste falhou",
          description:
            payload?.errorDetail || payload?.error || payload?.code || "Falha ao enviar teste.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Teste enviado",
        description: "Alerta de segurança enviado com sucesso.",
        intent: "success",
      });
    } finally {
      setIsTestingSecurity(false);
    }
  }, [apiBase]);

  const handleRetryDelivery = useCallback(
    async (deliveryId: string) => {
      setRetryingDeliveryId(deliveryId);
      try {
        const response = await apiFetch(
          apiBase,
          `/api/integrations/webhooks/deliveries/${deliveryId}/retry`,
          {
            method: "POST",
            auth: true,
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          toast({
            title: "Falha ao reenfileirar",
            description: payload?.error || "Não foi possível criar uma nova tentativa.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Entrega reenfileirada",
          description: "Uma nova tentativa foi adicionada a fila de webhooks.",
          intent: "success",
        });
        await loadDeliveries({ page: deliveryFilters.page });
      } finally {
        setRetryingDeliveryId("");
      }
    },
    [apiBase, deliveryFilters.page, loadDeliveries],
  );

  const hasBlockingLoadError = !hasLoadedOnce && Boolean(loadError);
  const showStableShell = isInitialLoading && !hasLoadedOnce;
  const deliveryTotalPages = Math.max(1, Math.ceil(deliveriesTotal / 25));
  const editorialSettings = settings.editorial;

  useDashboardRefreshToast({
    active: isRefreshing && hasLoadedOnce,
    title: "Atualizando Webhooks",
    description: "Buscando a configuração mais recente dos Webhooks.",
  });

  if (!isLoadingUser && !canManageIntegrations) {
    return (
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
        onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
      >
        <DashboardPageContainer reveal={false}>
          <AsyncState
            kind="error"
            title="Acesso negado"
            description="Sua conta não tem permissão para gerenciar integrações."
            action={
              <DashboardActionButton onClick={() => navigate("/dashboard")}>
                Voltar
              </DashboardActionButton>
            }
          />
        </DashboardPageContainer>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      currentUser={currentUser}
      isLoadingUser={isLoadingUser}
      onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
    >
      <DashboardPageContainer maxWidth="7xl" reveal={false}>
        <DashboardPageHeader
          badge="Integrações"
          title="Webhooks"
          description="Configure webhooks editoriais, alertas operacionais e segurança em um só lugar."
          actions={
            <DashboardActionButton
              type="button"
              size="toolbar"
              onClick={() => void handleSaveAll()}
              disabled={isSavingAll || showStableShell || hasBlockingLoadError}
            >
              <Save className="h-4 w-4" />
              {isSavingAll ? "Salvando..." : "Salvar"}
            </DashboardActionButton>
          }
        />
        {loadError && !hasBlockingLoadError ? (
          <Alert className="mb-4 border-border/70 bg-background text-foreground/70">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Mantendo os últimos dados carregados.</span>
              <DashboardActionButton
                size="sm"
                onClick={() => void loadSettings({ background: true })}
              >
                Tentar novamente
              </DashboardActionButton>
            </AlertDescription>
          </Alert>
        ) : null}
        {hasBlockingLoadError ? (
          <AsyncState
            kind="error"
            title="Falha ao carregar"
            description="Não foi possível buscar os Webhooks."
            action={
              <DashboardActionButton onClick={() => void loadSettings({ background: false })}>
                Tentar novamente
              </DashboardActionButton>
            }
          />
        ) : (
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={(value) => setOpenSections(Array.isArray(value) ? value : [])}
            className="space-y-4"
          >
            <AccordionItem
              value="types"
              className={`${dashboardPageLayoutTokens.surfaceSolid} rounded-xl px-4 animate-slide-up`}
              style={dashboardAnimationDelay(SECTION_REVEAL_DELAYS.types)}
              data-testid="dashboard-webhooks-section-types"
            >
              <div className="relative">
                <AccordionTrigger className="hover:no-underline">Tipos e menções</AccordionTrigger>
                {isSectionOpen("types") ? (
                  <DashboardActionButton
                    type="button"
                    size="sm"
                    className="absolute right-10 top-1/2 -translate-y-1/2"
                    aria-label="Salvar tipos e menções"
                    onClick={() => void handleSaveSection("types")}
                    disabled={savingBySection.types || showStableShell}
                  >
                    <Save className="h-4 w-4" />
                    {savingBySection.types ? "Salvando..." : "Salvar"}
                  </DashboardActionButton>
                ) : null}
              </div>
              <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                {showStableShell ? (
                  <WebhookTypesPlaceholder />
                ) : (
                  <div className="space-y-4" data-testid="dashboard-webhooks-section-content-types">
                    <DashboardFieldStack data-testid="dashboard-webhooks-general-role-field">
                      <Label>Role geral de lançamentos (ID)</Label>
                      <Input
                        value={editorialSettings.generalReleaseRoleId}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            editorial: {
                              ...previous.editorial,
                              generalReleaseRoleId: event.target.value.replace(/\D/g, ""),
                            },
                          }))
                        }
                        placeholder="Opcional: usada em project_release"
                      />
                    </DashboardFieldStack>

                    <div className="space-y-3">
                      {editorialSettings.typeRoles.map((typeRole, index) => (
                        <div
                          key={`${typeRole.type}-${index}`}
                          className={`grid gap-3 ${dashboardPageLayoutTokens.surfaceInset} rounded-xl p-3 md:grid-cols-[1fr_280px]`}
                        >
                          <div>
                            <p className="text-sm font-medium">{typeRole.type}</p>
                            <p className="text-xs text-muted-foreground">
                              ID do cargo do Discord para este tipo.
                            </p>
                          </div>
                          <Input
                            value={typeRole.roleId}
                            onChange={(event) =>
                              setSettings((previous) => ({
                                ...previous,
                                editorial: {
                                  ...previous.editorial,
                                  typeRoles: previous.editorial.typeRoles.map((item, itemIndex) =>
                                    itemIndex !== index
                                      ? item
                                      : {
                                          ...item,
                                          roleId: event.target.value.replace(/\D/g, ""),
                                        },
                                  ),
                                },
                              }))
                            }
                            placeholder="ID do cargo do Discord"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {(Object.keys(CHANNEL_EVENTS) as ChannelKey[]).map((channelKey) => {
              const channel = editorialSettings.channels[channelKey];
              const sectionKey = channelKey as Extract<SaveSectionKey, ChannelKey>;
              return (
                <AccordionItem
                  key={channelKey}
                  value={channelKey}
                  className={`${dashboardPageLayoutTokens.surfaceSolid} rounded-xl px-4 animate-slide-up`}
                  style={dashboardAnimationDelay(SECTION_REVEAL_DELAYS[sectionKey])}
                  data-testid={`dashboard-webhooks-section-${sectionKey}`}
                >
                  <div className="relative">
                    <AccordionTrigger className="hover:no-underline">
                      {CHANNEL_LABELS[channelKey]}
                    </AccordionTrigger>
                    {isSectionOpen(sectionKey) ? (
                      <DashboardActionButton
                        type="button"
                        size="sm"
                        className="absolute right-10 top-1/2 -translate-y-1/2"
                        aria-label={sectionKey === "posts" ? "Salvar posts" : "Salvar projetos"}
                        onClick={() => void handleSaveSection(sectionKey)}
                        disabled={savingBySection[sectionKey] || showStableShell}
                      >
                        <Save className="h-4 w-4" />
                        {savingBySection[sectionKey] ? "Salvando..." : "Salvar"}
                      </DashboardActionButton>
                    ) : null}
                  </div>
                  <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                    {showStableShell ? (
                      <WebhookChannelPlaceholder
                        channelKey={channelKey}
                        testId={`dashboard-webhooks-placeholder-${sectionKey}`}
                      />
                    ) : (
                      <div
                        className="space-y-4"
                        data-testid={`dashboard-webhooks-section-content-${sectionKey}`}
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <DashboardFieldStack className="md:col-span-2">
                            <Label>Webhook URL</Label>
                            <Input
                              value={channel.webhookUrl}
                              onChange={(event) =>
                                patchChannel(channelKey, (item) => ({
                                  ...item,
                                  webhookUrl: event.target.value,
                                }))
                              }
                              placeholder="https://discord.com/api/webhooks/..."
                            />
                          </DashboardFieldStack>
                          <DashboardFieldStack>
                            <Label>Timeout (ms)</Label>
                            <Input
                              type="number"
                              min={1000}
                              max={30000}
                              value={channel.timeoutMs}
                              onChange={(event) =>
                                patchChannel(channelKey, (item) => ({
                                  ...item,
                                  timeoutMs: Number(event.target.value || 5000),
                                }))
                              }
                            />
                          </DashboardFieldStack>
                          <DashboardFieldStack>
                            <Label>Tentativas</Label>
                            <Input
                              type="number"
                              min={0}
                              max={5}
                              value={channel.retries}
                              onChange={(event) =>
                                patchChannel(channelKey, (item) => ({
                                  ...item,
                                  retries: Number(event.target.value || 0),
                                }))
                              }
                            />
                          </DashboardFieldStack>
                        </div>

                        <div
                          className={`flex w-fit items-center gap-2 ${dashboardPageLayoutTokens.cardActionSurface} px-3 py-2`}
                        >
                          <Switch
                            checked={channel.enabled}
                            onCheckedChange={(checked) =>
                              patchChannel(channelKey, (item) => ({
                                ...item,
                                enabled: checked,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">Canal ativo</span>
                        </div>

                        <Accordion type="multiple" className="space-y-3">
                          {CHANNEL_EVENTS[channelKey].map((eventKey) => {
                            const template = channel.templates[eventKey];
                            const displayEmbedColor = normalizeHexColor(
                              template.embed.color,
                              DEFAULT_EVENT_COLORS[eventKey],
                            );
                            return (
                              <AccordionItem
                                key={eventKey}
                                value={`${channelKey}-${eventKey}`}
                                className={`${dashboardPageLayoutTokens.surfaceInset} rounded-xl px-3`}
                                data-testid={`dashboard-webhooks-event-${channelKey}-${eventKey}`}
                              >
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">
                                      {EVENT_LABELS[eventKey]}
                                    </span>
                                    <Badge variant="outline">{eventKey}</Badge>
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                                  <div
                                    className="space-y-4"
                                    data-testid={`dashboard-webhooks-event-content-${channelKey}-${eventKey}`}
                                  >
                                    <div
                                      className={`flex flex-col gap-3 rounded-xl px-3 py-3 md:flex-row md:items-center md:justify-between ${dashboardPageLayoutTokens.cardActionSurface}`}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">Evento ativo</span>
                                        <Switch
                                          checked={Boolean(channel.events[eventKey])}
                                          onCheckedChange={(checked) =>
                                            patchChannel(
                                              channelKey,
                                              (item) =>
                                                ({
                                                  ...item,
                                                  events: {
                                                    ...item.events,
                                                    [eventKey]: checked,
                                                  },
                                                }) as EditorialSettings["channels"][ChannelKey],
                                            )
                                          }
                                        />
                                        <Badge variant="outline" className="font-mono text-[11px]">
                                          {eventKey}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <DashboardActionButton
                                          type="button"
                                          size="sm"
                                          disabled={
                                            templateClipboardBusyKey === `${channelKey}:${eventKey}`
                                          }
                                          onClick={() =>
                                            void handleCopyTemplate(channelKey, eventKey, template)
                                          }
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                          Copiar template
                                        </DashboardActionButton>
                                        <DashboardActionButton
                                          type="button"
                                          size="sm"
                                          disabled={
                                            templateClipboardBusyKey === `${channelKey}:${eventKey}`
                                          }
                                          onClick={() =>
                                            void handlePasteTemplate(channelKey, eventKey)
                                          }
                                        >
                                          <ClipboardPaste className="h-3.5 w-3.5" />
                                          Colar template
                                        </DashboardActionButton>
                                        <DashboardActionButton
                                          type="button"
                                          size="sm"
                                          disabled={testingByEvent[eventKey]}
                                          onClick={() => void handleTest(eventKey)}
                                        >
                                          <Send className="h-3.5 w-3.5" />
                                          {testingByEvent[eventKey]
                                            ? "Enviando..."
                                            : "Enviar teste"}
                                        </DashboardActionButton>
                                      </div>
                                    </div>

                                    <DashboardFieldStack>
                                      <Label>Conteúdo da mensagem</Label>
                                      <Textarea
                                        value={template.content}
                                        onChange={(event) =>
                                          setTemplate(channelKey, eventKey, (item) => ({
                                            ...item,
                                            content: event.target.value,
                                          }))
                                        }
                                        placeholder="{{mencao.todos}}"
                                      />
                                    </DashboardFieldStack>

                                    <div className="space-y-2">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        Autor e miniatura
                                      </h4>
                                      <div className="grid gap-2 md:grid-cols-3">
                                        <DashboardFieldStack>
                                          <Label>URL do ícone do autor</Label>
                                          <Input
                                            value={template.embed.authorIconUrl}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "authorIconUrl",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label>Nome do autor</Label>
                                          <Input
                                            value={template.embed.authorName}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "authorName",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label>URL da miniatura</Label>
                                          <Input
                                            value={template.embed.thumbnailUrl}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "thumbnailUrl",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack className="md:col-span-2">
                                          <Label>URL do autor</Label>
                                          <Input
                                            value={template.embed.authorUrl}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "authorUrl",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        Título e URL da embed
                                      </h4>
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <DashboardFieldStack>
                                          <Label>Título</Label>
                                          <Input
                                            value={template.embed.title}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "title",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label>URL da embed</Label>
                                          <Input
                                            value={template.embed.url}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "url",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                      </div>
                                    </div>

                                    <DashboardFieldStack>
                                      <Label>Descrição</Label>
                                      <Textarea
                                        value={template.embed.description}
                                        onChange={(event) =>
                                          setEmbedValue(
                                            channelKey,
                                            eventKey,
                                            "description",
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </DashboardFieldStack>

                                    <DashboardFieldStack>
                                      <div className="flex items-center justify-between">
                                        <Label>Campos da embed</Label>
                                        <DashboardActionButton
                                          type="button"
                                          size="sm"
                                          onClick={() =>
                                            setTemplate(channelKey, eventKey, (item) => ({
                                              ...item,
                                              embed: {
                                                ...item.embed,
                                                fields: [
                                                  ...item.embed.fields,
                                                  { name: "", value: "", inline: false },
                                                ],
                                              },
                                            }))
                                          }
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                          Adicionar campo
                                        </DashboardActionButton>
                                      </div>

                                      {template.embed.fields.map((field, index) => (
                                        <div
                                          key={`${eventKey}-field-${index}`}
                                          className="grid gap-2 rounded-lg border border-border/50 p-2 md:grid-cols-[1fr_1fr_auto_auto]"
                                        >
                                          <Input
                                            value={field.name}
                                            onChange={(event) =>
                                              setTemplate(channelKey, eventKey, (item) => {
                                                const fields = [...item.embed.fields];
                                                fields[index] = {
                                                  ...fields[index],
                                                  name: event.target.value,
                                                };
                                                return {
                                                  ...item,
                                                  embed: { ...item.embed, fields },
                                                };
                                              })
                                            }
                                            placeholder="Nome"
                                          />
                                          <Input
                                            value={field.value}
                                            onChange={(event) =>
                                              setTemplate(channelKey, eventKey, (item) => {
                                                const fields = [...item.embed.fields];
                                                fields[index] = {
                                                  ...fields[index],
                                                  value: event.target.value,
                                                };
                                                return {
                                                  ...item,
                                                  embed: { ...item.embed, fields },
                                                };
                                              })
                                            }
                                            placeholder="Valor"
                                          />
                                          <div className="flex items-center gap-2 rounded-md border border-border/50 px-2">
                                            <Switch
                                              checked={field.inline}
                                              onCheckedChange={(checked) =>
                                                setTemplate(channelKey, eventKey, (item) => {
                                                  const fields = [...item.embed.fields];
                                                  fields[index] = {
                                                    ...fields[index],
                                                    inline: checked,
                                                  };
                                                  return {
                                                    ...item,
                                                    embed: { ...item.embed, fields },
                                                  };
                                                })
                                              }
                                            />
                                            <span className="text-xs text-muted-foreground">
                                              Em linha
                                            </span>
                                          </div>
                                          <DashboardActionButton
                                            type="button"
                                            tone="destructive"
                                            size="icon-sm"
                                            onClick={() =>
                                              setTemplate(channelKey, eventKey, (item) => ({
                                                ...item,
                                                embed: {
                                                  ...item.embed,
                                                  fields: item.embed.fields.filter(
                                                    (_, itemIndex) => itemIndex !== index,
                                                  ),
                                                },
                                              }))
                                            }
                                            aria-label={`Remover campo ${index + 1}`}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </DashboardActionButton>
                                        </div>
                                      ))}
                                    </DashboardFieldStack>

                                    <DashboardFieldStack>
                                      <Label>URL da imagem</Label>
                                      <Input
                                        value={template.embed.imageUrl}
                                        onChange={(event) =>
                                          setEmbedValue(
                                            channelKey,
                                            eventKey,
                                            "imageUrl",
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </DashboardFieldStack>

                                    <div className="space-y-2">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        Rodapé
                                      </h4>
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <DashboardFieldStack>
                                          <Label>URL do ícone do rodapé</Label>
                                          <Input
                                            value={template.embed.footerIconUrl}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "footerIconUrl",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label>Texto do rodapé</Label>
                                          <Input
                                            value={template.embed.footerText}
                                            onChange={(event) =>
                                              setEmbedValue(
                                                channelKey,
                                                eventKey,
                                                "footerText",
                                                event.target.value,
                                              )
                                            }
                                          />
                                        </DashboardFieldStack>
                                      </div>
                                    </div>

                                    <DashboardFieldStack className="md:max-w-xs">
                                      <Label>Cor da embed (#RRGGBB)</Label>
                                      <div className="flex items-center gap-3">
                                        <ColorPicker
                                          aria-label="Selecionar cor da embed"
                                          label=""
                                          showSwatch
                                          buttonClassName={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background transition ${dashboardStrongSurfaceHoverClassName} focus-visible:outline-hidden ${dashboardStrongFocusFieldClassName} ${dashboardStrongFocusTriggerClassName}`}
                                          panelClassName={dashboardStrongFocusScopeClassName}
                                          value={displayEmbedColor}
                                          onChange={(color) =>
                                            setEmbedValue(
                                              channelKey,
                                              eventKey,
                                              "color",
                                              color.toString("hex"),
                                            )
                                          }
                                        />
                                        <p
                                          className="text-xs font-medium text-muted-foreground"
                                          aria-label="Valor hexadecimal da cor da embed"
                                        >
                                          {displayEmbedColor.toUpperCase()}
                                        </p>
                                      </div>
                                    </DashboardFieldStack>

                                    <div className="space-y-2">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        Placeholders disponíveis
                                      </h4>
                                      <div className="flex flex-wrap gap-2">
                                        {PLACEHOLDERS[eventKey].map((placeholder) => (
                                          <Badge
                                            key={`${eventKey}-${placeholder}`}
                                            variant="secondary"
                                            title={describePlaceholder(placeholder)}
                                          >
                                            {`{{${placeholder}}}`}
                                          </Badge>
                                        ))}
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Aliases legados de menção são convertidos automaticamente ao
                                        salvar.
                                      </p>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            <AccordionItem
              value="operational"
              className={`${dashboardPageLayoutTokens.surfaceSolid} rounded-xl px-4 animate-slide-up`}
              style={dashboardAnimationDelay(SECTION_REVEAL_DELAYS.operational)}
              data-testid="dashboard-webhooks-section-operational"
            >
              <div className="relative">
                <AccordionTrigger className="hover:no-underline">
                  Alertas Operacionais
                </AccordionTrigger>
                {isSectionOpen("operational") ? (
                  <DashboardActionButton
                    type="button"
                    size="sm"
                    className="absolute right-10 top-1/2 -translate-y-1/2"
                    aria-label="Salvar alertas operacionais"
                    onClick={() => void handleSaveSection("operational")}
                    disabled={savingBySection.operational || showStableShell}
                  >
                    <Save className="h-4 w-4" />
                    {savingBySection.operational ? "Salvando..." : "Salvar"}
                  </DashboardActionButton>
                ) : null}
              </div>
              <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                <div
                  className="space-y-4"
                  data-testid="dashboard-webhooks-section-content-operational"
                >
                  {sources.operational === "env" ? (
                    <div
                      className={`${dashboardPageLayoutTokens.surfaceInset} rounded-xl border-dashed p-3 text-sm text-muted-foreground`}
                    >
                      Esta seção foi inicializada a partir das variáveis de ambiente e ainda não foi
                      salva pelo dashboard.
                    </div>
                  ) : null}

                  <p className="text-sm text-muted-foreground">
                    Envia um resumo das mudanças entre estados operacionais, incluindo alertas
                    disparados, alterados e resolvidos.
                  </p>

                  <div className="grid gap-3 md:grid-cols-4">
                    <DashboardFieldStack className="md:col-span-2">
                      <Label>Webhook URL</Label>
                      <Input
                        value={settings.operational.webhookUrl}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            operational: {
                              ...previous.operational,
                              webhookUrl: event.target.value,
                            },
                          }))
                        }
                        placeholder="https://discord.com/api/webhooks/..."
                      />
                    </DashboardFieldStack>
                    <DashboardFieldStack>
                      <Label>Timeout (ms)</Label>
                      <Input
                        type="number"
                        min={MIN_TIMEOUT_MS}
                        max={MAX_TIMEOUT_MS}
                        value={settings.operational.timeoutMs}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            operational: {
                              ...previous.operational,
                              timeoutMs: Number(event.target.value || DEFAULT_TIMEOUT_MS),
                            },
                          }))
                        }
                      />
                    </DashboardFieldStack>
                    <DashboardFieldStack>
                      <Label>Intervalo (ms)</Label>
                      <Input
                        type="number"
                        min={MIN_OPERATIONAL_INTERVAL_MS}
                        max={MAX_OPERATIONAL_INTERVAL_MS}
                        value={settings.operational.intervalMs}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            operational: {
                              ...previous.operational,
                              intervalMs: Number(
                                event.target.value || DEFAULT_OPERATIONAL_INTERVAL_MS,
                              ),
                            },
                          }))
                        }
                      />
                    </DashboardFieldStack>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className={`flex w-fit items-center gap-2 ${dashboardPageLayoutTokens.cardActionSurface} px-3 py-2`}
                    >
                      <Switch
                        checked={settings.operational.enabled}
                        onCheckedChange={(checked) =>
                          setSettings((previous) => ({
                            ...previous,
                            operational: {
                              ...previous.operational,
                              enabled: checked,
                            },
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">Seção ativa</span>
                    </div>
                    <DashboardActionButton
                      type="button"
                      disabled={isTestingOperational}
                      onClick={() => void handleOperationalTest()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {isTestingOperational ? "Enviando..." : "Enviar teste"}
                    </DashboardActionButton>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="security"
              className={`${dashboardPageLayoutTokens.surfaceSolid} rounded-xl px-4 animate-slide-up`}
              style={dashboardAnimationDelay(SECTION_REVEAL_DELAYS.security)}
              data-testid="dashboard-webhooks-section-security"
            >
              <div className="relative">
                <AccordionTrigger className="hover:no-underline">Segurança</AccordionTrigger>
                {isSectionOpen("security") ? (
                  <DashboardActionButton
                    type="button"
                    size="sm"
                    className="absolute right-10 top-1/2 -translate-y-1/2"
                    aria-label="Salvar segurança"
                    onClick={() => void handleSaveSection("security")}
                    disabled={savingBySection.security || showStableShell}
                  >
                    <Save className="h-4 w-4" />
                    {savingBySection.security ? "Salvando..." : "Salvar"}
                  </DashboardActionButton>
                ) : null}
              </div>
              <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                <div
                  className="space-y-4"
                  data-testid="dashboard-webhooks-section-content-security"
                >
                  {sources.security === "env" ? (
                    <div
                      className={`${dashboardPageLayoutTokens.surfaceInset} rounded-xl border-dashed p-3 text-sm text-muted-foreground`}
                    >
                      Esta seção foi inicializada a partir das variáveis de ambiente e ainda não foi
                      salva pelo dashboard.
                    </div>
                  ) : null}

                  <p className="text-sm text-muted-foreground">
                    Envia somente eventos críticos de segurança com status, risco, ator, alvo, IP e
                    link para o dashboard.
                  </p>

                  <div className="grid gap-3 md:grid-cols-3">
                    <DashboardFieldStack className="md:col-span-2">
                      <Label>Webhook URL</Label>
                      <Input
                        value={settings.security.webhookUrl}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            security: {
                              ...previous.security,
                              webhookUrl: event.target.value,
                            },
                          }))
                        }
                        placeholder="https://discord.com/api/webhooks/..."
                      />
                    </DashboardFieldStack>
                    <DashboardFieldStack>
                      <Label>Timeout (ms)</Label>
                      <Input
                        type="number"
                        min={MIN_TIMEOUT_MS}
                        max={MAX_TIMEOUT_MS}
                        value={settings.security.timeoutMs}
                        onChange={(event) =>
                          setSettings((previous) => ({
                            ...previous,
                            security: {
                              ...previous.security,
                              timeoutMs: Number(event.target.value || DEFAULT_TIMEOUT_MS),
                            },
                          }))
                        }
                      />
                    </DashboardFieldStack>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className={`flex w-fit items-center gap-2 ${dashboardPageLayoutTokens.cardActionSurface} px-3 py-2`}
                    >
                      <Switch
                        checked={settings.security.enabled}
                        onCheckedChange={(checked) =>
                          setSettings((previous) => ({
                            ...previous,
                            security: {
                              ...previous.security,
                              enabled: checked,
                            },
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">Seção ativa</span>
                    </div>
                    <DashboardActionButton
                      type="button"
                      disabled={isTestingSecurity}
                      onClick={() => void handleSecurityTest()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {isTestingSecurity ? "Enviando..." : "Enviar teste"}
                    </DashboardActionButton>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="deliveries"
              className={`${dashboardPageLayoutTokens.surfaceSolid} rounded-xl px-4 animate-slide-up`}
              style={dashboardAnimationDelay(dashboardMotionDelays.sectionStepMs * 3)}
              data-testid="dashboard-webhooks-section-deliveries"
            >
              <AccordionTrigger className="hover:no-underline">Entregas</AccordionTrigger>
              <AccordionContent className={WEBHOOK_ACCORDION_CONTENT_CLASSNAME}>
                <div
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                  data-testid="dashboard-webhooks-delivery-summary-grid"
                >
                  {[
                    { id: "queued", label: "Na fila", value: deliveriesSummary.queued },
                    { id: "processing", label: "Processando", value: deliveriesSummary.processing },
                    { id: "retrying", label: "Reagendado", value: deliveriesSummary.retrying },
                    { id: "failed", label: "Falhas", value: deliveriesSummary.failed },
                    {
                      id: "sent_last_24h",
                      label: "Enviados 24h",
                      value: deliveriesSummary.sentLast24h,
                    },
                  ].map((item) => (
                    <div
                      key={item.id}
                      className={`${dashboardPageLayoutTokens.surfaceSolid} min-w-0 p-5`}
                      data-testid={`dashboard-webhooks-delivery-summary-card-${item.id}`}
                    >
                      <p className={`text-sm ${dashboardPageLayoutTokens.cardMetaText}`}>
                        {item.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div
                  className={`grid min-w-0 gap-3 ${dashboardPageLayoutTokens.surfaceInset} rounded-xl p-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]`}
                >
                  <DashboardFieldStack>
                    <Label>Escopo</Label>
                    <Combobox
                      value={deliveryFilters.scope || "all"}
                      onValueChange={(value) =>
                        setDeliveryFilters((previous) => ({
                          ...previous,
                          scope: value === "all" ? "" : value,
                          page: 1,
                        }))
                      }
                      ariaLabel="Filtrar entregas por escopo"
                      options={deliveryScopeOptions}
                      placeholder="Todos"
                      searchable={false}
                      dataTestId="dashboard-webhooks-delivery-filter-scope"
                    />
                  </DashboardFieldStack>

                  <DashboardFieldStack>
                    <Label>Status</Label>
                    <Combobox
                      value={deliveryFilters.status || "all"}
                      onValueChange={(value) =>
                        setDeliveryFilters((previous) => ({
                          ...previous,
                          status: value === "all" ? "" : value,
                          page: 1,
                        }))
                      }
                      ariaLabel="Filtrar entregas por status"
                      options={deliveryStatusOptions}
                      placeholder="Todos"
                      searchable={false}
                      dataTestId="dashboard-webhooks-delivery-filter-status"
                    />
                  </DashboardFieldStack>

                  <DashboardFieldStack>
                    <Label>Canal</Label>
                    <Combobox
                      value={deliveryFilters.channel || "all"}
                      onValueChange={(value) =>
                        setDeliveryFilters((previous) => ({
                          ...previous,
                          channel: value === "all" ? "" : value,
                          page: 1,
                        }))
                      }
                      ariaLabel="Filtrar entregas por canal"
                      options={deliveryChannelOptions}
                      placeholder="Todos"
                      searchable={false}
                      dataTestId="dashboard-webhooks-delivery-filter-channel"
                    />
                  </DashboardFieldStack>

                  <div className="flex items-end">
                    <DashboardActionButton
                      type="button"
                      size="sm"
                      className="w-full justify-center md:w-auto"
                      onClick={() => void loadDeliveries({ page: deliveryFilters.page })}
                      disabled={isLoadingDeliveries}
                    >
                      {isLoadingDeliveries ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Atualizar
                    </DashboardActionButton>
                  </div>
                </div>

                {isLoadingDeliveries && deliveries.length === 0 ? (
                  <div className="space-y-3" data-testid="dashboard-webhooks-deliveries-loading">
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </div>
                ) : deliveries.length === 0 ? (
                  <AsyncState
                    kind="empty"
                    title="Nenhuma entrega encontrada"
                    description="Novas entregas aparecem aqui conforme os webhooks forem disparados."
                    className="rounded-xl"
                    data-testid="dashboard-webhooks-deliveries-empty"
                  />
                ) : (
                  <div className="space-y-3" data-testid="dashboard-webhooks-deliveries-list">
                    {deliveries.map((delivery) => {
                      const resourceSummary = describeDeliveryResources(delivery);
                      const eventLabel =
                        delivery.eventLabel ||
                        (delivery.eventKey in EVENT_LABELS
                          ? EVENT_LABELS[delivery.eventKey as EventKey]
                          : delivery.eventKey || "Sem evento");
                      const channelLabel =
                        delivery.channel in CHANNEL_LABELS
                          ? CHANNEL_LABELS[delivery.channel as ChannelKey]
                          : delivery.channel || "Sem canal";
                      return (
                        <div
                          key={delivery.id}
                          className={`${dashboardPageLayoutTokens.surfaceInset} min-w-0 rounded-xl p-4`}
                          data-testid={`dashboard-webhooks-delivery-${delivery.id}`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    WEBHOOK_DELIVERY_STATUS_VARIANTS[delivery.status] || "outline"
                                  }
                                >
                                  {WEBHOOK_DELIVERY_STATUS_LABELS[delivery.status] ||
                                    delivery.status}
                                </Badge>
                                <Badge variant="outline">
                                  {WEBHOOK_DELIVERY_SCOPE_LABELS[delivery.scope] || delivery.scope}
                                </Badge>
                                <Badge variant="secondary">{channelLabel}</Badge>
                                <span className="min-w-0 wrap-break-word text-sm font-medium">
                                  {eventLabel}
                                </span>
                              </div>

                              <div className="min-w-0 space-y-1 text-sm">
                                <p className="break-all font-medium">
                                  {delivery.targetLabel || "-"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Tentativas: {delivery.attemptCount}/{delivery.maxAttempts}
                                  {delivery.statusCode ? ` | HTTP ${delivery.statusCode}` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Criado em {formatWebhookTs(delivery.createdAt)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Última tentativa em {formatWebhookTs(delivery.lastAttemptAt)}
                                </p>
                                {delivery.nextAttemptAt ? (
                                  <p className="text-xs text-muted-foreground">
                                    Próxima tentativa em {formatWebhookTs(delivery.nextAttemptAt)}
                                  </p>
                                ) : null}
                                {resourceSummary ? (
                                  <p className="wrap-break-word text-xs text-muted-foreground">
                                    Recursos: {resourceSummary}
                                  </p>
                                ) : null}
                                {delivery.error ? (
                                  <p className="wrap-break-word text-xs text-destructive">
                                    {delivery.error}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-start gap-2 lg:justify-end">
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                className="w-full justify-center sm:w-auto"
                                onClick={() => void handleRetryDelivery(delivery.id)}
                                disabled={
                                  !delivery.isRetryable || retryingDeliveryId === delivery.id
                                }
                              >
                                {retryingDeliveryId === delivery.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}
                                Reenfileirar
                              </DashboardActionButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {deliveriesTotal > 25 ? (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Página {deliveryFilters.page} de {deliveryTotalPages}
                    </p>
                    <CompactPagination
                      currentPage={deliveryFilters.page}
                      totalPages={deliveryTotalPages}
                      disabled={isLoadingDeliveries}
                      className="mx-0 w-full justify-start md:w-auto md:justify-end"
                      contentClassName="flex-wrap justify-start md:justify-end"
                      onPageChange={(page) =>
                        setDeliveryFilters((previous) => ({
                          ...previous,
                          page,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        <Dialog
          open={Boolean(templateClipboardDialog)}
          onOpenChange={(open) => {
            if (!open) {
              setTemplateClipboardDialog(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {templateClipboardDialog?.mode === "copy" ? "Copiar template" : "Colar template"}
              </DialogTitle>
              <DialogDescription>
                {templateClipboardDialog?.mode === "copy"
                  ? "Copie o JSON abaixo manualmente."
                  : "Cole o JSON exportado de outro evento editorial."}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={templateClipboardDialog?.value || ""}
              readOnly={templateClipboardDialog?.mode === "copy"}
              onChange={(event) =>
                setTemplateClipboardDialog((previous) =>
                  previous ? { ...previous, value: event.target.value } : previous,
                )
              }
              className="min-h-64 font-mono text-xs"
              aria-label={
                templateClipboardDialog?.mode === "copy" ? "JSON do template" : "JSON para colar"
              }
            />
            <DialogFooter className="gap-2">
              <DashboardActionButton type="button" onClick={() => setTemplateClipboardDialog(null)}>
                Fechar
              </DashboardActionButton>
              {templateClipboardDialog?.mode === "paste" ? (
                <DashboardActionButton
                  type="button"
                  tone="primary"
                  onClick={() => {
                    if (!templateClipboardDialog) {
                      return;
                    }
                    const applied = applyTemplatePackage(
                      templateClipboardDialog.channelKey,
                      templateClipboardDialog.eventKey,
                      templateClipboardDialog.value,
                    );
                    if (applied) {
                      setTemplateClipboardDialog(null);
                    }
                  }}
                >
                  Aplicar
                </DashboardActionButton>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardPageContainer>
    </DashboardShell>
  );
};

export default DashboardWebhooks;
