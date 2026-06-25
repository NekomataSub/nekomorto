import PublicPageContainer from "@/components/PublicPageContainer";
import { Input } from "@/components/public-form-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  navigatePublicDocument,
  usePublicDocumentLocation,
} from "@/lib/public-document-navigation";
import { cn } from "@/lib/utils";
import "@/styles/login.css";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

type SessionCheckState = "default" | "mfa";

const Login = () => {
  usePageMeta({ title: "Login", noIndex: true });

  const location = usePublicDocumentLocation("/login");
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const error = params.get("error");
  const next = params.get("next");
  const mfa = params.get("mfa");
  const [mfaCode, setMfaCode] = useState("");
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [isCancellingMfa, setIsCancellingMfa] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionState, setSessionState] = useState<SessionCheckState>(() =>
    mfa === "required" ? "mfa" : "default",
  );
  const [mfaError, setMfaError] = useState("");
  const [authError, setAuthError] = useState("");
  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const apiBase = getApiBase();

  useEffect(() => {
    let isActive = true;
    const checkSession = async () => {
      try {
        const response = await apiFetch(apiBase, "/api/public/me", { auth: true });
        if (!response.ok) {
          if (isActive) setIsCheckingSession(false);
          return;
        }
        const body = await response.json();
        if (isActive && body?.user) {
          navigatePublicDocument("/dashboard", { replace: true });
          return;
        }
        if (isActive) setIsCheckingSession(false);
      } catch {
        if (isActive) setIsCheckingSession(false);
      }
    };
    void checkSession();
    return () => {
      isActive = false;
    };
  }, [apiBase]);

  useEffect(() => {
    setSessionState(mfa === "required" ? "mfa" : "default");
  }, [mfa]);

  const errorMessage = (() => {
    switch (error) {
      case "unauthorized":
      case "preprovision_required":
        return "Seu usuário ainda não foi liberado por um owner.";
      case "email_not_verified":
        return "Não foi possível confirmar seu e-mail no provedor escolhido.";
      case "identity_already_linked":
        return "Essa conta já está conectada a outro usuário.";
      case "ambiguous_candidate":
        return "Encontramos um conflito de conta e não foi possível concluir o acesso automaticamente.";
      case "same_provider_conflict":
        return "Já existe uma conta desse provedor vinculada para este e-mail.";
      case "state_mismatch":
        return "Falha de segurança na autenticação. Tente novamente.";
      case "token_exchange_failed":
        return "Não foi possível concluir a autenticação.";
      case "legacy_auth_removed":
        return "Use os botões de login desta página para iniciar a autenticação.";
      case "user_fetch_failed":
        return "Não foi possível buscar seus dados.";
      case "missing_code":
        return "Autenticação cancelada ou incompleta.";
      case "server_error":
        return "Erro interno no servidor de autenticação.";
      default:
        return null;
    }
  })();

  const handleMfaVerify = async () => {
    const normalizedCode = mfaCode.trim();
    if (!normalizedCode || isVerifyingMfa) {
      return;
    }
    setIsVerifyingMfa(true);
    setMfaError("");
    try {
      const isBackupCode = !/^\d{6}$/.test(normalizedCode);
      const result = isBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: normalizedCode, trustDevice: false })
        : await authClient.twoFactor.verifyTotp({ code: normalizedCode, trustDevice: false });
      if (result.error) {
        setMfaError("Não foi possível validar o código de segurança.");
        return;
      }
      window.location.href = next || "/dashboard";
    } catch {
      setMfaError("Não foi possível validar o código de segurança.");
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const handleCancelMfaLogin = async () => {
    if (isCancellingMfa) {
      return;
    }
    setIsCancellingMfa(true);
    try {
      await apiFetch(apiBase, "/api/logout", {
        method: "POST",
        auth: true,
      });
    } catch {
      // fail-open to avoid trapping the user in pending MFA state
    } finally {
      window.location.href = "/";
    }
  };

  const isOauthLoginVisible = sessionState === "default";
  const isMfaVisible = sessionState === "mfa";

  if (isCheckingSession) return null;

  const startSocialLogin = async (provider: "discord" | "google") => {
    if (isStartingAuth) return;
    setIsStartingAuth(true);
    setAuthError("");
    const result = await authClient.signIn.social({
      provider,
      callbackURL: next || "/dashboard",
      errorCallbackURL: "/login?error=unauthorized",
    });
    if (result?.error) {
      setAuthError("Não foi possível iniciar a autenticação.");
      setIsStartingAuth(false);
    }
  };

  const startPasskeyLogin = async () => {
    if (isStartingAuth) return;
    setIsStartingAuth(true);
    setAuthError("");
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setAuthError("Nenhuma passkey válida foi encontrada.");
      setIsStartingAuth(false);
      return;
    }
    window.location.href = next || "/dashboard";
  };

  return (
    <div className="login-shell text-foreground">
      <div aria-hidden className="login-backdrop" />
      <PublicPageContainer maxWidth="3xl" mainClassName="relative pt-28" className="pb-20">
        <div className="login-card animate-fade-in">
          <div className="login-card-content animate-slide-up">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-border/65 bg-card/75 text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Acesso restrito
                </Badge>
                <Badge className="border border-primary/30 bg-primary/18 text-primary hover:bg-primary/18">
                  Dashboard
                </Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold lg:text-4xl">Autorização Necessária</h1>
                <p className="text-sm text-muted-foreground">
                  Faça login para acessar a plataforma.
                </p>
              </div>

              {errorMessage && (
                <div role="alert" aria-live="polite" className="login-alert">
                  {errorMessage}
                </div>
              )}
              {authError ? (
                <div role="alert" aria-live="polite" className="login-alert">
                  {authError}
                </div>
              ) : null}

              {isOauthLoginVisible ? (
                <div className="space-y-4">
                  <div className="login-providers">
                    <button
                      type="button"
                      className={cn("login-provider-btn login-provider-btn--discord")}
                      disabled={isStartingAuth}
                      onClick={() => void startSocialLogin("discord")}
                    >
                      <span className="login-provider-icon">
                        <DiscordIcon className="h-5 w-5" />
                      </span>
                      <span className="login-provider-label">Entrar com Discord</span>
                    </button>

                    <button
                      type="button"
                      className={cn("login-provider-btn login-provider-btn--google")}
                      disabled={isStartingAuth}
                      onClick={() => void startSocialLogin("google")}
                    >
                      <span className="login-provider-icon">
                        <GoogleIcon className="h-5 w-5" />
                      </span>
                      <span className="login-provider-label">Entrar com Google</span>
                    </button>

                    <button
                      type="button"
                      className={cn("login-provider-btn")}
                      disabled={isStartingAuth}
                      onClick={() => void startPasskeyLogin()}
                    >
                      <span className="login-provider-icon">
                        <Lock className="h-5 w-5" />
                      </span>
                      <span className="login-provider-label">Entrar com passkey</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {isMfaVisible ? (
                <div className="space-y-3 rounded-2xl border border-border/65 bg-card/70 p-4">
                  <p className="text-sm text-muted-foreground">
                    Digite seu código da V2F ou código de recuperação para concluir o login.
                  </p>
                  <Input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="000000 ou ABCDE-12345"
                    className="w-full rounded-xl border-border/65 bg-background/70 text-sm text-foreground"
                  />
                  {mfaError ? <p className="text-xs text-red-300">{mfaError}</p> : null}
                  <Button
                    className="w-full"
                    disabled={isVerifyingMfa || !mfaCode.trim()}
                    onClick={handleMfaVerify}
                  >
                    {isVerifyingMfa ? "Validando..." : "Confirmar código"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isCancellingMfa || isVerifyingMfa}
                    onClick={handleCancelMfaLogin}
                  >
                    {isCancellingMfa ? "Cancelando..." : "Cancelar login"}
                  </Button>
                </div>
              ) : null}

              <div className={`login-actions ${isMfaVisible ? "justify-end" : ""}`}>
                {isOauthLoginVisible ? (
                  <a href="/" className="login-back-link">
                    ← Voltar ao site
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </PublicPageContainer>
    </div>
  );
};

export default Login;
