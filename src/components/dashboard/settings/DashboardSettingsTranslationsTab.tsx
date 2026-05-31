import { Download, Plus, Save, Trash2 } from "lucide-react";
import type { UIEvent } from "react";
import { useState } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { Input } from "@/components/dashboard/dashboard-form-controls";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { useDashboardSettingsContext } from "./dashboard-settings-context";
import {
  dashboardSettingsCardClassName,
  responsiveTranslationActionColClass,
  responsiveTranslationTableClass,
  responsiveTranslationTermColClass,
  responsiveTranslationValueColClass,
} from "./shared";

export const DashboardSettingsTranslationsTab = () => {
  const {
    filteredGenres,
    filteredStaffRoles,
    filteredTags,
    genreQuery,
    genreTranslations,
    handleSaveTranslations,
    hasResolvedTranslations,
    isSavingTranslations,
    isSyncingAniList,
    newGenre,
    newStaffRole,
    newTag,
    setGenreQuery,
    setGenreTranslations,
    setNewGenre,
    setNewStaffRole,
    setNewTag,
    setStaffRoleQuery,
    setStaffRoleTranslations,
    setTagQuery,
    setTagTranslations,
    staffRoleQuery,
    staffRoleTranslations,
    syncAniListTerms,
    tagQuery,
    tagTranslations,
  } = useDashboardSettingsContext();
  const translationBatchSize = 80;
  const translationAutoLoadOffset = 160;
  const [visibleCounts, setVisibleCounts] = useState({
    genres: translationBatchSize,
    staffRoles: translationBatchSize,
    tags: translationBatchSize,
  });
  const visibleTags = filteredTags.slice(0, visibleCounts.tags);
  const visibleGenres = filteredGenres.slice(0, visibleCounts.genres);
  const visibleStaffRoles = filteredStaffRoles.slice(0, visibleCounts.staffRoles);
  const hasHiddenTags = filteredTags.length > visibleTags.length;
  const handleTagsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasHiddenTags) {
      return;
    }

    const listElement = event.currentTarget;
    const remainingScroll =
      listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;

    if (remainingScroll <= translationAutoLoadOffset) {
      setVisibleCounts((prev) => ({
        ...prev,
        tags: Math.min(prev.tags + translationBatchSize, filteredTags.length),
      }));
    }
  };

  return (
    <TabsContent
      forceMount
      value="traducoes"
      className="mt-6 space-y-6 data-[state=inactive]:hidden"
    >
      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Tags</h2>
              <p className="text-xs text-foreground/70">
                Termos em inglês importados do AniList com a tradução exibida no site.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={() => syncAniListTerms()}
                disabled={isSyncingAniList}
              >
                <Download className="h-4 w-4" />
                {isSyncingAniList ? "Importando..." : "Importar AniList"}
              </DashboardActionButton>
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSaveTranslations();
                }}
                disabled={!hasResolvedTranslations || isSavingTranslations}
              >
                <Save className="h-4 w-4" />
                {isSavingTranslations ? "Salvando..." : "Salvar traduções"}
              </DashboardActionButton>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="Buscar tag"
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
              />
              <DashboardActionButton
                type="button"
                tone="primary"
                aria-label="Adicionar tag"
                onClick={() => {
                  const value = newTag.trim();
                  if (!value || tagTranslations[value] !== undefined) {
                    return;
                  }
                  setTagTranslations((prev) => ({ ...prev, [value]: "" }));
                  setNewTag("");
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </DashboardActionButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70">
            {filteredTags.length === 0 ? (
              <p className="px-4 py-3 text-xs text-foreground/70">Nenhuma tag encontrada.</p>
            ) : (
              <div
                className="max-h-[420px] overflow-auto no-scrollbar"
                role="region"
                aria-label="Lista de traduções de tags"
                onScroll={handleTagsScroll}
              >
                <table className={responsiveTranslationTableClass}>
                  <colgroup>
                    <col className={responsiveTranslationTermColClass} />
                    <col className={responsiveTranslationValueColClass} />
                    <col className={responsiveTranslationActionColClass} />
                  </colgroup>
                  <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-foreground/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Termo (AniList)</th>
                      <th className="px-4 py-3 text-left font-medium">Tradução</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleTags.map((tag) => (
                      <tr key={tag} className="bg-background">
                        <td className="px-4 py-3 font-medium text-foreground">{tag}</td>
                        <td className="px-4 py-3">
                          <Input
                            value={tagTranslations[tag] || ""}
                            placeholder={tag}
                            onChange={(event) =>
                              setTagTranslations((prev) => ({
                                ...prev,
                                [tag]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DashboardActionButton
                            size="icon"
                            aria-label={`Remover tradução da tag ${tag}`}
                            onClick={() =>
                              setTagTranslations((prev) => {
                                const next = { ...prev };
                                delete next[tag];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </DashboardActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gêneros</h2>
              <p className="text-xs text-foreground/70">
                Termos em inglês importados do AniList com a tradução exibida no site.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={() => syncAniListTerms()}
                disabled={isSyncingAniList}
              >
                <Download className="h-4 w-4" />
                {isSyncingAniList ? "Importando..." : "Importar AniList"}
              </DashboardActionButton>
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSaveTranslations();
                }}
                disabled={!hasResolvedTranslations || isSavingTranslations}
              >
                <Save className="h-4 w-4" />
                {isSavingTranslations ? "Salvando..." : "Salvar traduções"}
              </DashboardActionButton>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="Buscar gênero"
              value={genreQuery}
              onChange={(event) => setGenreQuery(event.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Novo gênero"
                value={newGenre}
                onChange={(event) => setNewGenre(event.target.value)}
              />
              <DashboardActionButton
                type="button"
                tone="primary"
                aria-label="Adicionar gênero"
                onClick={() => {
                  const value = newGenre.trim();
                  if (!value || genreTranslations[value] !== undefined) {
                    return;
                  }
                  setGenreTranslations((prev) => ({ ...prev, [value]: "" }));
                  setNewGenre("");
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </DashboardActionButton>
            </div>
          </div>
          {filteredGenres.length > visibleGenres.length ? (
            <div className="flex justify-end">
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={() =>
                  setVisibleCounts((prev) => ({
                    ...prev,
                    genres: prev.genres + translationBatchSize,
                  }))
                }
              >
                Mostrar mais
              </DashboardActionButton>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-border/70">
            {filteredGenres.length === 0 ? (
              <p className="px-4 py-3 text-xs text-foreground/70">Nenhum gênero encontrado.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto no-scrollbar">
                <table className={responsiveTranslationTableClass}>
                  <colgroup>
                    <col className={responsiveTranslationTermColClass} />
                    <col className={responsiveTranslationValueColClass} />
                    <col className={responsiveTranslationActionColClass} />
                  </colgroup>
                  <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-foreground/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Termo (AniList)</th>
                      <th className="px-4 py-3 text-left font-medium">Tradução</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleGenres.map((genre) => (
                      <tr key={genre} className="bg-background">
                        <td className="px-4 py-3 font-medium text-foreground">{genre}</td>
                        <td className="px-4 py-3">
                          <Input
                            value={genreTranslations[genre] || ""}
                            placeholder={genre}
                            onChange={(event) =>
                              setGenreTranslations((prev) => ({
                                ...prev,
                                [genre]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DashboardActionButton
                            size="icon"
                            aria-label={`Remover tradução do gênero ${genre}`}
                            onClick={() =>
                              setGenreTranslations((prev) => {
                                const next = { ...prev };
                                delete next[genre];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </DashboardActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Cargos do AniList</h2>
              <p className="text-xs text-foreground/70">
                Traduza funções da equipe do anime exibidas no projeto.
              </p>
            </div>
            <DashboardActionButton
              type="button"
              size="sm"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleSaveTranslations();
              }}
              disabled={!hasResolvedTranslations || isSavingTranslations}
            >
              <Save className="h-4 w-4" />
              {isSavingTranslations ? "Salvando..." : "Salvar traduções"}
            </DashboardActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="Buscar cargo"
              value={staffRoleQuery}
              onChange={(event) => setStaffRoleQuery(event.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Novo cargo"
                value={newStaffRole}
                onChange={(event) => setNewStaffRole(event.target.value)}
              />
              <DashboardActionButton
                type="button"
                tone="primary"
                aria-label="Adicionar cargo"
                onClick={() => {
                  const value = newStaffRole.trim();
                  if (!value || staffRoleTranslations[value] !== undefined) {
                    return;
                  }
                  setStaffRoleTranslations((prev) => ({ ...prev, [value]: "" }));
                  setNewStaffRole("");
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </DashboardActionButton>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/70">
            <span>
              Mostrando {visibleStaffRoles.length} de {filteredStaffRoles.length} cargos.
              {filteredStaffRoles.length > visibleStaffRoles.length
                ? " Refine a busca ou carregue mais resultados."
                : ""}
            </span>
            {filteredStaffRoles.length > visibleStaffRoles.length ? (
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={() =>
                  setVisibleCounts((prev) => ({
                    ...prev,
                    staffRoles: prev.staffRoles + translationBatchSize,
                  }))
                }
              >
                Mostrar mais
              </DashboardActionButton>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70">
            {filteredStaffRoles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-foreground/70">Nenhum cargo encontrado.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto no-scrollbar">
                <table className={responsiveTranslationTableClass}>
                  <colgroup>
                    <col className={responsiveTranslationTermColClass} />
                    <col className={responsiveTranslationValueColClass} />
                    <col className={responsiveTranslationActionColClass} />
                  </colgroup>
                  <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-foreground/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Termo (AniList)</th>
                      <th className="px-4 py-3 text-left font-medium">Tradução</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleStaffRoles.map((role) => (
                      <tr key={role} className="bg-background">
                        <td className="px-4 py-3 font-medium text-foreground">{role}</td>
                        <td className="px-4 py-3">
                          <Input
                            value={staffRoleTranslations[role] || ""}
                            placeholder={role}
                            onChange={(event) =>
                              setStaffRoleTranslations((prev) => ({
                                ...prev,
                                [role]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DashboardActionButton
                            size="icon"
                            aria-label={`Remover tradução do cargo ${role}`}
                            onClick={() =>
                              setStaffRoleTranslations((prev) => {
                                const next = { ...prev };
                                delete next[role];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </DashboardActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};

export default DashboardSettingsTranslationsTab;
