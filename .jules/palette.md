## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.

## 2025-06-07 - Dynamic ARIA Labels for Icon-Only Reorder Buttons
**Learning:** Found ArrowUp/ArrowDown `DashboardActionButton`s used for list reordering that lacked `aria-label`s. Screen readers would just read "Button". Since these buttons apply to specific mapped items, a static label like "Mover para cima" is ambiguous.
**Action:** Always provide specific, dynamic `aria-label`s (e.g. `aria-label={\`Mover widget ${DASHBOARD_WIDGET_LABELS[widgetId]} para cima\`}`) for icon-only action buttons rendered inside loops/maps to ensure screen reader users can distinguish which item the action applies to. Ensure the inner icon element includes `aria-hidden="true"`.
