const asTrimmedString = (value) => String(value || "").trim();

const stripHtml = (value) =>
  asTrimmedString(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toIsoDateOrNull = (value) => {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const toAbsoluteUrl = (origin, value) => {
  const raw = asTrimmedString(value);
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw, origin).toString();
  } catch {
    return "";
  }
};

const normalizePathname = (value) => {
  const raw = asTrimmedString(value) || "/";
  if (!raw.startsWith("/")) {
    return "/";
  }
  if (raw === "/") {
    return "/";
  }
  return raw.replace(/\/+$/, "") || "/";
};

const isNoIndexLikePath = (pathname) =>
  pathname.startsWith("/dashboard") ||
  pathname === "/login" ||
  pathname.startsWith("/login/") ||
  /^\/projeto(?:s)?\/.+\/leitura\/.+/.test(pathname);

const toSocialLinks = (settings, origin) => {
  const socialLinks = Array.isArray(settings?.footer?.socialLinks)
    ? settings.footer.socialLinks
    : [];
  return socialLinks.map((item) => toAbsoluteUrl(origin, item?.href)).filter(Boolean);
};

const buildOrganizationSchema = ({ origin, settings }) => {
  const siteName = asTrimmedString(settings?.site?.name) || "Nekomata";
  const logoUrl =
    toAbsoluteUrl(origin, settings?.branding?.assets?.symbolUrl) ||
    toAbsoluteUrl(origin, settings?.branding?.assets?.wordmarkUrl) ||
    toAbsoluteUrl(origin, settings?.site?.faviconUrl);
  const sameAs = toSocialLinks(settings, origin);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}#organization`,
    name: siteName,
    url: origin,
  };
  if (logoUrl) {
    schema.logo = logoUrl;
  }
  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }
  return schema;
};

const buildWebSiteSchema = ({ origin, settings }) => {
  const siteName = asTrimmedString(settings?.site?.name) || "Nekomata";
  const description = asTrimmedString(settings?.site?.description);
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}#website`,
    url: `${origin}/`,
    name: siteName,
    publisher: { "@id": `${origin}#organization` },
  };
  if (description) {
    schema.description = description;
  }
  return schema;
};

const staticLabelByPath = {
  "/": "Início",
  "/projetos": "Projetos",
  "/sobre": "Sobre",
  "/equipe": "Equipe",
  "/faq": "FAQ",
  "/recrutamento": "Recrutamento",
  "/doacoes": "Doações",
};

const buildBreadcrumbParts = ({ origin, pathname, canonicalUrl, post, project }) => {
  const parts = [{ name: "Início", item: `${origin}/` }];
  if (pathname === "/") {
    return parts;
  }

  if (pathname.startsWith("/postagem/")) {
    const postTitle = asTrimmedString(post?.title) || "Postagem";
    parts.push({ name: postTitle, item: canonicalUrl });
    return parts;
  }

  if (pathname.startsWith("/projeto/") || pathname.startsWith("/projetos/")) {
    const projectTitle = asTrimmedString(project?.title) || "Projeto";
    parts.push({ name: "Projetos", item: `${origin}/projetos` });
    if (pathname.includes("/leitura/")) {
      parts.push({ name: projectTitle, item: `${origin}/projeto/${project?.id || ""}` });
      parts.push({ name: "Leitura", item: canonicalUrl });
      return parts;
    }
    parts.push({ name: projectTitle, item: canonicalUrl });
    return parts;
  }

  const staticLabel = staticLabelByPath[pathname];
  if (staticLabel) {
    parts.push({ name: staticLabel, item: canonicalUrl });
    return parts;
  }

  return parts;
};

const buildBreadcrumbSchema = ({ origin, pathname, canonicalUrl, post, project }) => {
  const parts = buildBreadcrumbParts({ origin, pathname, canonicalUrl, post, project }).filter(
    (item) => asTrimmedString(item?.name) && asTrimmedString(item?.item),
  );
  if (parts.length < 2) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: parts.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
};

const buildArticleSchema = ({ origin, canonicalUrl, post, settings }) => {
  if (!post || typeof post !== "object") {
    return null;
  }
  const headline = asTrimmedString(post?.seoTitle) || asTrimmedString(post?.title);
  if (!headline) {
    return null;
  }
  const description =
    stripHtml(post?.seoDescription) ||
    stripHtml(post?.excerpt) ||
    stripHtml(post?.content) ||
    asTrimmedString(settings?.site?.description);
  const image =
    toAbsoluteUrl(origin, post?.seoImageUrl) ||
    toAbsoluteUrl(origin, post?.coverImageUrl) ||
    toAbsoluteUrl(origin, settings?.site?.defaultShareImage);
  const datePublished = toIsoDateOrNull(post?.publishedAt);
  const dateModified = toIsoDateOrNull(post?.updatedAt) || datePublished;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonicalUrl}#article`,
    mainEntityOfPage: canonicalUrl,
    headline,
    author: {
      "@type": "Person",
      name: asTrimmedString(post?.author) || "Equipe",
    },
    publisher: { "@id": `${origin}#organization` },
  };
  if (description) {
    schema.description = description;
  }
  if (image) {
    schema.image = [image];
  }
  if (datePublished) {
    schema.datePublished = datePublished;
  }
  if (dateModified) {
    schema.dateModified = dateModified;
  }
  const keywords = Array.isArray(post?.tags)
    ? post.tags.map((item) => asTrimmedString(item)).filter(Boolean)
    : [];
  if (keywords.length > 0) {
    schema.keywords = keywords.join(", ");
  }
  return schema;
};

const buildCreativeWorkSchema = ({ origin, canonicalUrl, project, settings }) => {
  if (!project || typeof project !== "object") {
    return null;
  }
  const name = asTrimmedString(project?.title);
  if (!name) {
    return null;
  }
  const description =
    stripHtml(project?.synopsis) ||
    stripHtml(project?.description) ||
    asTrimmedString(settings?.site?.description);
  const image =
    toAbsoluteUrl(origin, project?.seoImageUrl) ||
    toAbsoluteUrl(origin, project?.coverImageUrl) ||
    toAbsoluteUrl(origin, project?.cover) ||
    toAbsoluteUrl(origin, project?.heroImageUrl) ||
    toAbsoluteUrl(origin, project?.banner) ||
    toAbsoluteUrl(origin, settings?.site?.defaultShareImage);
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${canonicalUrl}#creativework`,
    mainEntityOfPage: canonicalUrl,
    name,
    publisher: { "@id": `${origin}#organization` },
  };
  if (description) {
    schema.description = description;
  }
  if (image) {
    schema.image = image;
  }
  return schema;
};

const buildFaqSchema = ({ canonicalUrl, pages }) => {
  const groups = Array.isArray(pages?.faq?.groups) ? pages.faq.groups : [];
  const mainEntity = [];
  groups.forEach((group) => {
    const items = Array.isArray(group?.items) ? group.items : [];
    items.forEach((item) => {
      const question = asTrimmedString(item?.question);
      const answer = stripHtml(item?.answer);
      if (!question || !answer) {
        return;
      }
      mainEntity.push({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      });
    });
  });
  if (mainEntity.length === 0) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${canonicalUrl}#faq`,
    mainEntity: mainEntity.slice(0, 100),
  };
};

export const buildSchemaOrgPayload = ({
  origin,
  pathname,
  canonicalUrl,
  settings,
  pages,
  post = null,
  project = null,
} = {}) => {
  const safeOrigin = asTrimmedString(origin);
  if (!safeOrigin) {
    return [];
  }
  const normalizedPath = normalizePathname(pathname);
  if (isNoIndexLikePath(normalizedPath)) {
    return [];
  }

  const safeCanonicalUrl = toAbsoluteUrl(
    safeOrigin,
    canonicalUrl || `${safeOrigin}${normalizedPath}`,
  );
  const schemas = [
    buildOrganizationSchema({ origin: safeOrigin, settings }),
    buildWebSiteSchema({ origin: safeOrigin, settings }),
    buildBreadcrumbSchema({
      origin: safeOrigin,
      pathname: normalizedPath,
      canonicalUrl: safeCanonicalUrl,
      post,
      project,
    }),
  ].filter(Boolean);

  if (normalizedPath.startsWith("/postagem/")) {
    const article = buildArticleSchema({
      origin: safeOrigin,
      canonicalUrl: safeCanonicalUrl,
      post,
      settings,
    });
    if (article) {
      schemas.push(article);
    }
  }

  if (/^\/projeto\/.+/.test(normalizedPath) && !normalizedPath.includes("/leitura/")) {
    const creativeWork = buildCreativeWorkSchema({
      origin: safeOrigin,
      canonicalUrl: safeCanonicalUrl,
      project,
      settings,
    });
    if (creativeWork) {
      schemas.push(creativeWork);
    }
  }

  if (normalizedPath === "/faq") {
    const faqSchema = buildFaqSchema({ canonicalUrl: safeCanonicalUrl, pages });
    if (faqSchema) {
      schemas.push(faqSchema);
    }
  }

  return schemas;
};

export const serializeSchemaOrgEntry = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
