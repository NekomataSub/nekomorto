import {
  publicInteractiveStackedSurfaceClassName,
  publicPageLayoutTokens,
  publicStackedSurfaceClassName,
} from "@/components/public-page-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { usePixQrCode } from "@/hooks/use-pix-qr-code";
import { useTextQrCode } from "@/hooks/use-text-qr-code";
import {
  DEFAULT_DONATIONS_CRYPTO_SECTION_TITLE,
  getDonationsCryptoActionLabel,
  getDonationsCryptoMeta,
  getDonationsCryptoQrValue,
  isRenderableDonationsCryptoService,
  normalizeDonationsCryptoService,
  normalizeDonationsCryptoServices,
} from "@/lib/donations-crypto";
import { buildMonthlyGoalSummary } from "@/lib/donations-monthly-goal";
import { resolveDonationsIcon } from "@/lib/institutional-page-icons";
import type { PublicRouteDonationsPayload } from "@/types/public-bootstrap";
import type { DonationsCryptoService, DonationsPageConfig } from "@/types/public-pages";
import {
  Check,
  Coins,
  Copy,
  ExternalLink,
  HeartHandshake,
  PiggyBank,
  QrCode,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const buildCryptoTabAriaLabel = (service: DonationsCryptoService) => {
  const metaLabel = getDonationsCryptoMeta(service);
  return metaLabel ? `${service.name} (${metaLabel})` : service.name;
};

const donationsQrFrameClassName =
  "overflow-hidden rounded-[1.2rem] border border-border/40 bg-white p-2";
const donationsPixQrShellClassName = "mx-auto w-full max-w-[220px] p-0 md:mx-0";
const donationsPixKeyClassName =
  "min-w-0 text-center font-mono text-sm leading-relaxed text-primary break-all";

const CryptoDonationPanel = ({
  service,
  index,
  qrUrl,
  copiedKey,
  onCopy,
}: {
  service: DonationsCryptoService;
  index: number;
  qrUrl: string;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
}) => {
  const metaLabel = getDonationsCryptoMeta(service);
  const actionUrl = String(service.actionUrl || "").trim();
  const actionLabel = getDonationsCryptoActionLabel(service);
  const copyKey = `crypto-${index}`;
  const externalActionAriaLabel = actionLabel || "Abrir link externo";
  const copyAddressAriaLabel = copiedKey === copyKey ? "Copiado" : "Copiar endereço";
  const inlineIconBaseClassName =
    "inline-flex h-6 w-6 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-colors duration-300 hover:text-accent focus-visible:text-accent focus-visible:outline-hidden";
  const inlineNeutralIconClassName = `${inlineIconBaseClassName} text-muted-foreground`;
  const inlineIconSpacingClassName = "ml-1.5";
  const copyButtonClassName = `ml-1.5 ${inlineIconBaseClassName} disabled:pointer-events-none disabled:opacity-40 ${
    copiedKey === copyKey ? "text-accent" : "text-muted-foreground"
  }`;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_188px] md:items-start">
      <div data-testid="donations-crypto-details" className="min-w-0 space-y-5">
        <div className="min-w-0 space-y-1.5">
          <div
            data-testid="donations-crypto-title-row"
            className="inline-flex max-w-full items-start gap-1.5"
          >
            <div className="min-w-0 text-base font-semibold text-foreground md:text-lg">
              {service.name}
            </div>
            {actionUrl ? (
              <a
                href={actionUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={externalActionAriaLabel}
                title={externalActionAriaLabel}
                className={`${inlineIconSpacingClassName} ${inlineNeutralIconClassName}`}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {metaLabel ? (
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {metaLabel}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Endereço
          </div>
          <div
            data-testid="donations-crypto-address-row"
            className="min-w-0 text-sm leading-relaxed"
          >
            <p className="inline min-w-0 font-mono text-sm text-primary break-all">
              {service.address}
            </p>
            <button
              type="button"
              aria-label={copyAddressAriaLabel}
              title={copyAddressAriaLabel}
              onClick={() => void onCopy(service.address, copyKey)}
              disabled={!service.address}
              className={copyButtonClassName}
            >
              {copiedKey === copyKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {service.note ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Observações
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {service.note}
            </p>
          </div>
        ) : null}
      </div>

      <div
        data-testid="donations-crypto-actions"
        className="space-y-3 md:justify-self-end md:self-start"
      >
        <div className="mx-auto w-full max-w-[188px] p-0 md:mx-0">
          <div className={donationsQrFrameClassName}>
            <img
              src={qrUrl}
              alt={`QR Code ${service.name}`}
              className="aspect-square w-full rounded-lg object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export interface PublicDonationsPageContentProps {
  donations: DonationsPageConfig;
  hasHydrationError?: boolean;
  merchantName?: string;
  routePayload?: PublicRouteDonationsPayload | null;
  shouldShowHydrationState?: boolean;
}

const PublicDonationsPageContent = ({
  donations,
  hasHydrationError = false,
  merchantName = "Nekomata",
  routePayload = null,
  shouldShowHydrationState = false,
}: PublicDonationsPageContentProps) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeCryptoIndex, setActiveCryptoIndex] = useState(0);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (value: string, key: string) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      setCopiedKey(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedValue);
      setCopiedKey(key);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedKey((currentKey) => (currentKey === key ? null : currentKey));
      }, 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = normalizedValue;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copiedWithFallback = document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedKey(copiedWithFallback ? key : null);
        if (copiedWithFallback) {
          if (copyResetTimeoutRef.current !== null) {
            window.clearTimeout(copyResetTimeoutRef.current);
          }
          copyResetTimeoutRef.current = window.setTimeout(() => {
            setCopiedKey((currentKey) => (currentKey === key ? null : currentKey));
          }, 2000);
        }
      } catch {
        setCopiedKey(null);
      }
    }
  };

  const fallbackPixQrUrl = usePixQrCode(
    routePayload?.pixQrCodeUrl
      ? {
          pixKey: "",
          pixNote: "",
          pixCity: "CIDADE",
          qrCustomUrl: "",
          merchantName: "",
        }
      : {
          pixKey: donations.pixKey,
          pixNote: donations.pixNote,
          pixCity: donations.pixCity?.trim() || "CIDADE",
          qrCustomUrl: donations.qrCustomUrl,
          merchantName,
        },
  );
  const pixQrUrl = routePayload?.pixQrCodeUrl || fallbackPixQrUrl;
  const monthlyGoal = useMemo(
    () =>
      buildMonthlyGoalSummary({
        raised: donations.monthlyGoalRaised,
        target: donations.monthlyGoalTarget,
        supporters: donations.monthlyGoalSupporters,
        note: donations.monthlyGoalNote,
      }),
    [
      donations.monthlyGoalNote,
      donations.monthlyGoalRaised,
      donations.monthlyGoalSupporters,
      donations.monthlyGoalTarget,
    ],
  );
  const visibleCryptoServices = useMemo(
    () =>
      normalizeDonationsCryptoServices(donations.cryptoServices).filter((service) =>
        isRenderableDonationsCryptoService(service),
      ),
    [donations.cryptoServices],
  );
  const cryptoSectionTitle = DEFAULT_DONATIONS_CRYPTO_SECTION_TITLE;
  const hasMultipleCryptoServices = visibleCryptoServices.length > 1;
  const activeCryptoService =
    visibleCryptoServices[activeCryptoIndex] || visibleCryptoServices[0] || null;
  const activeCryptoRouteQrUrl =
    (routePayload?.cryptoQrCodeUrls || {})[String(activeCryptoIndex)] || "";
  const fallbackActiveCryptoQrUrl = useTextQrCode({
    value:
      activeCryptoRouteQrUrl || !activeCryptoService
        ? ""
        : getDonationsCryptoQrValue(activeCryptoService),
  });
  const activeCryptoQrUrl = activeCryptoRouteQrUrl || fallbackActiveCryptoQrUrl;

  useEffect(() => {
    if (visibleCryptoServices.length === 0) {
      if (activeCryptoIndex !== 0) {
        setActiveCryptoIndex(0);
      }
      return;
    }
    if (activeCryptoIndex >= visibleCryptoServices.length) {
      setActiveCryptoIndex(0);
    }
  }, [activeCryptoIndex, visibleCryptoServices.length]);

  return (
    <>
      {shouldShowHydrationState ? (
        <section
          className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-24 pt-10 reveal`}
          data-reveal
        >
          <Card className={`${publicStackedSurfaceClassName} border-border/60 bg-card/80`}>
            <CardContent className="p-6 text-sm text-muted-foreground md:p-8">
              {hasHydrationError
                ? "Não foi possível carregar as doações agora."
                : "Carregando doações..."}
            </CardContent>
          </Card>
        </section>
      ) : (
        <>
          {donations.costs.length > 0 ? (
            <section
              className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-12 pt-10 reveal`}
              data-reveal
            >
              <div className="grid gap-6 md:grid-cols-3">
                {donations.costs.map((item) => {
                  const Icon = resolveDonationsIcon(item.icon, Sparkles);
                  return (
                    <Card
                      key={item.title}
                      className={`${publicInteractiveStackedSurfaceClassName} group bg-card/80 hover:border-primary/60 hover:bg-card/90`}
                    >
                      <CardContent className="space-y-3 p-6">
                        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                          <Icon className="h-4 w-4 text-primary/80 transition-colors duration-300 group-hover:text-primary" />
                          {item.title}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                          {item.description}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          {monthlyGoal ? (
            <section
              className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-8 pt-2 reveal`}
              data-reveal
            >
              <Card
                className={`${publicStackedSurfaceClassName} ${
                  monthlyGoal.isComplete
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/60 bg-card/90"
                }`}
              >
                <CardContent className="space-y-5 p-6 md:p-8">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={`text-sm font-semibold uppercase tracking-widest ${
                            monthlyGoal.isComplete ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {monthlyGoal.title}
                        </div>
                        {monthlyGoal.isComplete ? (
                          <Badge className="border border-primary/15 bg-primary/10 text-primary">
                            Concluída
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-lg font-semibold text-foreground md:text-xl">
                        {monthlyGoal.raisedLabel}
                        <span className="ml-2 font-medium text-muted-foreground">
                          de {monthlyGoal.targetLabel}
                        </span>
                      </p>
                      <p
                        className={`text-sm ${
                          monthlyGoal.isComplete ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {monthlyGoal.statusText}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-1.5 md:items-end">
                      <span
                        className={`text-3xl font-semibold ${
                          monthlyGoal.isComplete ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {monthlyGoal.percentage}%
                      </span>
                      {monthlyGoal.supportersLabel ? (
                        <div className="text-xs font-medium text-muted-foreground">
                          {monthlyGoal.supportersLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {monthlyGoal.note ? (
                    <div
                      className={`whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm ${
                        monthlyGoal.isComplete
                          ? "border-primary/15 bg-background/80 text-foreground/80"
                          : "border-border/60 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      {monthlyGoal.note}
                    </div>
                  ) : null}
                  <Progress
                    value={monthlyGoal.percentage}
                    className={`h-3 ${monthlyGoal.isComplete ? "bg-primary/20" : "bg-primary/15"}`}
                    indicatorClassName={
                      monthlyGoal.isComplete ? "bg-primary shadow-primary-glow" : undefined
                    }
                    aria-label={monthlyGoal.title}
                    aria-valuetext={monthlyGoal.progressLabel}
                  />
                </CardContent>
              </Card>
            </section>
          ) : null}

          {donations.reasonTitle || donations.reasonText || donations.pixKey ? (
            <section
              className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-12 pt-0 reveal`}
              data-reveal
            >
              <Card className={`${publicStackedSurfaceClassName} border-border/60 bg-card/90`}>
                <CardContent
                  className={`grid gap-6 p-6 md:p-8 ${
                    (donations.reasonTitle || donations.reasonText) && donations.pixKey
                      ? "md:grid-cols-[1.1fr_0.9fr]"
                      : "md:grid-cols-1"
                  }`}
                >
                  {donations.reasonTitle || donations.reasonText ? (
                    <div data-testid="donations-reason-panel" className="space-y-4 rounded-2xl p-2">
                      <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        {(() => {
                          const ReasonIcon = resolveDonationsIcon(
                            donations.reasonIcon,
                            HeartHandshake,
                          );
                          return <ReasonIcon className="h-4 w-4 text-primary/80" />;
                        })()}
                        {donations.reasonTitle}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground md:text-base">
                        {donations.reasonText}
                      </p>
                      {donations.reasonNote ? (
                        <div className="whitespace-pre-wrap rounded-2xl border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
                          {donations.reasonNote}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {donations.pixKey ? (
                    <div
                      id="pix-doacoes"
                      data-scroll-block="center"
                      className="rounded-2xl border border-border/60 bg-background/50 p-5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                          {(() => {
                            const PixIcon = resolveDonationsIcon(donations.pixIcon, QrCode);
                            return <PixIcon className="h-4 w-4 text-primary/80" />;
                          })()}
                          Pix
                        </div>
                        <span className="text-xs text-muted-foreground">Chave e QR Code</span>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1.2fr] md:items-center">
                        <div className={donationsPixQrShellClassName}>
                          <div className={donationsQrFrameClassName}>
                            <img
                              src={pixQrUrl}
                              alt="QR Code PIX"
                              className="aspect-square w-full rounded-lg object-cover"
                            />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className={donationsPixKeyClassName}>{donations.pixKey}</div>
                          <div className="flex w-full flex-wrap items-center gap-3 md:justify-center">
                            <Button
                              className="w-full gap-2 md:w-auto"
                              onClick={() => void handleCopy(donations.pixKey, "pix")}
                              disabled={!donations.pixKey?.trim()}
                            >
                              {copiedKey === "pix" ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              {copiedKey === "pix" ? "Copiado" : "Copiar chave PIX"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {visibleCryptoServices.length > 0 ? (
            <section
              className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-8 pt-0 reveal`}
              data-reveal
              data-testid="donations-crypto-section"
            >
              <Card
                data-testid="donations-crypto-card"
                className={`${publicStackedSurfaceClassName} border-0 bg-card/90 shadow-public-card`}
              >
                <CardContent className="space-y-4 p-5 md:space-y-5 md:p-6">
                  <div
                    className={
                      hasMultipleCryptoServices
                        ? "grid gap-4 md:grid-cols-[60px_minmax(0,1fr)] lg:grid-cols-[64px_minmax(0,1fr)]"
                        : "grid gap-4"
                    }
                  >
                    {hasMultipleCryptoServices ? (
                      <div className="min-w-0">
                        <div
                          role="tablist"
                          aria-label={cryptoSectionTitle}
                          data-testid="donations-crypto-tablist"
                          className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5 md:flex-col md:gap-1.5 md:overflow-visible md:pb-0"
                        >
                          {visibleCryptoServices.map((service, index) => {
                            const normalizedService = normalizeDonationsCryptoService(service);
                            const isActive = index === activeCryptoIndex;
                            const TabIcon = resolveDonationsIcon(normalizedService.icon, Coins);

                            return (
                              <button
                                key={`${normalizedService.name}-${normalizedService.address}-${index}`}
                                type="button"
                                role="tab"
                                id={`donations-crypto-tab-${index}`}
                                aria-controls={`donations-crypto-panel-${index}`}
                                aria-selected={isActive}
                                aria-label={buildCryptoTabAriaLabel(normalizedService)}
                                tabIndex={isActive ? 0 : -1}
                                data-testid={`donations-crypto-tab-${index}`}
                                onClick={() => setActiveCryptoIndex(index)}
                                className={`group/tab relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border transition-all duration-300 md:h-13 md:w-13 ${
                                  isActive
                                    ? "border-primary/50 bg-transparent text-primary"
                                    : "border-border/50 bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                <span
                                  className={`absolute inset-y-3 left-0 hidden w-1 rounded-full bg-primary transition-opacity md:block ${
                                    isActive ? "opacity-100" : "opacity-0"
                                  }`}
                                  aria-hidden="true"
                                />
                                <TabIcon
                                  aria-hidden="true"
                                  data-testid={`donations-crypto-tab-icon-${index}`}
                                  className={`h-4 w-4 transition-transform duration-300 ${
                                    isActive
                                      ? "scale-105 text-primary"
                                      : "text-muted-foreground group-hover/tab:text-primary"
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {activeCryptoService ? (
                      <div
                        role={hasMultipleCryptoServices ? "tabpanel" : undefined}
                        id={`donations-crypto-panel-${activeCryptoIndex}`}
                        aria-labelledby={
                          hasMultipleCryptoServices
                            ? `donations-crypto-tab-${activeCryptoIndex}`
                            : undefined
                        }
                        data-testid="donations-crypto-panel"
                        className="rounded-3xl border-0 bg-transparent p-0 shadow-none"
                      >
                        <CryptoDonationPanel
                          service={normalizeDonationsCryptoService(activeCryptoService)}
                          index={activeCryptoIndex}
                          qrUrl={activeCryptoQrUrl}
                          copiedKey={copiedKey}
                          onCopy={handleCopy}
                        />
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {donations.donors.length > 0 ? (
            <section
              className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-24 pt-4 reveal`}
              data-reveal
            >
              <Card
                data-testid="donations-donors-card"
                className={`${publicStackedSurfaceClassName} bg-card/80 shadow-public-card`}
              >
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-center gap-3 text-xl font-semibold text-foreground">
                    {(() => {
                      const DonorsIcon = resolveDonationsIcon(donations.donorsIcon, PiggyBank);
                      return <DonorsIcon className="h-5 w-5 text-primary/80" />;
                    })()}
                    Lista de doadores
                  </div>
                  <Separator className="my-6 bg-border/60" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[22%]" />
                        <col className="w-[28%]" />
                        <col className="w-[16%]" />
                      </colgroup>
                      <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                        <tr>
                          <th className="pb-3">Doador</th>
                          <th className="pb-3">Valor</th>
                          <th className="pb-3">Objetivo</th>
                          <th className="pb-3">Mês/Ano</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {donations.donors.map((donor, index) => (
                          <tr key={`${donor.name}-${donor.date}-${index}`}>
                            <td className="py-3 font-medium text-foreground">{donor.name}</td>
                            <td className="py-3 text-muted-foreground">{donor.amount}</td>
                            <td className="py-3 text-muted-foreground">{donor.goal}</td>
                            <td className="py-3 text-muted-foreground">{donor.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </>
  );
};

export default PublicDonationsPageContent;
