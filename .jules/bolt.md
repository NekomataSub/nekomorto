## 2024-05-23 - Avoid full codebase biome checks
**Learning:** Running `npx @biomejs/biome check --write src/` or similar wide commands in this repository will modify hundreds of files unrelated to the task because of pre-existing style or formatting discrepancies.
**Action:** Always scope linting/formatting strictly to the specific files being modified for the task (e.g., `npx @biomejs/biome check --write src/path/to/modified.ts`).
