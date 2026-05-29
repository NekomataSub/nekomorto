# Nekomorto Product Completeness and Polish

Documento operacional para levar o Nekomorto de v1 funcional para produto
polido, consistente e sustentavel em producao.

## Estado atual

O produto ja cobre as superficies principais: publico, reader, dashboard,
uploads, webhooks, analytics, seguranca, deploy e operacao. A migracao Astro
tambem nao tem fase obrigatoria pendente.

O trabalho restante e de acabamento, robustez e consistencia:

- reduzir diferencas visuais entre paginas publicas Astro e islands React;
- melhorar microinteracoes sem reintroduzir animacoes caras;
- revisar estados vazios, carregamento, erro e salvamento nos fluxos criticos;
- preservar performance publica, acessibilidade, auth, ownership e operacao;
- deixar limitacoes conhecidas documentadas em vez de escondidas em TODOs.

## Ordem dos ciclos

1. Publico: home, projetos, detalhe de projeto, postagem e paginas institucionais.
2. Reader: leitura mobile/desktop, preferencias, navegacao e estados de falha.
3. Dashboard: usuarios, posts, projetos, uploads, analytics, webhooks e seguranca.
4. Operacao: setup, deploy, health, smoke, backup/restore e docs.

## Checklist de acabamento por tela

- A primeira dobra comunica claramente onde o usuario esta e qual acao principal
  existe naquela tela.
- Tipografia tem hierarquia consistente, linhas equilibradas e paragrafos com
  largura confortavel.
- Elementos interativos tem hover, active, focus visivel, disabled e loading.
- Estados vazios, erro e carregamento explicam o que aconteceu e oferecem uma
  proxima acao quando houver uma acao segura.
- Mobile nao tem texto cortado, controles sobrepostos, scroll lateral acidental
  ou menus sem alvo confortavel.
- Imagens tem dimensoes estaveis, fallback aceitavel, alt text util e nao causam
  shift perceptivel.
- Fluxos com dados sensiveis preservam auth, permissao/ownership e mensagens de
  erro genericas para cliente.
- Mudancas publicas nao pioram LCP, TBT ou CLS de forma perceptivel.

## Criterio de done por ciclo

- Diff pequeno, revisado e restrito ao escopo do ciclo.
- `npm run lint`, `npm run typecheck` e `npm run test` executados ou bloqueio
  documentado.
- `npm run test:a11y` quando houver mudanca de interacao, foco, semantica ou
  contraste.
- `npm run build` e Lighthouse publico quando a mudanca tocar superficies
  publicas com risco de regressao.
- Bugs encontrados fora do escopo sao registrados como follow-up, nao corrigidos
  por refatoracao ampla oportunista.

## Primeiro ciclo aplicado

- Consolidar tipografia global e comportamento de leitura.
- Melhorar hero publico compartilhado entre Astro e React.
- Refinar `AsyncState` para loading, vazio e erro com melhor hierarquia visual.
- Manter contratos, rotas, APIs, schema e dependencias inalterados.

## Segundo ciclo aplicado

- Refinar a pagina 404 publica para usar o mesmo sistema visual das paginas
  publicas, sem decoracao pesada ou card generico.
- Trocar estados vazios manuais da home por `AsyncState`, mantendo mensagens
  especificas para posts e ranking de projetos.
- Adicionar cobertura focada para o 404 publico e preservar os contratos de rota.

## Terceiro ciclo aplicado

- Refinar estados de carregamento, erro e conteudo indisponivel no reader textual.
- Remover estados manuais duplicados do reader e centralizar a apresentacao em
  `AsyncState`.
- Adicionar acao de recuperacao segura para voltar ao projeto quando o capitulo
  nao carrega ou ainda nao possui conteudo publicado.

## Quarto ciclo aplicado

- Refinar a tela de Seguranca do dashboard.
- Trocar estados manuais de erro bloqueante e lista vazia de sessoes por
  `AsyncState`, com acao de tentativa nova no erro.
- Preservar contratos de API, permissao e revogacao de sessao.

## Quinto ciclo aplicado

- Refinar o fallback de carregamento das rotas autenticadas do dashboard.
- Trocar estados manuais restantes em Uploads e Webhooks por `AsyncState`, mantendo
  tabelas, filtros, permissoes e acoes existentes.
- Corrigir as rotas seeded usadas pelo Lighthouse publico para medir paginas reais
  do catalogo local.
- Ajustar o smoke publico local para simular trafego externo via `x-forwarded-for`
  e validar que health publico nao exponha metadados detalhados.
- Manter o fechamento como criterio shippable: polish consistente, validacoes
  completas e pendencias dependentes de ambiente documentadas.

## Pendencias para producao real

- Resolver a integridade dos uploads locais antes de deploy: o check fast encontrou
  73 problemas, sendo 6 `missing_source_file` e 67 `missing_variant_file`.
- Aceitar ou revisar o primeiro baseline completo de Lighthouse publico em ambiente
  com backend/dados reais; no preview local sem backend as rotas dinamicas seguem
  aparecendo como `noindex`.
- Fazer QA manual com dados reais de midia, posts, projetos, capitulos e usuarios
  administrativos antes de publicar.
