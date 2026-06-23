import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importRemoteImageFile } from "../../server/lib/remote-image-import.js";

const tempDirs: string[] = [];
let originalFetch: typeof globalThis.fetch;

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=",
  "base64",
);

const createTempUploadsDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remote-image-import-test-"));
  tempDirs.push(dir);
  return dir;
};

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("importRemoteImageFile", () => {
  it("rejeita hostnames privados em IPv6 bracketed bypass", async () => {
    const fetchMock = vi.fn();
    const result = await importRemoteImageFile({
      remoteUrl: "http://[::1]/imagem.png",
      uploadsDir: createTempUploadsDir(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.error?.code : null).toBe("host_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("baixa imagem valida e salva em /uploads com metadados", async () => {
    const uploadsDir = createTempUploadsDir();
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array(ONE_BY_ONE_PNG), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
    );

    const result = await importRemoteImageFile({
      remoteUrl: "https://cdn.exemplo.com/imagens/capa.png",
      folder: "projects/proj-1",
      uploadsDir,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entry.fileName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    expect(result.entry.url).toMatch(/^\/uploads\/projects\/proj-1\/.+\.png$/);
    expect(result.entry.mime).toBe("image/png");
    expect(result.entry.width).toBe(1);
    expect(result.entry.height).toBe(1);
    const diskPath = path.join(uploadsDir, "projects", "proj-1", result.entry.fileName);
    expect(fs.existsSync(diskPath)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("modo deterministico reutiliza arquivo existente sem duplicar", async () => {
    const uploadsDir = createTempUploadsDir();
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array(ONE_BY_ONE_PNG), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
    );

    const first = await importRemoteImageFile({
      remoteUrl: "https://cdn.exemplo.com/imagens/relation.png",
      folder: "shared/relations",
      uploadsDir,
      deterministic: true,
      fileBaseOverride: "relation-777",
      onExisting: "reuse",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const second = await importRemoteImageFile({
      remoteUrl: "https://cdn.exemplo.com/imagens/relation.png",
      folder: "shared/relations",
      uploadsDir,
      deterministic: true,
      fileBaseOverride: "relation-777",
      onExisting: "reuse",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.entry.url).toBe("/uploads/shared/relations/relation-777.png");
    expect(second.entry.url).toBe("/uploads/shared/relations/relation-777.png");

    const folderPath = path.join(uploadsDir, "shared", "relations");
    const files = fs.readdirSync(folderPath).sort();
    expect(files).toEqual(["relation-777.png"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retorna erro tipado para URL invalida/protocolo nao suportado", async () => {
    const result = await importRemoteImageFile({
      remoteUrl: "ftp://cdn.exemplo.com/capa.png",
      uploadsDir: createTempUploadsDir(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("invalid_url");
  });

  it("bloqueia host privado/local para evitar SSRF", async () => {
    const fetchMock = vi.fn();
    const result = await importRemoteImageFile({
      remoteUrl: "http://127.0.0.1:8080/private.png",
      uploadsDir: createTempUploadsDir(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("host_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bloqueia URL com credenciais embutidas", async () => {
    const fetchMock = vi.fn();
    const result = await importRemoteImageFile({
      remoteUrl: "https://user:pass@cdn.exemplo.com/capa.png",
      uploadsDir: createTempUploadsDir(),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("invalid_url_credentials");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bloqueia redirecionamento para host interno", async () => {
    const uploadsDir = createTempUploadsDir();
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: "http://127.0.0.1/private.png",
          },
        }),
    );

    const result = await importRemoteImageFile({
      remoteUrl: "https://cdn.exemplo.com/imagens/capa.png",
      uploadsDir,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("host_not_allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retorna erro tipado para payload nao suportado", async () => {
    const uploadsDir = createTempUploadsDir();
    const fetchMock = vi.fn(
      async () =>
        new Response("not-an-image", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    const result = await importRemoteImageFile({
      remoteUrl: "https://cdn.exemplo.com/arquivo.txt",
      uploadsDir,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(["unsupported_image_type", "invalid_image_data"]).toContain(result.error.code);
  });
});
