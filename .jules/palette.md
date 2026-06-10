## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## 2026-06-10 - Adding Dynamic ARIA labels to configuration arrays
**Learning:** Configurable lists, grids, or dashboard arrays (like customizing widgets) often use generic 'up' or 'down' icon buttons. Static `aria-label`s fail to convey *which* item is being moved to a screen reader user.
**Action:** When adding `aria-label`s to mapped icon-only buttons, use a template string to inject the current iteration item's specific label (e.g. `Mover widget  para cima`). Also ensure redundant icons receive `aria-hidden="true"`.
