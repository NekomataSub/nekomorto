import PublicLink from "@/components/PublicLink";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";

const NotFound = () => {
  const location = usePublicDocumentLocation();
  const requestedPath = `${location.pathname}${location.search}${location.hash}`;

  usePageMeta({ title: "Página não encontrada", noIndex: true });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
        <section className="relative min-h-screen overflow-hidden border-b border-border/60 bg-background [background-image:var(--gradient-public-hero)] bg-no-repeat">
          <div
            className={`${publicPageLayoutTokens.sectionBase} relative grid min-h-screen max-w-6xl items-center gap-8 pb-16 pt-24 md:grid-cols-[1.2fr_0.8fr] md:pt-28`}
          >
            <div className="space-y-5">
              <Badge variant="secondary" className="text-xs uppercase tracking-widest">
                Erro 404
              </Badge>
              <h1 className="text-3xl font-semibold text-foreground md:text-5xl">
                Página não encontrada
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Não conseguimos localizar o endereço solicitado. Verifique se o link está correto ou
                volte para a página inicial.
              </p>
              <div className="w-fit max-w-full truncate rounded-full border border-border/60 bg-background/70 px-4 py-2 text-xs text-muted-foreground">
                {requestedPath || "/"}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <PublicLink href="/">Voltar para a página inicial</PublicLink>
                </Button>
                <Button variant="outline" onClick={() => window.history.back()}>
                  Voltar para a página anterior
                </Button>
              </div>
            </div>

            <aside className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-public-card md:p-8">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Sugestões rápidas
                </p>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Confira os projetos e lançamentos mais recentes.</p>
                  <p>Conheça a equipe e o nosso manifesto.</p>
                  <p>Acompanhe novidades e atualizações no site.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="secondary">
                    <PublicLink href="/projetos">Explorar projetos</PublicLink>
                  </Button>
                  <Button asChild variant="ghost">
                    <PublicLink href="/recrutamento">Ir para recrutamento</PublicLink>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
};

export default NotFound;
