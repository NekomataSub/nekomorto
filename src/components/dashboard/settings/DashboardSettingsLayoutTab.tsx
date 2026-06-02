import { GripVertical, Link2, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import { Combobox, Input, Textarea } from "@/components/dashboard/dashboard-form-controls";
import ReorderControls from "@/components/ReorderControls";
import { Card, CardContent } from "@/components/ui/card";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { navbarIconOptions } from "@/lib/navbar-icons";
import { useDashboardSettingsContext } from "./dashboard-settings-context";
import {
  dashboardSettingsCardClassName,
  responsiveCompactRowDeleteButtonClass,
  responsiveCompactSelfEndDeleteButtonClass,
  responsiveCompactTextareaRowClass,
  responsiveFooterCardShellClass,
  responsiveFooterSocialDesktopRemoveButtonClass,
  responsiveFooterSocialDragButtonClass,
  responsiveFooterSocialTopRowClass,
  responsiveSvgCardMobileRemoveButtonClass,
  responsiveSvgCardRowClass,
  socialIconMap,
} from "./shared";

const layoutNavbarIconOptions: ComboboxOption[] = navbarIconOptions.map((option) => ({
  value: option.id,
  label: option.label,
  icon: option.icon,
}));

const layoutFooterSocialGridClass =
  "grid gap-3 md:grid-cols-[auto_auto_minmax(180px,0.95fr)_minmax(260px,1.55fr)_auto] md:items-center";

export const DashboardSettingsLayoutTab = () => {
  const {
    clearFooterSocialDragState,
    footerSocialDragOverIndex,
    handleFooterSocialDragOver,
    handleFooterSocialDragStart,
    handleFooterSocialDrop,
    linkTypes,
    moveFooterSocialLink,
    setSettings,
    settings,
  } = useDashboardSettingsContext();
  const footerSocialOptions = useMemo<ComboboxOption[]>(
    () =>
      linkTypes.map((option) => ({
        value: option.icon || option.id,
        label: option.label,
        icon: socialIconMap[option.id] || Link2,
      })),
    [linkTypes],
  );

  return (
    <TabsContent forceMount value="layout" className="mt-6 space-y-6 data-[state=inactive]:hidden">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Header / Navegação</h2>
        <p className="text-xs text-foreground/70">
          Links principais e estrutura da moldura pública do site.
        </p>
      </div>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Links do menu</h2>
              <p className="text-xs text-foreground/70">Ordem e URLs usados na navbar do site.</p>
            </div>
            <DashboardActionButton
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  navbar: {
                    ...prev.navbar,
                    links: [...prev.navbar.links, { label: "Novo link", href: "/", icon: "link" }],
                  },
                }))
              }
            >
              <Plus className="h-4 w-4" />
            </DashboardActionButton>
          </div>

          <div className="grid gap-3">
            {settings.navbar.links.map((link, index) => (
              <div
                key={`${link.label}-${index}`}
                className={`${responsiveSvgCardRowClass} md:grid-cols-[0.85fr_1fr_1.6fr_auto]`}
              >
                <Combobox
                  ariaLabel={`Ícone do link ${link.label || index + 1}`}
                  value={link.icon || "link"}
                  options={layoutNavbarIconOptions}
                  searchable={false}
                  onValueChange={(nextIcon) =>
                    setSettings((prev) => {
                      const nextLinks = [...prev.navbar.links];
                      nextLinks[index] = {
                        ...nextLinks[index],
                        icon: nextIcon,
                      };
                      return {
                        ...prev,
                        navbar: { ...prev.navbar, links: nextLinks },
                      };
                    })
                  }
                  className="min-w-0 w-full"
                />
                <Input
                  value={link.label}
                  placeholder="Label"
                  onChange={(event) =>
                    setSettings((prev) => {
                      const nextLinks = [...prev.navbar.links];
                      nextLinks[index] = {
                        ...nextLinks[index],
                        label: event.target.value,
                      };
                      return {
                        ...prev,
                        navbar: { ...prev.navbar, links: nextLinks },
                      };
                    })
                  }
                />
                <Input
                  className="min-w-0"
                  value={link.href}
                  placeholder="URL ou rota"
                  onChange={(event) =>
                    setSettings((prev) => {
                      const nextLinks = [...prev.navbar.links];
                      nextLinks[index] = {
                        ...nextLinks[index],
                        href: event.target.value,
                      };
                      return {
                        ...prev,
                        navbar: { ...prev.navbar, links: nextLinks },
                      };
                    })
                  }
                />
                <DashboardActionButton
                  type="button"
                  size="icon"
                  className={responsiveCompactRowDeleteButtonClass}
                  aria-label="Remover link da navbar"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      navbar: {
                        ...prev.navbar,
                        links: prev.navbar.links.filter((_, idx) => idx !== index),
                      },
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </DashboardActionButton>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Footer</h2>
        <p className="text-xs text-foreground/70">
          Conteúdo institucional, redes sociais e textos exibidos no rodapé.
        </p>
      </div>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-4 p-4 md:space-y-6 md:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Conteúdo do footer</h2>
          </div>
          <DashboardFieldStack>
            <Label>Descrição</Label>
            <Textarea
              value={settings.footer.brandDescription}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  footer: {
                    ...prev.footer,
                    brandDescription: event.target.value,
                  },
                }))
              }
            />
          </DashboardFieldStack>
        </CardContent>
      </Card>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-4 p-4 md:space-y-6 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Colunas de links</h2>
              <p className="text-xs text-foreground/70">Edite as seções do footer.</p>
            </div>
            <DashboardActionButton
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  footer: {
                    ...prev.footer,
                    columns: [...prev.footer.columns, { title: "Nova coluna", links: [] }],
                  },
                }))
              }
            >
              <Plus className="h-4 w-4" />
            </DashboardActionButton>
          </div>

          <div className="grid gap-6">
            {settings.footer.columns.map((column, columnIndex) => (
              <div
                key={`${column.title}-${columnIndex}`}
                className={responsiveFooterCardShellClass}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    className="w-full min-w-0"
                    value={column.title}
                    onChange={(event) =>
                      setSettings((prev) => {
                        const next = [...prev.footer.columns];
                        next[columnIndex] = {
                          ...next[columnIndex],
                          title: event.target.value,
                        };
                        return {
                          ...prev,
                          footer: { ...prev.footer, columns: next },
                        };
                      })
                    }
                  />
                  <DashboardActionButton
                    type="button"
                    size="icon"
                    className={responsiveCompactSelfEndDeleteButtonClass}
                    aria-label="Remover coluna do footer"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        footer: {
                          ...prev.footer,
                          columns: prev.footer.columns.filter((_, idx) => idx !== columnIndex),
                        },
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </DashboardActionButton>
                </div>
                <div className="grid gap-3">
                  {column.links.map((link, linkIndex) => (
                    <div
                      key={`${link.label}-${linkIndex}`}
                      className={`${responsiveSvgCardRowClass} md:grid-cols-[1fr_1.6fr_auto]`}
                    >
                      <Input
                        value={link.label}
                        placeholder="Label"
                        onChange={(event) =>
                          setSettings((prev) => {
                            const nextColumns = [...prev.footer.columns];
                            const links = [...nextColumns[columnIndex].links];
                            links[linkIndex] = {
                              ...links[linkIndex],
                              label: event.target.value,
                            };
                            nextColumns[columnIndex] = {
                              ...nextColumns[columnIndex],
                              links,
                            };
                            return {
                              ...prev,
                              footer: { ...prev.footer, columns: nextColumns },
                            };
                          })
                        }
                      />
                      <Input
                        value={link.href}
                        placeholder="URL"
                        onChange={(event) =>
                          setSettings((prev) => {
                            const nextColumns = [...prev.footer.columns];
                            const links = [...nextColumns[columnIndex].links];
                            links[linkIndex] = {
                              ...links[linkIndex],
                              href: event.target.value,
                            };
                            nextColumns[columnIndex] = {
                              ...nextColumns[columnIndex],
                              links,
                            };
                            return {
                              ...prev,
                              footer: { ...prev.footer, columns: nextColumns },
                            };
                          })
                        }
                      />
                      <DashboardActionButton
                        type="button"
                        size="icon"
                        className={responsiveCompactRowDeleteButtonClass}
                        aria-label="Remover link da coluna do footer"
                        onClick={() =>
                          setSettings((prev) => {
                            const nextColumns = [...prev.footer.columns];
                            const links = nextColumns[columnIndex].links.filter(
                              (_, idx) => idx !== linkIndex,
                            );
                            nextColumns[columnIndex] = {
                              ...nextColumns[columnIndex],
                              links,
                            };
                            return {
                              ...prev,
                              footer: { ...prev.footer, columns: nextColumns },
                            };
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </DashboardActionButton>
                    </div>
                  ))}
                  <DashboardActionButton
                    type="button"
                    size="sm"
                    className="w-full md:w-auto"
                    onClick={() =>
                      setSettings((prev) => {
                        const nextColumns = [...prev.footer.columns];
                        const links = [...nextColumns[columnIndex].links, { label: "", href: "" }];
                        nextColumns[columnIndex] = {
                          ...nextColumns[columnIndex],
                          links,
                        };
                        return {
                          ...prev,
                          footer: { ...prev.footer, columns: nextColumns },
                        };
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar link
                  </DashboardActionButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-4 p-4 md:space-y-6 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Redes sociais</h2>
              <p className="text-xs text-foreground/70">Links exibidos no footer.</p>
            </div>
            <DashboardActionButton
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  footer: {
                    ...prev.footer,
                    socialLinks: [
                      ...prev.footer.socialLinks,
                      {
                        label: "Nova rede",
                        href: "",
                        icon: linkTypes[0]?.icon || "link",
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
            {settings.footer.socialLinks.map((link, index) => (
              <div
                key={`${link.label}-${index}`}
                data-testid={`footer-social-row-${index}`}
                className={`rounded-2xl border p-3 shadow-sm transition md:rounded-xl md:p-2 md:shadow-none ${
                  footerSocialDragOverIndex === index
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/70 bg-background md:border-transparent md:bg-transparent"
                }`}
                onDragOver={(event) => handleFooterSocialDragOver(event, index)}
                onDrop={(event) => handleFooterSocialDrop(event, index)}
              >
                <div className={layoutFooterSocialGridClass}>
                  <div className={responsiveFooterSocialTopRowClass}>
                    <button
                      type="button"
                      draggable
                      className={responsiveFooterSocialDragButtonClass}
                      aria-label={`Arrastar rede ${link.label || index + 1}`}
                      onDragStart={(event) => handleFooterSocialDragStart(event, index)}
                      onDragEnd={clearFooterSocialDragState}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <ReorderControls
                      label={`rede ${link.label || index + 1}`}
                      index={index}
                      total={settings.footer.socialLinks.length}
                      onMove={(targetIndex) => moveFooterSocialLink(index, targetIndex)}
                      className="justify-self-center md:justify-self-auto"
                      buttonClassName="h-7 w-7 md:h-8 md:w-8"
                    />
                    <DashboardActionButton
                      type="button"
                      size="icon"
                      className={responsiveSvgCardMobileRemoveButtonClass}
                      aria-label={`Remover rede ${link.label || index + 1}`}
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          footer: {
                            ...prev.footer,
                            socialLinks: prev.footer.socialLinks.filter((_, idx) => idx !== index),
                          },
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </DashboardActionButton>
                  </div>
                  <Combobox
                    ariaLabel={`Ícone da rede ${link.label || index + 1}`}
                    value={link.icon || "link"}
                    options={footerSocialOptions}
                    placeholder="Cadastre redes sociais na aba acima"
                    disabled={linkTypes.length === 0}
                    searchable={false}
                    onValueChange={(value) =>
                      setSettings((prev) => {
                        const next = [...prev.footer.socialLinks];
                        const matched = linkTypes.find(
                          (item) => item.icon === value || item.id === value,
                        );
                        next[index] = {
                          ...next[index],
                          icon: value,
                          label: matched?.label || link.label || "Rede social",
                        };
                        return {
                          ...prev,
                          footer: { ...prev.footer, socialLinks: next },
                        };
                      })
                    }
                    className="min-w-0 w-full"
                  />
                  <Input
                    className="min-w-0"
                    value={link.href}
                    placeholder="URL"
                    onChange={(event) =>
                      setSettings((prev) => {
                        const next = [...prev.footer.socialLinks];
                        next[index] = {
                          ...next[index],
                          href: event.target.value,
                        };
                        return {
                          ...prev,
                          footer: { ...prev.footer, socialLinks: next },
                        };
                      })
                    }
                  />
                  <DashboardActionButton
                    type="button"
                    size="icon"
                    className={responsiveFooterSocialDesktopRemoveButtonClass}
                    aria-label={`Remover rede ${link.label || index + 1}`}
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        footer: {
                          ...prev.footer,
                          socialLinks: prev.footer.socialLinks.filter((_, idx) => idx !== index),
                        },
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </DashboardActionButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card lift={false} className={dashboardSettingsCardClassName}>
        <CardContent className="space-y-4 p-4 md:space-y-6 md:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Textos legais</h2>
            <p className="text-xs text-foreground/70">Descrição, aviso e copyright.</p>
          </div>
          <div className="grid gap-3 md:gap-4">
            <div className="space-y-2">
              <Label>Parágrafos do aviso</Label>
              <div className="space-y-3">
                {settings.footer.disclaimer.map((item, index) => (
                  <div key={`disclaimer-${index}`} className={responsiveCompactTextareaRowClass}>
                    <Textarea
                      className="min-h-[96px] md:min-h-[80px]"
                      value={item}
                      onChange={(event) =>
                        setSettings((prev) => {
                          const next = [...prev.footer.disclaimer];
                          next[index] = event.target.value;
                          return {
                            ...prev,
                            footer: { ...prev.footer, disclaimer: next },
                          };
                        })
                      }
                    />
                    <DashboardActionButton
                      type="button"
                      size="icon"
                      className={responsiveCompactRowDeleteButtonClass}
                      aria-label="Remover parágrafo do aviso legal"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          footer: {
                            ...prev.footer,
                            disclaimer: prev.footer.disclaimer.filter((_, idx) => idx !== index),
                          },
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </DashboardActionButton>
                  </div>
                ))}
              </div>
              <DashboardActionButton
                type="button"
                size="sm"
                className="w-full md:w-auto"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      disclaimer: [...prev.footer.disclaimer, ""],
                    },
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Adicionar parágrafo
              </DashboardActionButton>
            </div>
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              <DashboardFieldStack>
                <Label>Título do destaque</Label>
                <Input
                  value={settings.footer.highlightTitle}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      footer: {
                        ...prev.footer,
                        highlightTitle: event.target.value,
                      },
                    }))
                  }
                />
              </DashboardFieldStack>
              <DashboardFieldStack>
                <Label>Descrição do destaque</Label>
                <Textarea
                  value={settings.footer.highlightDescription}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      footer: {
                        ...prev.footer,
                        highlightDescription: event.target.value,
                      },
                    }))
                  }
                />
              </DashboardFieldStack>
            </div>
            <DashboardFieldStack>
              <Label>Copyright</Label>
              <Input
                value={settings.footer.copyright}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    footer: { ...prev.footer, copyright: event.target.value },
                  }))
                }
              />
            </DashboardFieldStack>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};

export default DashboardSettingsLayoutTab;
