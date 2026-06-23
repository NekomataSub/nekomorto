## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.

## 2025-06-23 - Add dynamic ARIA labels to dashboard widget action buttons
**Learning:** Icon-only buttons used for reordering dynamic elements (e.g., dashboard widgets) need specific, dynamic `aria-label`s (like `Mover widget ${label} para cima`) rather than static ones, so screen reader users can distinguish between them.
**Action:** When mapping over dynamic lists to create icon-only actions, ensure `aria-label`s use item-specific identifiers or labels, and add `aria-hidden="true"` to the icons themselves.
