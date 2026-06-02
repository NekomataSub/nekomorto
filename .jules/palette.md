## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## 2026-06-02 - Consistent aria-labels for internal mappings
**Learning:** Found that mapping configurations like `DashboardSettingsTranslationsTab.tsx` and `DashboardSettingsSocialLinksTab.tsx` used dynamically rendered icon-only `Trash2` buttons without any ARIA attributes, missing context on what is being deleted.
**Action:** When working on array/mapping lists, make sure all icon-only action buttons specify `aria-label` targeting the precise index or label (e.g. `Excluir tag ${tag}`), and hide the visual icons with `aria-hidden="true"`.
