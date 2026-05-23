import { toast } from "@/components/ui/use-toast";
import { refetchPublicBootstrapCache } from "@/hooks/use-public-bootstrap";
import { parseAniListMediaId } from "@/lib/anilist";
import { apiFetch } from "@/lib/api-client";
import { buildEpisodeKey } from "@/lib/project-episode-key";
import { resolveProjectEpisodePublicationErrorState } from "@/lib/project-publication";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback } from "react";
import type { AniListMedia, ProjectForm, ProjectRecord } from "./dashboard-projects-editor-types";
import { buildProjectFormPatchFromAniList } from "./project-editor-anilist";
import { buildProjectSavePayload, prepareProjectSaveState } from "./project-editor-form";

type UseDashboardProjectsEditorPersistenceOptions = {
  anilistIdInput: string;
  apiBase: string;
  closeEditor: () => void;
  deleteTarget: ProjectRecord | null;
  editingProject: ProjectRecord | null;
  episodeSizeDrafts: Record<number, string>;
  episodeSizeErrors: Record<number, string>;
  episodeSizeInputRefs: MutableRefObject<Record<number, HTMLInputElement | null>>;
  formState: ProjectForm;
  markEditorSnapshot: (snapshot: ProjectForm, anilistIdInput: string) => void;
  projects: ProjectRecord[];
  refreshProjects: () => void;
  restoreWindowMs: number;
  revealEpisodeAtIndex: (index: number) => void;
  setDeleteTarget: Dispatch<SetStateAction<ProjectRecord | null>>;
  setEditorAccordionValue: Dispatch<SetStateAction<string[]>>;
  setEpisodeSizeDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  setEpisodeSizeErrors: Dispatch<SetStateAction<Record<number, string>>>;
  setFormState: Dispatch<SetStateAction<ProjectForm>>;
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>;
  staffMemberInput: Record<number, string>;
};

type UseDashboardProjectsEditorPersistenceResult = {
  getRestoreRemainingLabel: (project: ProjectRecord) => string;
  handleDelete: () => Promise<void>;
  handleImportAniList: () => Promise<void>;
  handleRestoreProject: (project: ProjectRecord) => Promise<void>;
  handleSave: () => Promise<void>;
  isRestorable: (project: ProjectRecord) => boolean;
};

const logProjectSaveFailure = (error: unknown) => {
  if (!import.meta.env.DEV || import.meta.env.VITEST) {
    return;
  }
  console.error("project_save_failed", error);
};

export const useDashboardProjectsEditorPersistence = ({
  anilistIdInput,
  apiBase,
  closeEditor,
  deleteTarget,
  editingProject,
  episodeSizeDrafts,
  episodeSizeErrors,
  episodeSizeInputRefs,
  formState,
  markEditorSnapshot,
  projects,
  refreshProjects,
  restoreWindowMs,
  revealEpisodeAtIndex,
  setDeleteTarget,
  setEditorAccordionValue,
  setEpisodeSizeDrafts,
  setEpisodeSizeErrors,
  setFormState,
  setProjects,
  staffMemberInput,
}: UseDashboardProjectsEditorPersistenceOptions): UseDashboardProjectsEditorPersistenceResult => {
  const mapAniListToForm = useCallback(
    (media: AniListMedia) => {
      let syncGenres: string[] = [];
      let syncTags: string[] = [];

      setFormState((prev) => {
        const {
          patch,
          syncGenres: nextSyncGenres,
          syncTags: nextSyncTags,
        } = buildProjectFormPatchFromAniList({
          media,
          previousForm: prev,
          projects,
        });
        syncGenres = nextSyncGenres;
        syncTags = nextSyncTags;
        return {
          ...prev,
          ...patch,
        };
      });

      if (syncTags.length || syncGenres.length) {
        apiFetch(apiBase, "/api/tag-translations/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          auth: true,
          body: JSON.stringify({ tags: syncTags, genres: syncGenres }),
        }).catch(() => undefined);
      }
    },
    [apiBase, projects, setFormState],
  );

  const handleSave = useCallback(async () => {
    const savePreparation = prepareProjectSaveState({
      editingProject,
      episodeSizeDrafts,
      episodeSizeErrors,
      formState,
    });
    if (!savePreparation.ok) {
      if (savePreparation.code === "title_required") {
        toast({
          title: "Preencha o título do projeto",
          description: "O título é obrigatório para salvar.",
          variant: "destructive",
        });
        return;
      }

      if (savePreparation.code === "discord_role_invalid") {
        toast({
          title: "Cargo Discord inválido",
          description: "Use apenas números no campo de cargo Discord.",
          variant: "destructive",
        });
        return;
      }

      if (savePreparation.code === "duplicate_episode") {
        setEditorAccordionValue((prev) =>
          prev.includes("episodios") ? prev : [...prev, "episodios"],
        );
        const duplicateEpisodeIndex = savePreparation.duplicateEpisodeIndex;
        if (typeof duplicateEpisodeIndex === "number" && Number.isInteger(duplicateEpisodeIndex)) {
          revealEpisodeAtIndex(duplicateEpisodeIndex);
        }
        toast({
          title: "Capítulos duplicados",
          description: "Cada capítulo precisa ter uma combinação única de número e volume.",
          variant: "destructive",
        });
        return;
      }

      if (savePreparation.code === "duplicate_volume") {
        setEditorAccordionValue((prev) =>
          prev.includes("episodios") ? prev : [...prev, "episodios"],
        );
        toast({
          title: "Volumes duplicados",
          description: "Cada volume pode aparecer apenas uma vez.",
          variant: "destructive",
        });
        return;
      }

      if (
        savePreparation.code === "download_sources_required_for_publication" ||
        savePreparation.code === "reader_content_or_download_required_for_publication"
      ) {
        setEditorAccordionValue((prev) =>
          prev.includes("episodios") ? prev : [...prev, "episodios"],
        );
        const invalidPublishedEpisodeIndex = savePreparation.invalidPublishedEpisodeIndex;
        if (
          typeof invalidPublishedEpisodeIndex === "number" &&
          Number.isInteger(invalidPublishedEpisodeIndex)
        ) {
          revealEpisodeAtIndex(invalidPublishedEpisodeIndex);
        }
        const publicationFailure = resolveProjectEpisodePublicationErrorState(
          formState.type || "",
          savePreparation.code,
        );
        toast({
          title: publicationFailure?.title || "Não foi possível publicar o episódio",
          description:
            publicationFailure?.description ||
            "Revise o episódio antes de tentar salvar novamente.",
          variant: "destructive",
        });
        return;
      }

      setEpisodeSizeDrafts(savePreparation.nextEpisodeSizeDrafts);
      setEpisodeSizeErrors(savePreparation.nextEpisodeSizeErrors);
      toast({
        title: "Corrija os tamanhos inválidos",
        description: "Use valores como 700 MB ou 1.4 GB antes de salvar.",
      });
      const firstInvalidEpisodeSizeIndex = savePreparation.firstInvalidEpisodeSizeIndex;
      if (
        typeof firstInvalidEpisodeSizeIndex === "number" &&
        Number.isInteger(firstInvalidEpisodeSizeIndex)
      ) {
        episodeSizeInputRefs.current[firstInvalidEpisodeSizeIndex]?.focus();
      }
      return;
    }

    const {
      nextEpisodeSizeDrafts,
      normalizedDiscordRoleId,
      normalizedEpisodesForSave,
      normalizedTitle,
      normalizedVolumeEntriesForSave,
    } = savePreparation;

    setEpisodeSizeDrafts(nextEpisodeSizeDrafts);
    setEpisodeSizeErrors({});

    const payload = buildProjectSavePayload({
      anilistIdInput,
      editingProject,
      formState: {
        ...formState,
        title: normalizedTitle,
        discordRoleId: normalizedDiscordRoleId || "",
      },
      normalizedEpisodesForSave,
      normalizedVolumeEntriesForSave,
      staffMemberInput,
    });

    try {
      const response = await apiFetch(
        apiBase,
        editingProject ? `/api/projects/${editingProject.id}` : "/api/projects",
        {
          method: editingProject ? "PUT" : "POST",
          auth: true,
          json: payload,
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const code = typeof data?.error === "string" ? data.error : "";
        if (code === "title_and_id_required") {
          toast({
            title: "Campos obrigatórios ausentes",
            description: "Informe título e identificador do projeto.",
            variant: "destructive",
          });
          return;
        }
        if (code === "id_exists") {
          toast({
            title: "Identificador já existe",
            description: "Use outro ID para criar o projeto.",
            variant: "destructive",
          });
          return;
        }
        if (code === "forbidden") {
          toast({
            title: "Acesso negado",
            description: "Você não tem permissão para salvar projetos.",
            variant: "destructive",
          });
          return;
        }
        if (code === "duplicate_episode_key") {
          const duplicateKey = String(data?.key || "");
          const duplicateIndex = normalizedEpisodesForSave.findIndex(
            (episode) => buildEpisodeKey(episode.number, episode.volume) === duplicateKey,
          );
          setEditorAccordionValue((prev) =>
            prev.includes("episodios") ? prev : [...prev, "episodios"],
          );
          if (duplicateIndex >= 0) {
            revealEpisodeAtIndex(duplicateIndex);
          }
          toast({
            title: "Capítulos duplicados",
            description:
              "O servidor bloqueou o save porque existe mais de um capítulo com o mesmo número e volume.",
            variant: "destructive",
          });
          return;
        }
        if (code === "duplicate_volume_cover_key") {
          setEditorAccordionValue((prev) =>
            prev.includes("episodios") ? prev : [...prev, "episodios"],
          );
          toast({
            title: "Volumes duplicados",
            description:
              "O servidor bloqueou o save porque existe mais de uma entrada para o mesmo volume.",
            variant: "destructive",
          });
          return;
        }
        if (
          code === "download_sources_required_for_publication" ||
          code === "reader_content_or_download_required_for_publication"
        ) {
          const invalidKey = String(data?.key || "");
          const invalidIndex = normalizedEpisodesForSave.findIndex(
            (episode) => buildEpisodeKey(episode.number, episode.volume) === invalidKey,
          );
          setEditorAccordionValue((prev) =>
            prev.includes("episodios") ? prev : [...prev, "episodios"],
          );
          if (invalidIndex >= 0) {
            revealEpisodeAtIndex(invalidIndex);
          }
          const publicationFailure = resolveProjectEpisodePublicationErrorState(
            formState.type || "",
            code,
          );
          toast({
            title: publicationFailure?.title || "Não foi possível publicar o episódio",
            description:
              publicationFailure?.description ||
              "Revise o episódio antes de tentar salvar novamente.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Não foi possível salvar o projeto",
          description: "Tente novamente em alguns instantes.",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      if (data?.project) {
        setFormState(data.project);
      }
      if (editingProject) {
        setProjects((prev) =>
          prev.map((project) => (project.id === editingProject.id ? data.project : project)),
        );
      } else {
        setProjects((prev) => [...prev, data.project]);
      }
      markEditorSnapshot((data?.project || payload) as ProjectForm, anilistIdInput);
      toast({
        title: editingProject ? "Projeto atualizado" : "Projeto criado",
        description: "As alterações foram salvas com sucesso.",
        intent: "success",
      });
      void refetchPublicBootstrapCache(apiBase).catch(() => undefined);
      closeEditor();
    } catch (error) {
      logProjectSaveFailure(error);
      toast({
        title: "Não foi possível salvar o projeto",
        description: "A solicitação falhou antes de receber uma resposta do servidor.",
        variant: "destructive",
      });
    }
  }, [
    anilistIdInput,
    apiBase,
    closeEditor,
    editingProject,
    episodeSizeDrafts,
    episodeSizeErrors,
    episodeSizeInputRefs,
    formState,
    markEditorSnapshot,
    revealEpisodeAtIndex,
    setEditorAccordionValue,
    setEpisodeSizeDrafts,
    setEpisodeSizeErrors,
    setFormState,
    setProjects,
    staffMemberInput,
  ]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    const response = await apiFetch(apiBase, `/api/projects/${deleteTarget.id}`, {
      method: "DELETE",
      auth: true,
    });
    if (!response.ok) {
      toast({
        title: "Não foi possível excluir o projeto",
        variant: "destructive",
      });
      return;
    }
    await refreshProjects();
    setDeleteTarget(null);
    if (editingProject && deleteTarget.id === editingProject.id) {
      closeEditor();
    }
    toast({
      title: "Projeto movido para a lixeira",
      description: "Você pode restaurar por 3 dias.",
    });
    void refetchPublicBootstrapCache(apiBase).catch(() => undefined);
  }, [apiBase, closeEditor, deleteTarget, editingProject, refreshProjects, setDeleteTarget]);

  const isRestorable = useCallback(
    (project: ProjectRecord) => {
      if (!project.deletedAt) {
        return false;
      }
      const ts = new Date(project.deletedAt).getTime();
      if (!Number.isFinite(ts)) {
        return false;
      }
      return Date.now() - ts <= restoreWindowMs;
    },
    [restoreWindowMs],
  );

  const getRestoreRemainingLabel = useCallback(
    (project: ProjectRecord) => {
      if (!project.deletedAt) {
        return "";
      }
      const ts = new Date(project.deletedAt).getTime();
      if (!Number.isFinite(ts)) {
        return "";
      }
      const remainingMs = restoreWindowMs - (Date.now() - ts);
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
      if (remainingDays <= 1) {
        return "1 dia";
      }
      return `${remainingDays} dias`;
    },
    [restoreWindowMs],
  );

  const handleRestoreProject = useCallback(
    async (project: ProjectRecord) => {
      const response = await apiFetch(apiBase, `/api/projects/${project.id}/restore`, {
        method: "POST",
        auth: true,
      });
      if (!response.ok) {
        if (response.status === 410) {
          toast({ title: "Janela de restauração expirou" });
          await refreshProjects();
          return;
        }
        toast({ title: "Não foi possível restaurar o projeto", variant: "destructive" });
        return;
      }
      const data = await response.json();
      setProjects((prev) => prev.map((item) => (item.id === project.id ? data.project : item)));
      toast({ title: "Projeto restaurado" });
      void refetchPublicBootstrapCache(apiBase).catch(() => undefined);
    },
    [apiBase, refreshProjects, setProjects],
  );

  const handleImportAniList = useCallback(async () => {
    const id = parseAniListMediaId(anilistIdInput);
    if (id === null) {
      toast({
        title: "ID do AniList inválido",
        description: "Informe um ID ou URL válida do AniList antes de importar.",
        variant: "destructive",
      });
      return;
    }
    const response = await apiFetch(apiBase, `/api/anilist/${id}`, { auth: true });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const code = typeof data?.error === "string" ? data.error : "";
      if (code === "invalid_id") {
        toast({
          title: "ID do AniList inválido",
          description: "Não foi possível buscar esse identificador.",
          variant: "destructive",
        });
        return;
      }
      if (code === "forbidden") {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para usar a integração do AniList.",
          variant: "destructive",
        });
        return;
      }
      if (code === "anilist_failed") {
        toast({
          title: "Falha ao importar do AniList",
          description: "A API externa não respondeu como esperado.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Não foi possível importar do AniList",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
      return;
    }
    const data = await response.json();
    const media = data?.data?.Media as AniListMedia | undefined;
    if (!media) {
      toast({
        title: "AniList sem resultados",
        description: "Nenhuma mídia foi encontrada para esse ID.",
        variant: "destructive",
      });
      return;
    }
    mapAniListToForm(media);
    toast({
      title: "Dados importados do AniList",
      description: "Campos do projeto foram preenchidos automaticamente.",
      intent: "success",
    });
  }, [anilistIdInput, apiBase, mapAniListToForm]);

  return {
    getRestoreRemainingLabel,
    handleDelete,
    handleImportAniList,
    handleRestoreProject,
    handleSave,
    isRestorable,
  };
};
