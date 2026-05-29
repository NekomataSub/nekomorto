# Public Surface Performance

## Goal

Keep the public surface on a stable baseline after the recent optimization pass, with one aggregated Lighthouse run for the main public routes and a manual React Profiler playbook for hotspot diagnosis.

## Route matrix

The public-surface audit always covers these routes:

- `home-mobile`: `/`
- `projects-mobile`: `/projetos`
- `project-detail-mobile`: `/projeto/aurora-no-horizonte`
- `team-mobile`: `/equipe`
- `donations-mobile`: `/doacoes`
- `projects-desktop`: `/projetos`
- `reader-post-mobile`: `/postagem/post-teste`
- `reader-chapter-mobile`: `/projeto/nekomata-eclipse/leitura/1`

## Commands

Run the aggregated public audit against an already running app:

```bash
npm run lighthouse:public-surface
```

Build and start preview automatically for CI or local one-shot captures:

```bash
npm run lighthouse:public-surface:ci
```

Compare the latest aggregated summary against the versioned baseline:

```bash
npm run lighthouse:public-surface:compare
```

Accept the latest aggregated summary as the new baseline:

```bash
npm run lighthouse:public-surface:accept
```

## Artifacts

Generated, non-versioned artifacts live in `.lighthouse/`:

- `.lighthouse/public-surface-summary.json`
- `.lighthouse/public-surface-comparison.json`
- `.lighthouse/public-surface-comparison.md`
- route-specific Lighthouse reports and summaries
- React Profiler raw exports in `.lighthouse/react-profiler/`

The versioned baseline lives in:

- `reports/perf/public-surface-baseline.json`

## React Profiler playbook

Use a production build and capture one export per flow:

1. Home initial load on `/`
2. Projects load on `/projetos`
3. Project detail load on `/projeto/projeto-teste`
4. Team load on `/equipe`
5. Donations load on `/doacoes`
6. Projects interaction on `/projetos`
7. Post load on `/postagem/post-teste`
8. Reader load and chapter navigation on `/projeto/nekomata-eclipse/leitura/1`

For the `Projects` interaction flow, include:

- typing in the public search field
- opening `Tags`
- opening `Gêneros`

For each export, record a short summary next to the raw file with:

- capture date
- route + interaction
- top 5 commits by duration
- hottest components
- conclusion: `hotspot antigo sumiu`, `permanece`, or `novo hotspot`

## Comparison policy

The comparison script is informative first: it never fails only because of a regression.

Warnings are emitted when a route regresses beyond any of these deltas relative to the accepted baseline:

- performance score drop greater than `3` points
- `largest-contentful-paint` worse by more than `200ms`
- `total-blocking-time` worse by more than `50ms`
- `cumulative-layout-shift` worse by more than `0.02`

`first-contentful-paint`, `speed-index`, and `interaction-to-next-paint` are still reported in the aggregated summary, but they do not warn by themselves in this first rollout.
