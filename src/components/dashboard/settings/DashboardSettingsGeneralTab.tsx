import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import { Combobox, Input, Textarea } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardStrongFocusFieldClassName,
  dashboardStrongFocusScopeClassName,
  dashboardStrongFocusTriggerClassName,
  dashboardStrongSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { useDashboardSettingsContext } from "./dashboard-settings-context";
import {
  brandingLogoEditorFields,
  dashboardSettingsCardClassName,
  type FooterBrandMode,
  type NavbarBrandMode,
} from "./shared";

const themeModeOptions = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
];

const navbarBrandModeOptions = [
  { value: "wordmark", label: "Wordmark" },
  { value: "symbol-text", label: "Símbolo + texto" },
  { value: "symbol", label: "Somente símbolo" },
  { value: "text", label: "Somente texto" },
];

const footerBrandModeOptions = [
  { value: "wordmark", label: "Wordmark" },
  { value: "symbol-text", label: "Símbolo + texto" },
  { value: "text", label: "Somente texto" },
];

export const DashboardSettingsGeneralTab = () => {
  const {
    footerBrandNamePreview,
    footerBrandNameUpperPreview,
    footerMode,
    navbarMode,
    navbarPreviewFallbackClass,
    navbarPreviewShellClass,
    renderLogoEditorCards,
    resolvedFooterSymbolUrl,
    resolvedFooterWordmarkUrl,
    resolvedNavbarSymbolUrl,
    resolvedNavbarWordmarkUrl,
    setSettings,
    settings,
    showNavbarSymbolPreview,
    showNavbarTextPreview,
    showWordmarkInFooterPreview,
    showWordmarkInNavbarPreview,
    siteNamePreview,
  } = useDashboardSettingsContext();

  return (
    <TabsContent forceMount value="geral" className="mt-6 space-y-6 data-[state=inactive]:hidden">
      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardFieldStack>
              <Label>Nome do site</Label>
              <Input
                value={settings.site.name}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    site: { ...prev.site, name: event.target.value },
                    footer: { ...prev.footer, brandName: event.target.value },
                  }))
                }
              />
            </DashboardFieldStack>
            <DashboardFieldStack>
              <Label>Separador do título</Label>
              <DashboardFieldStack density="compact">
                <Input
                  value={settings.site.titleSeparator || " | "}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      site: { ...prev.site, titleSeparator: event.target.value },
                    }))
                  }
                  placeholder=" | "
                />
                <p className="text-xs text-foreground/70">
                  Usado entre o título da página e o nome do site.
                </p>
              </DashboardFieldStack>
            </DashboardFieldStack>
            <DashboardFieldStack>
              <Label>Descrição curta</Label>
              <Textarea
                value={settings.site.description}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    site: { ...prev.site, description: event.target.value },
                  }))
                }
              />
            </DashboardFieldStack>
            <DashboardFieldStack>
              <Label>Cor de destaque</Label>
              <DashboardFieldStack density="compact">
                <div className="flex items-center gap-3">
                  <ColorPicker
                    label=""
                    showSwatch
                    buttonClassName={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background shadow-none transition-[border-color,background-color,color] duration-200 ${dashboardStrongSurfaceHoverClassName} focus-visible:outline-hidden ${dashboardStrongFocusFieldClassName} ${dashboardStrongFocusTriggerClassName}`}
                    panelClassName={dashboardStrongFocusScopeClassName}
                    value={settings.theme.accent || "#000000"}
                    onChange={(color) =>
                      setSettings((prev) => ({
                        ...prev,
                        theme: { ...prev.theme, accent: color.toString("hex") },
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-foreground/70">
                  Atualiza a cor principal e o accent do site.
                </p>
              </DashboardFieldStack>
            </DashboardFieldStack>
            <DashboardFieldStack>
              <Label>Card Em Progresso</Label>
              <DashboardFieldStack density="compact">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2">
                  <span className="text-sm text-foreground">
                    Usar cor de destaque no card Em Progresso
                  </span>
                  <Switch
                    checked={Boolean(settings.theme.useAccentInProgressCard)}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          useAccentInProgressCard: checked,
                        },
                      }))
                    }
                    aria-label="Usar cor de destaque no card Em Progresso"
                  />
                </div>
                <p className="text-xs text-foreground/70">
                  Quando ativado, barra e badge usam a cor temática em vez da cor da etapa.
                </p>
              </DashboardFieldStack>
            </DashboardFieldStack>
            <DashboardFieldStack>
              <Label>Tema padrão do site</Label>
              <DashboardFieldStack density="compact">
                <Combobox
                  value={settings.theme.mode || "dark"}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      theme: {
                        ...prev.theme,
                        mode: value === "light" ? "light" : "dark",
                      },
                    }))
                  }
                  ariaLabel="Selecionar tema padrão"
                  options={themeModeOptions}
                  placeholder="Selecione o tema padrão"
                  searchable={false}
                />
                <p className="text-xs text-foreground/70">
                  Define o tema padrão global. Cada usuário pode sobrescrever no cabeçalho.
                </p>
              </DashboardFieldStack>
            </DashboardFieldStack>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-background p-4">
            <div>
              <h2 className="text-lg font-semibold">Card de comunidade</h2>
              <p className="text-xs text-foreground/70">
                Configure os textos e o botão principal do card de Discord.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DashboardFieldStack>
                <Label htmlFor="community-card-title">Título do card</Label>
                <Input
                  id="community-card-title"
                  value={settings.community.inviteCard.title}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          title: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </DashboardFieldStack>

              <DashboardFieldStack>
                <Label htmlFor="community-card-button-label">Texto do botão</Label>
                <Input
                  id="community-card-button-label"
                  value={settings.community.inviteCard.ctaLabel}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          ctaLabel: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </DashboardFieldStack>

              <DashboardFieldStack className="md:col-span-2">
                <Label htmlFor="community-card-subtitle">Subtítulo</Label>
                <Textarea
                  id="community-card-subtitle"
                  value={settings.community.inviteCard.subtitle}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          subtitle: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </DashboardFieldStack>

              <DashboardFieldStack>
                <Label htmlFor="community-card-panel-title">Título do bloco interno</Label>
                <Input
                  id="community-card-panel-title"
                  value={settings.community.inviteCard.panelTitle}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          panelTitle: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </DashboardFieldStack>

              <DashboardFieldStack>
                <Label htmlFor="community-card-cta-url">URL do botão</Label>
                <Input
                  id="community-card-cta-url"
                  value={settings.community.inviteCard.ctaUrl}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          ctaUrl: event.target.value,
                        },
                      },
                    }))
                  }
                  placeholder="https://discord.com/invite/..."
                />
              </DashboardFieldStack>

              <DashboardFieldStack className="md:col-span-2">
                <Label htmlFor="community-card-panel-description">Texto do bloco interno</Label>
                <Textarea
                  id="community-card-panel-description"
                  value={settings.community.inviteCard.panelDescription}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      community: {
                        ...prev.community,
                        inviteCard: {
                          ...prev.community.inviteCard,
                          panelDescription: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </DashboardFieldStack>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Identidade da marca</h2>
              <p className="text-xs text-foreground/70">
                Todos os ativos visuais em um só lugar, com fallback e prévia rápida.
              </p>
            </div>

            {renderLogoEditorCards(brandingLogoEditorFields)}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background p-4 space-y-3">
                <Label>Exibição da marca na navbar</Label>
                <Combobox
                  value={navbarMode}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      branding: {
                        ...prev.branding,
                        display: {
                          ...prev.branding.display,
                          navbar: value as NavbarBrandMode,
                        },
                      },
                    }))
                  }
                  ariaLabel="Exibição da marca na navbar"
                  options={navbarBrandModeOptions}
                  placeholder="Selecione"
                  searchable={false}
                  className="min-w-0"
                />
                <p className="text-xs text-foreground/70">
                  Define como a identidade aparece no topo do site.
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background p-4 space-y-3">
                <Label>Exibição da marca no footer</Label>
                <Combobox
                  value={footerMode}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      branding: {
                        ...prev.branding,
                        display: {
                          ...prev.branding.display,
                          footer: value as FooterBrandMode,
                        },
                      },
                    }))
                  }
                  ariaLabel="Exibição da marca no footer"
                  options={footerBrandModeOptions}
                  placeholder="Selecione"
                  searchable={false}
                  className="min-w-0"
                />
                <p className="text-xs text-foreground/70">
                  Define como a identidade aparece no rodapé.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
                  Prévia navbar
                </p>
                <div
                  className={`mt-3 flex min-h-[68px] items-center gap-3 rounded-xl border px-4 py-3 ${navbarPreviewShellClass}`}
                >
                  {showWordmarkInNavbarPreview ? (
                    <img
                      src={resolvedNavbarWordmarkUrl}
                      alt={siteNamePreview}
                      className="h-9 w-auto max-w-[220px] object-contain"
                    />
                  ) : (
                    <>
                      {showNavbarSymbolPreview ? (
                        resolvedNavbarSymbolUrl ? (
                          <img
                            src={resolvedNavbarSymbolUrl}
                            alt="Logo principal"
                            className="h-9 w-9 rounded-full object-contain"
                          />
                        ) : (
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold ${navbarPreviewFallbackClass}`}
                          >
                            {siteNamePreview.slice(0, 1).toUpperCase()}
                          </span>
                        )
                      ) : null}
                      {showNavbarTextPreview ? (
                        <span className="text-sm font-semibold uppercase tracking-[0.2em]">
                          {siteNamePreview}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
                  Prévia footer
                </p>
                <div className="mt-3 flex min-h-[68px] items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  {showWordmarkInFooterPreview ? (
                    <img
                      src={resolvedFooterWordmarkUrl}
                      alt={footerBrandNamePreview}
                      className="h-9 w-auto max-w-[220px] object-contain"
                    />
                  ) : footerMode === "text" ? (
                    <span className="text-lg font-black tracking-widest text-gradient-rainbow">
                      {footerBrandNameUpperPreview}
                    </span>
                  ) : (
                    <>
                      {resolvedFooterSymbolUrl ? (
                        <img
                          src={resolvedFooterSymbolUrl}
                          alt="Logo do footer"
                          className="h-9 w-9 rounded-full object-contain"
                        />
                      ) : null}
                      <span className="text-lg font-black tracking-widest text-gradient-rainbow">
                        {footerBrandNameUpperPreview}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};

export default DashboardSettingsGeneralTab;
