## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## 2024-05-18 - Dashboard Action Button ARIA Label Pattern
**Learning:** Icon-only buttons using `DashboardActionButton` in dynamically mapped elements (like `DASHBOARD_WIDGET_LABELS` in the dashboard) often lack descriptive `aria-label`s. Without dynamic context in the `aria-label`, screen readers will only announce generic text for all mapped buttons, causing confusion.
**Action:** Always inject specific dynamic state (like the actual widget or item name) into the `aria-label` for mapped icon-only buttons, and apply `aria-hidden="true"` to the inner Lucide icon to prevent screen reader redundancy.
