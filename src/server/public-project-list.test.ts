import { describe, expect, it } from "vitest";

import {
  serializePublicProjectCatalogItem,
  serializePublicProjectListItem,
} from "../../server/lib/public-project-list.js";

describe("public project list serialization", () => {
  it("keeps catalog fields and excludes heavy project detail data", () => {
    const source = {
      id: "project-1",
      title: "Projeto",
      synopsis: "Sinopse",
      tags: ["acao"],
      genres: ["aventura"],
      cover: "/uploads/cover.jpg",
      episodeDownloads: [{ number: 1, content: "heavy-content" }],
      volumeEntries: [{ volume: 1 }],
      relations: [{ title: "Relacionado" }],
      staff: [{ role: "Autor", members: ["Pessoa"] }],
    };
    const serialized = serializePublicProjectCatalogItem(source);

    expect(serialized).toMatchObject({
      id: "project-1",
      title: "Projeto",
      synopsis: "Sinopse",
      tags: ["acao"],
      genres: ["aventura"],
      cover: "/uploads/cover.jpg",
    });
    expect(serialized).not.toHaveProperty("episodeDownloads");
    expect(serialized).not.toHaveProperty("volumeEntries");
    expect(serialized).not.toHaveProperty("relations");
    expect(serialized).not.toHaveProperty("staff");

    expect(serializePublicProjectListItem(source)).toMatchObject({
      episodeDownloads: [{ number: 1, content: "heavy-content" }],
      volumeEntries: [{ volume: 1 }],
      relations: [{ title: "Relacionado" }],
      staff: [{ role: "Autor", members: ["Pessoa"] }],
    });
  });
});
