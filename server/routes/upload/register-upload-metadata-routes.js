import crypto from "crypto";
import fs from "fs";

export const registerUploadMetadataRoutes = (deps) => {
  const {
    app,
    appendAuditLog,
    attachUploadMediaMetadata,
    canManageUploads,
    canUploadImage,
    cleanupUploadStagingWorkspace,
    computeBufferSha256,
    createUploadStagingWorkspace,
    deleteManagedUploadEntryAssets,
    ensureUploadEntryHasRequiredVariants,
    extractRequestedUploadFocalPayload,
    findUploadByHash,
    getUploadExtFromMime,
    hasOwnField,
    isPrivateUploadFolder,
    loadUploads,
    materializeUploadEntrySourceToStaging,
    normalizeUploadMime,
    normalizeVariants,
    persistUploadEntryFromStaging,
    readUploadAltText,
    readUploadFocalState,
    readUploadSlot,
    readUploadSlotManaged,
    readUploadStorageProvider,
    getRequestIp,
    resolveIncomingUploadFocalState,
    resolveRequestUploadAccessScope,
    sanitizeSvg,
    sanitizeUploadFolder,
    sanitizeUploadSlot,
    shouldIncludeUploadInHashDedupe,
    uploadStorageService,
    validateUploadImageBuffer,
    writeUploadBufferToStaging,
    writeUploads,
    PUBLIC_UPLOADS_DIR,
    MAX_SVG_SIZE_BYTES,
    MAX_UPLOAD_SIZE_BYTES,
    STATIC_DEFAULT_CACHE_CONTROL,
    includeImageRoute = true,
    includeFocalPointRoute = true,
    includeAltTextRoute = true,
  } = deps;

  if (includeImageRoute) {
    app.post("/api/uploads/image", deps.requireAuth, async (req, res) => {
      const sessionUser = req.session.user;
      const { dataUrl, folder, slot, scopeUserId } = req.body || {};
      const safeFolder = sanitizeUploadFolder(folder);
      const uploadAccessScope = resolveRequestUploadAccessScope({
        sessionUser,
        folder: safeFolder,
        scopeUserId,
      });
      if (!uploadAccessScope.allowed) {
        return res.status(403).json({ error: "forbidden" });
      }
      const ip = typeof getRequestIp === "function" ? getRequestIp(req) : String(req?.ip || "");
      if (!(await canUploadImage(ip))) {
        return res.status(429).json({ error: "rate_limited" });
      }

      if (!dataUrl || typeof dataUrl !== "string") {
        return res.status(400).json({ error: "data_url_required" });
      }

      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: "invalid_data_url" });
      }

      let mime = normalizeUploadMime(match[1]);
      if (!/^(image\/(png|jpe?g|gif|webp|svg\+xml))$/i.test(mime)) {
        return res.status(400).json({ error: "unsupported_image_type" });
      }
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length) {
        return res.status(400).json({ error: "empty_upload" });
      }
      if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
        return res.status(400).json({ error: "file_too_large" });
      }
      const validation = validateUploadImageBuffer(buffer, mime, { strictRequestedMime: true });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      mime = validation.mime;
      if (mime === "image/svg+xml" && buffer.length > MAX_SVG_SIZE_BYTES) {
        return res.status(400).json({ error: "svg_too_large" });
      }
      const uploadsDir = PUBLIC_UPLOADS_DIR;
      const activeStorageProvider = uploadStorageService.activeProvider;
      const sourceBuffer =
        mime === "image/svg+xml"
          ? Buffer.from(sanitizeSvg(buffer.toString("utf-8")), "utf-8")
          : buffer;
      const hashSha256 = computeBufferSha256(sourceBuffer);
      const uploads = loadUploads();
      const dedupeEntry = findUploadByHash(
        uploads.filter((item) => shouldIncludeUploadInHashDedupe(item, uploadAccessScope)),
        hashSha256,
      );
      if (dedupeEntry) {
        const dedupeResolution = await ensureUploadEntryHasRequiredVariants({
          uploads,
          uploadsDir,
          entry: dedupeEntry,
          sourceMime: mime,
          hashSha256,
          requiredVariantPresetKeys: deps.resolveUploadVariantPresetKeysForArea(safeFolder),
        });
        const resolvedDedupeEntry = dedupeResolution.entry;
        const dedupeFocalState = readUploadFocalState(resolvedDedupeEntry);
        appendAuditLog(req, "uploads.image", "uploads", {
          uploadId: resolvedDedupeEntry.id,
          fileName: resolvedDedupeEntry.fileName,
          folder: resolvedDedupeEntry.folder || "",
          url: resolvedDedupeEntry.url,
          hashSha256,
          dedupeHit: true,
          variantBytes: Number(resolvedDedupeEntry?.variantBytes || 0),
        });
        return res.json({
          uploadId: resolvedDedupeEntry.id,
          url: resolvedDedupeEntry.url,
          fileName: resolvedDedupeEntry.fileName,
          hashSha256,
          dedupeHit: true,
          focalCrops: dedupeFocalState.focalCrops,
          focalPoints: dedupeFocalState.focalPoints,
          focalPoint: dedupeFocalState.focalPoint,
          variants: normalizeVariants(resolvedDedupeEntry.variants),
          area: resolvedDedupeEntry.area || "",
          variantsGenerated: true,
        });
      }

      const ext = getUploadExtFromMime(mime);
      const safeSlot = sanitizeUploadSlot(slot);
      const useSlotName = Boolean(safeSlot && isPrivateUploadFolder(safeFolder));
      const fileName = useSlotName ? `${safeSlot}.${ext}` : `${crypto.randomUUID()}.${ext}`;
      const relativeUrl = `/uploads/${safeFolder ? `${safeFolder}/` : ""}${fileName}`;
      const existingIndex = uploads.findIndex((item) => item.url === relativeUrl);
      const existingEntry = existingIndex >= 0 ? uploads[existingIndex] : null;
      const requestedFocalPayload = extractRequestedUploadFocalPayload(req.body);
      const variantsVersion = Math.max(1, Number(existingEntry?.variantsVersion || 0) + 1);
      const uploadEntryBase = {
        id: existingEntry?.id || crypto.randomUUID(),
        url: relativeUrl,
        fileName,
        folder: safeFolder || "",
        size: sourceBuffer.length,
        mime,
        width: validation.dimensions?.width || null,
        height: validation.dimensions?.height || null,
        area: safeFolder ? String(safeFolder).split("/")[0] : "root",
        createdAt: new Date().toISOString(),
        altText: readUploadAltText(existingEntry),
        slot: safeSlot || readUploadSlot(existingEntry) || undefined,
        slotManaged: useSlotName ? true : readUploadSlotManaged(existingEntry),
        storageProvider: activeStorageProvider,
      };
      const requestedFocalState = resolveIncomingUploadFocalState(requestedFocalPayload, {
        ...(existingEntry || {}),
        ...uploadEntryBase,
      });
      let uploadEntry;
      let variantsGenerated = true;
      let variantGenerationError = "";
      const stagingWorkspace = createUploadStagingWorkspace();
      try {
        const filePath = writeUploadBufferToStaging({
          uploadsDir: stagingWorkspace.uploadsDir,
          uploadUrl: relativeUrl,
          buffer: sourceBuffer,
        });
        uploadEntry = await attachUploadMediaMetadata({
          uploadsDir: stagingWorkspace.uploadsDir,
          entry: {
            ...uploadEntryBase,
            storageProvider: activeStorageProvider,
          },
          sourcePath: filePath,
          sourceMime: mime,
          hashSha256,
          focalCrops: hasOwnField(requestedFocalPayload, "focalCrops")
            ? requestedFocalState.focalCrops
            : undefined,
          focalPoints: requestedFocalState.focalPoints,
          variantsVersion,
          regenerateVariants: true,
        });
        await persistUploadEntryFromStaging({
          storageService: uploadStorageService,
          entry: uploadEntry,
          uploadsDir: stagingWorkspace.uploadsDir,
          provider: activeStorageProvider,
          cacheControl: STATIC_DEFAULT_CACHE_CONTROL,
        });
      } catch (error) {
        variantsGenerated = false;
        variantGenerationError = String(error?.message || "variant_generation_failed");
        appendAuditLog(req, "uploads.image.variant_generation_failed", "uploads", {
          uploadId: uploadEntryBase.id,
          url: relativeUrl,
          fileName,
          error: variantGenerationError,
        });
        uploadEntry = {
          ...uploadEntryBase,
          hashSha256,
          focalCrops: requestedFocalState.focalCrops,
          focalPoints: requestedFocalState.focalPoints,
          focalPoint: requestedFocalState.focalPoint,
          variantsVersion,
          variants: {},
          variantBytes: 0,
          area: safeFolder ? String(safeFolder).split("/")[0] : "root",
          storageProvider: activeStorageProvider,
        };
        try {
          await uploadStorageService.putUploadUrl({
            provider: activeStorageProvider,
            uploadUrl: relativeUrl,
            buffer: sourceBuffer,
            contentType: mime,
            cacheControl: STATIC_DEFAULT_CACHE_CONTROL,
          });
        } catch {
          return res.status(500).json({ error: "upload_persist_failed" });
        }
      } finally {
        cleanupUploadStagingWorkspace(stagingWorkspace);
      }

      if (
        existingEntry &&
        readUploadStorageProvider(existingEntry, "local") !== activeStorageProvider
      ) {
        void deleteManagedUploadEntryAssets(existingEntry).catch(() => undefined);
      }

      if (existingIndex >= 0) {
        uploads[existingIndex] = uploadEntry;
      } else {
        uploads.push(uploadEntry);
      }
      writeUploads(uploads);

      appendAuditLog(req, "uploads.image", "uploads", {
        uploadId: uploadEntry.id,
        fileName,
        folder: safeFolder || "",
        url: relativeUrl,
        hashSha256,
        dedupeHit: false,
        variantBytes: Number(uploadEntry?.variantBytes || 0),
      });
      const uploadFocalState = readUploadFocalState(uploadEntry);
      return res.json({
        uploadId: uploadEntry.id,
        url: relativeUrl,
        fileName,
        hashSha256,
        dedupeHit: false,
        focalCrops: uploadFocalState.focalCrops,
        focalPoints: uploadFocalState.focalPoints,
        focalPoint: uploadFocalState.focalPoint,
        variants: normalizeVariants(uploadEntry.variants),
        area: uploadEntry.area || "",
        variantsGenerated,
        ...(variantGenerationError ? { variantGenerationError } : {}),
      });
    });
  }

  if (includeFocalPointRoute) {
    app.patch("/api/uploads/:id/focal-point", deps.requireAuth, async (req, res) => {
      const sessionUser = req.session.user;
      if (!canManageUploads(sessionUser?.id)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const uploadId = String(req.params?.id || "").trim();
      if (!uploadId) {
        return res.status(400).json({ error: "invalid_upload_id" });
      }
      const uploads = loadUploads();
      const targetIndex = uploads.findIndex((item) => String(item?.id || "") === uploadId);
      if (targetIndex < 0) {
        return res.status(404).json({ error: "upload_not_found" });
      }
      const current = uploads[targetIndex];
      const uploadsDir = PUBLIC_UPLOADS_DIR;
      const currentProvider = readUploadStorageProvider(current, "local");
      const stagingWorkspace = createUploadStagingWorkspace();
      let sourcePath = "";
      let sourceBuffer = null;
      try {
        if (currentProvider === "local") {
          const localSourcePath = deps.resolveUploadAbsolutePath({
            uploadsDir,
            uploadUrl: current?.url,
          });
          if (!localSourcePath || !fs.existsSync(localSourcePath)) {
            cleanupUploadStagingWorkspace(stagingWorkspace);
            return res.status(404).json({ error: "upload_file_not_found" });
          }
          sourceBuffer = fs.readFileSync(localSourcePath);
          sourcePath = writeUploadBufferToStaging({
            uploadsDir: stagingWorkspace.uploadsDir,
            uploadUrl: current?.url,
            buffer: sourceBuffer,
          });
        } else {
          const materialized = await materializeUploadEntrySourceToStaging({
            storageService: uploadStorageService,
            entry: current,
            uploadsDir: stagingWorkspace.uploadsDir,
          });
          sourceBuffer = materialized.buffer;
          sourcePath = materialized.sourcePath;
        }
      } catch {
        cleanupUploadStagingWorkspace(stagingWorkspace);
        return res.status(404).json({ error: "upload_file_not_found" });
      }
      let hashSha256 = String(current?.hashSha256 || "")
        .trim()
        .toLowerCase();
      if (!hashSha256) {
        try {
          hashSha256 = computeBufferSha256(sourceBuffer);
        } catch {
          cleanupUploadStagingWorkspace(stagingWorkspace);
          return res.status(500).json({ error: "upload_file_read_failed" });
        }
      }
      const requestedFocalPayload = extractRequestedUploadFocalPayload(req.body);
      if (
        !hasOwnField(requestedFocalPayload, "focalCrops") &&
        !hasOwnField(requestedFocalPayload, "focalPoints") &&
        !hasOwnField(requestedFocalPayload, "focalPoint")
      ) {
        cleanupUploadStagingWorkspace(stagingWorkspace);
        return res.status(400).json({ error: "invalid_focal_point" });
      }
      const nextFocalState = resolveIncomingUploadFocalState(requestedFocalPayload, current);
      const nextVersion = Math.max(1, Number(current?.variantsVersion || 0) + 1);
      let updated = null;
      try {
        updated = await attachUploadMediaMetadata({
          uploadsDir: stagingWorkspace.uploadsDir,
          entry: {
            ...current,
            storageProvider: currentProvider,
          },
          sourcePath,
          sourceMime: current?.mime,
          hashSha256,
          focalCrops: hasOwnField(requestedFocalPayload, "focalCrops")
            ? nextFocalState.focalCrops
            : undefined,
          focalPoints: nextFocalState.focalPoints,
          variantsVersion: nextVersion,
          regenerateVariants: true,
        });
        await persistUploadEntryFromStaging({
          storageService: uploadStorageService,
          entry: updated,
          uploadsDir: stagingWorkspace.uploadsDir,
          provider: currentProvider,
          cacheControl: STATIC_DEFAULT_CACHE_CONTROL,
        });
      } catch {
        cleanupUploadStagingWorkspace(stagingWorkspace);
        return res.status(500).json({ error: "focal_point_update_failed" });
      }
      cleanupUploadStagingWorkspace(stagingWorkspace);

      uploads[targetIndex] = updated;
      writeUploads(uploads);
      appendAuditLog(req, "uploads.focal_point.update", "uploads", {
        id: uploadId,
        url: updated.url,
        focalPresets: Object.keys(nextFocalState.focalPoints),
      });

      return res.json({
        ok: true,
        item: {
          id: updated.id,
          url: updated.url,
          fileName: updated.fileName,
          folder: updated.folder,
          mime: updated.mime,
          size: updated.size,
          width: updated.width,
          height: updated.height,
          hashSha256: updated.hashSha256 || "",
          focalCrops: updated.focalCrops || nextFocalState.focalCrops,
          focalPoints: updated.focalPoints || nextFocalState.focalPoints,
          focalPoint: updated.focalPoint || nextFocalState.focalPoint,
          variantsVersion: Number.isFinite(Number(updated.variantsVersion))
            ? Number(updated.variantsVersion)
            : 1,
          variants: normalizeVariants(updated.variants),
          variantBytes: Number.isFinite(Number(updated.variantBytes))
            ? Number(updated.variantBytes)
            : 0,
          area: updated.area || "",
          altText: readUploadAltText(updated),
          createdAt: updated.createdAt || null,
        },
      });
    });
  }

  if (includeAltTextRoute) {
    app.patch("/api/uploads/:id/alt-text", deps.requireAuth, (req, res) => {
      const sessionUser = req.session.user;
      if (!canManageUploads(sessionUser?.id)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const uploadId = String(req.params?.id || "").trim();
      if (!uploadId) {
        return res.status(400).json({ error: "invalid_upload_id" });
      }
      const uploads = loadUploads();
      const targetIndex = uploads.findIndex((item) => String(item?.id || "") === uploadId);
      if (targetIndex < 0) {
        return res.status(404).json({ error: "upload_not_found" });
      }
      const current = uploads[targetIndex];
      const nextAltText = String(req.body?.altText || "").trim();
      const updated = {
        ...current,
        altText: nextAltText,
      };
      uploads[targetIndex] = updated;
      writeUploads(uploads);
      appendAuditLog(req, "uploads.alt_text.update", "uploads", {
        uploadId,
        altTextLength: nextAltText.length,
      });
      return res.json({
        ok: true,
        item: {
          id: updated.id,
          url: updated.url,
          fileName: updated.fileName,
          folder: updated.folder,
          altText: readUploadAltText(updated),
          createdAt: updated.createdAt || null,
        },
      });
    });
  }
};
