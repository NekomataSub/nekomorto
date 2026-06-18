## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## 2026-06-18 - Added ARIA labels to Dashboard Draft Widget Movers
**Learning:** Confirmed pattern that icon-only buttons ( using Lucide icons) inside mapped lists/arrays often miss s. Dynamically interpolating the array item's label into the `aria-label` string (e.g. `Mover widget ${DASHBOARD_WIDGET_LABELS[widgetId]} para cima`) is essential so screen reader users know *which* item the action applies to, rather than just hearing generic 'Mover para cima' repeatedly.
**Action:** Always verify icon-only buttons in  loops have dynamic s that reference the specific item's context.
## $(date +%Y-%m-%d) - Added ARIA labels to Dashboard Draft Widget Movers
**Learning:** Confirmed pattern that icon-only buttons (`DashboardActionButton` using Lucide icons) inside mapped lists/arrays often miss `aria-label`s. Dynamically interpolating the array item's label into the `aria-label` string (e.g. `Mover widget ${DASHBOARD_WIDGET_LABELS[widgetId]} para cima`) is essential so screen reader users know *which* item the action applies to, rather than just hearing generic 'Mover para cima' repeatedly.
**Action:** Always verify icon-only buttons in `.map()` loops have dynamic `aria-label`s that reference the specific item's context.
