import { describe, expect, it } from "vitest";

import { buildSchemaOrgPayload, serializeSchemaOrgEntry } from "../../server/lib/schema-org.js";

const settingsFixture = {
  site: {
    name: "Nekomata",
    description: "Descricao do site",
    faviconUrl: "/favicon.ico",
    defaultShareImage: "/uploads/shared/default.jpg",
  },
  branding: {
    assets: {
      symbolUrl: "/uploads/branding/symbol.png",
      wordmarkUrl: "",
    },
  },
  footer: {
    socialLinks: [
      { label: "Discord", href: "https://discord.gg/nekomata" },
      { label: "Twitter", href: "https://x.com/nekomata" },
    ],
  },
};

describe("schema.org payload", () => {
  it("gera schemas core e Article para rota de postagem", () => {
    const post = {
      title: "Titulo do post",
      seoTitle: "",
      excerpt: "Resumo do post",
      content: "<p>Conteudo</p>",
      author: "Equipe",
      publishedAt: "2026-02-10T10:00:00.000Z",
      updatedAt: "2026-02-11T10:00:00.000Z",
      coverImageUrl: "/uploads/posts/capa.jpg",
      tags: ["acao", "drama"],
    };
    const payload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/postagem/titulo-do-post",
      canonicalUrl: "https://nekomata.moe/postagem/titulo-do-post",
      settings: settingsFixture,
      pages: {},
      post,
    });

    expect(payload.some((entry) => entry["@type"] === "Organization")).toBe(true);
    expect(payload.some((entry) => entry["@type"] === "WebSite")).toBe(true);
    expect(payload.some((entry) => entry["@type"] === "BreadcrumbList")).toBe(true);

    const website = payload.find((entry) => entry["@type"] === "WebSite");
    expect(website?.potentialAction).toBeUndefined();

    const breadcrumb = payload.find((entry) => entry["@type"] === "BreadcrumbList");
    expect(breadcrumb?.itemListElement).toHaveLength(2);
    expect(breadcrumb?.itemListElement?.map((item) => item.position)).toEqual([1, 2]);

    const article = payload.find((entry) => entry["@type"] === "Article");
    expect(article).toBeDefined();
    expect(article?.headline).toBe("Titulo do post");
    expect(article?.datePublished).toBe("2026-02-10T10:00:00.000Z");
    expect(article?.keywords).toBe("acao, drama");
  });

  it("gera FAQPage para /faq com perguntas e respostas", () => {
    const payload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/faq",
      canonicalUrl: "https://nekomata.moe/faq",
      settings: settingsFixture,
      pages: {
        faq: {
          groups: [
            {
              items: [
                { question: "Pergunta 1", answer: "Resposta 1" },
                { question: "Pergunta 2", answer: "<b>Resposta 2</b>" },
              ],
            },
          ],
        },
      },
    });

    const faq = payload.find((entry) => entry["@type"] === "FAQPage");
    expect(faq).toBeDefined();
    expect(faq?.mainEntity).toHaveLength(2);
    expect(faq?.mainEntity?.[1]?.acceptedAnswer?.text).toBe("Resposta 2");
  });

  it("gera CreativeWork para projeto publico", () => {
    const payload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/projeto/86864",
      canonicalUrl: "https://nekomata.moe/projeto/86864",
      settings: settingsFixture,
      pages: {},
      project: {
        title: "Projeto Teste",
        synopsis: "Sinopse do projeto",
        coverImageUrl: "/uploads/projects/capa.jpg",
      },
    });

    const creativeWork = payload.find((entry) => entry["@type"] === "CreativeWork");
    expect(creativeWork).toBeDefined();
    expect(creativeWork?.name).toBe("Projeto Teste");
    expect(creativeWork?.description).toBe("Sinopse do projeto");
    expect(creativeWork?.mainEntityOfPage).toBe("https://nekomata.moe/projeto/86864");
  });

  it("nao gera schema para rotas noindex do dashboard e leitor", () => {
    const dashboardPayload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/dashboard/configuracoes",
      canonicalUrl: "https://nekomata.moe/dashboard/configuracoes",
      settings: settingsFixture,
      pages: {},
    });
    const readerPayload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/projeto/86864/leitura/1",
      canonicalUrl: "https://nekomata.moe/projeto/86864/leitura/1",
      settings: settingsFixture,
      pages: {},
      project: { title: "Projeto Teste" },
    });
    expect(dashboardPayload).toEqual([]);
    expect(readerPayload).toEqual([]);
  });

  it("omite breadcrumb quando a trilha tem menos de dois itens", () => {
    const payload = buildSchemaOrgPayload({
      origin: "https://nekomata.moe",
      pathname: "/",
      canonicalUrl: "https://nekomata.moe/",
      settings: settingsFixture,
      pages: {},
    });

    expect(payload.some((entry) => entry["@type"] === "BreadcrumbList")).toBe(false);
  });
});

describe("schema.org serialization", () => {
  it("escapa caracteres de fechamento de script", () => {
    const serialized = serializeSchemaOrgEntry({
      "@context": "https://schema.org",
      text: "</script><script>alert(1)</script>",
    });
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized).not.toContain("</script>");
  });
});
