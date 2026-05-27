import { Plus, Save, Trash2 } from "lucide-react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { Input } from "@/components/dashboard/dashboard-form-controls";
import ThemedSvgLogo from "@/components/ThemedSvgLogo";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { useDashboardSettingsContext } from "./dashboard-settings-context";
import {
  dashboardSettingsCardClassName,
  responsiveSvgCardDesktopRemoveButtonClass,
  responsiveSvgCardMobileRemoveButtonClass,
  responsiveSvgCardPreviewClass,
  responsiveSvgCardPreviewStatusClass,
  responsiveSvgCardRowClass,
  responsiveSvgCardUploadActionClass,
  responsiveSvgCardUploadLabelClass,
} from "./shared";

export const DashboardSettingsSocialLinksTab = () => {
  const {
    handleSaveLinkTypes,
    hasResolvedLinkTypes,
    isIconUrl,
    isSavingLinkTypes,
    linkTypes,
    setLinkTypes,
    toIconPreviewUrl,
    uploadLinkTypeIcon,
    uploadingKey,
  } = useDashboardSettingsContext();

  return (
    <TabsContent
      forceMount
      value="redes-usuarios"
      className="mt-6 space-y-6 data-[state=inactive]:hidden"
    >
      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Redes sociais (Usuários)</h2>
              <p className="text-xs text-foreground/70">Opções exibidas no editor de usuários.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={() =>
                  setLinkTypes((prev) => [
                    ...prev,
                    { id: `nova-${Date.now()}`, label: "Nova rede", icon: "globe" },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </DashboardActionButton>
              <DashboardActionButton
                type="button"
                size="sm"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSaveLinkTypes();
                }}
                disabled={!hasResolvedLinkTypes || isSavingLinkTypes}
              >
                <Save className="h-4 w-4" />
                {isSavingLinkTypes ? "Salvando..." : "Salvar"}
              </DashboardActionButton>
            </div>
          </div>

          <div className="grid gap-3">
            {linkTypes.length === 0 ? (
              <p className="text-xs text-foreground/70">Nenhuma rede cadastrada.</p>
            ) : null}
            {linkTypes.map((link, index) => {
              const isCustomIcon = isIconUrl(link.icon);
              return (
                <div
                  key={`${link.id}-${index}`}
                  className={`${responsiveSvgCardRowClass} md:grid-cols-[1fr_1.6fr_auto]`}
                >
                  <Input
                    value={link.label}
                    placeholder="Label"
                    onChange={(event) =>
                      setLinkTypes((prev) => {
                        const next = [...prev];
                        next[index] = { ...next[index], label: event.target.value };
                        return next;
                      })
                    }
                  />
                  <div className={responsiveSvgCardPreviewClass}>
                    {isCustomIcon ? (
                      <ThemedSvgLogo
                        url={toIconPreviewUrl(link.icon)}
                        label={`Ícone ${link.label}`}
                        className="h-6 w-6 text-primary"
                      />
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-card text-[10px]">
                        SVG
                      </span>
                    )}
                    <span className={responsiveSvgCardPreviewStatusClass}>
                      {isCustomIcon ? "SVG atual" : "Sem SVG"}
                    </span>
                    <div className={responsiveSvgCardUploadActionClass}>
                      <Input
                        id={`linktype-icon-${index}`}
                        type="file"
                        accept="image/svg+xml"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            uploadLinkTypeIcon(file, index);
                          }
                        }}
                        disabled={uploadingKey === `linktype-icon-${index}`}
                      />
                      <Label
                        htmlFor={`linktype-icon-${index}`}
                        className={responsiveSvgCardUploadLabelClass}
                      >
                        Escolher SVG
                      </Label>
                      <DashboardActionButton
                        type="button"
                        size="icon"
                        className={responsiveSvgCardMobileRemoveButtonClass}
                        aria-label={`Remover rede ${link.label || index + 1}`}
                        onClick={() =>
                          setLinkTypes((prev) => prev.filter((_, idx) => idx !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </DashboardActionButton>
                    </div>
                  </div>
                  <DashboardActionButton
                    type="button"
                    size="icon"
                    className={responsiveSvgCardDesktopRemoveButtonClass}
                    aria-label={`Remover rede ${link.label || index + 1}`}
                    onClick={() => setLinkTypes((prev) => prev.filter((_, idx) => idx !== index))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </DashboardActionButton>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};

export default DashboardSettingsSocialLinksTab;
