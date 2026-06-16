import { Plus, Trash2 } from "lucide-react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { Input } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardStrongFocusFieldClassName,
  dashboardStrongFocusScopeClassName,
  dashboardStrongFocusTriggerClassName,
  dashboardStrongSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import ThemedSvgLogo from "@/components/ThemedSvgLogo";
import { Card, CardContent } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { useDashboardSettingsContext } from "./dashboard-settings-context";
import {
  dashboardSettingsCardClassName,
  responsiveSvgCardColorClass,
  responsiveSvgCardDesktopRemoveButtonClass,
  responsiveSvgCardMobileRemoveButtonClass,
  responsiveSvgCardPickerClusterClass,
  responsiveSvgCardPreviewClass,
  responsiveSvgCardPreviewStatusClass,
  responsiveSvgCardRowClass,
  responsiveSvgCardTintClass,
  responsiveSvgCardTintLabelClass,
  responsiveSvgCardUploadActionClass,
  responsiveSvgCardUploadLabelClass,
} from "./shared";

export const DashboardSettingsDownloadsTab = () => {
  const { isIconUrl, setSettings, settings, toIconPreviewUrl, uploadDownloadIcon, uploadingKey } =
    useDashboardSettingsContext();

  return (
    <TabsContent
      forceMount
      value="downloads"
      className="mt-6 space-y-6 data-[state=inactive]:hidden"
    >
      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fontes de download</h2>
              <p className="text-xs text-foreground/70">
                Ajuste nome, cor e envie o SVG do serviço para exibição nos downloads.
              </p>
            </div>
            <DashboardActionButton
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  downloads: {
                    ...prev.downloads,
                    sources: [
                      ...prev.downloads.sources,
                      {
                        id: `fonte-${Date.now()}`,
                        label: "Nova fonte",
                        color: "#64748B",
                        icon: "",
                        tintIcon: true,
                      },
                    ],
                  },
                }))
              }
            >
              <Plus className="h-4 w-4" />
            </DashboardActionButton>
          </div>

          <div className="grid gap-3">
            {settings.downloads.sources.map((source, index) => {
              const shouldTint = source.tintIcon !== false;
              return (
                <div
                  key={`${source.id}-${index}`}
                  className={`${responsiveSvgCardRowClass} md:grid-cols-[1.2fr_0.25fr_0.6fr_1.6fr_auto]`}
                >
                  <Input
                    value={source.label}
                    onChange={(event) =>
                      setSettings((prev) => {
                        const next = [...prev.downloads.sources];
                        next[index] = { ...next[index], label: event.target.value };
                        return {
                          ...prev,
                          downloads: { ...prev.downloads, sources: next },
                        };
                      })
                    }
                    placeholder="Nome"
                  />
                  <div className={responsiveSvgCardPickerClusterClass}>
                    <div className={responsiveSvgCardColorClass}>
                      <ColorPicker
                        label=""
                        showSwatch
                        buttonClassName={`inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background shadow-none transition-[border-color,background-color,color] duration-200 ${dashboardStrongSurfaceHoverClassName} focus-visible:outline-hidden md:h-9 md:w-9 ${dashboardStrongFocusFieldClassName} ${dashboardStrongFocusTriggerClassName}`}
                        panelClassName={dashboardStrongFocusScopeClassName}
                        value={source.color}
                        onChange={(color) =>
                          setSettings((prev) => {
                            const next = [...prev.downloads.sources];
                            next[index] = {
                              ...next[index],
                              color: color.toString("hex"),
                            };
                            return {
                              ...prev,
                              downloads: { ...prev.downloads, sources: next },
                            };
                          })
                        }
                      />
                    </div>
                    <div className={responsiveSvgCardTintClass}>
                      <span className={responsiveSvgCardTintLabelClass}>Aplicar ao ícone</span>
                      <Switch
                        checked={shouldTint}
                        onCheckedChange={(checked) =>
                          setSettings((prev) => {
                            const next = [...prev.downloads.sources];
                            next[index] = { ...next[index], tintIcon: checked };
                            return {
                              ...prev,
                              downloads: { ...prev.downloads, sources: next },
                            };
                          })
                        }
                        aria-label={`Colorir SVG de ${source.label}`}
                      />
                    </div>
                  </div>
                  <div className={responsiveSvgCardPreviewClass}>
                    {isIconUrl(source.icon) ? (
                      shouldTint ? (
                        <ThemedSvgLogo
                          url={toIconPreviewUrl(source.icon)}
                          label={`Ícone ${source.label}`}
                          className="h-6 w-6 rounded bg-card/90 p-1"
                          color={source.color}
                        />
                      ) : (
                        <img
                          src={toIconPreviewUrl(source.icon)}
                          alt={`Ícone ${source.label}`}
                          className="h-6 w-6 rounded bg-card/90 p-1"
                        />
                      )
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-card text-[10px]">
                        SVG
                      </span>
                    )}
                    <span className={responsiveSvgCardPreviewStatusClass}>
                      {isIconUrl(source.icon) ? "SVG atual" : "Sem SVG"}
                    </span>
                    <div className={responsiveSvgCardUploadActionClass}>
                      <Input
                        id={`download-icon-${index}`}
                        type="file"
                        accept="image/svg+xml"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            uploadDownloadIcon(file, index);
                          }
                        }}
                        disabled={uploadingKey === `download-icon-${index}`}
                      />
                      <Label
                        htmlFor={`download-icon-${index}`}
                        className={responsiveSvgCardUploadLabelClass}
                      >
                        Escolher SVG
                      </Label>
                      <DashboardActionButton
                        type="button"
                        size="icon"
                        aria-label="Remover fonte de download"
                        className={responsiveSvgCardMobileRemoveButtonClass}
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            downloads: {
                              ...prev.downloads,
                              sources: prev.downloads.sources.filter((_, idx) => idx !== index),
                            },
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </DashboardActionButton>
                    </div>
                  </div>
                  <DashboardActionButton
                    type="button"
                    size="icon"
                    aria-label="Remover fonte de download"
                    className={responsiveSvgCardDesktopRemoveButtonClass}
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        downloads: {
                          ...prev.downloads,
                          sources: prev.downloads.sources.filter((_, idx) => idx !== index),
                        },
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
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

export default DashboardSettingsDownloadsTab;
