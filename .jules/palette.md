## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.

## 2024-05-18 - [Descriptive ARIA Labels in Dynamic Lists]
**Learning:** Found that generic or missing ARIA labels on icon-only buttons (like ArrowUp/ArrowDown) used inside dynamic, mapped lists (e.g., reordering dashboard widgets) make it impossible for screen reader users to know *which* item they are interacting with.
**Action:** Always ensure ARIA labels in mapped loops use specific dynamic content (e.g., \`Mover widget ${DASHBOARD_WIDGET_LABELS[widgetId]} para cima\`) rather than static text, and ensure the nested SVG icons include `aria-hidden="true"`.
