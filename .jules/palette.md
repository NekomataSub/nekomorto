## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.

## 2025-02-27 - Added Aria Labels to Customize Dashboard Buttons
**Learning:** Found an accessibility issue pattern in mapped loops. Icon-only buttons for dynamic items (like moving widgets) frequently lack distinct `aria-label`s, which makes it hard for screen readers to differentiate what each button controls.
**Action:** Always ensure that `aria-label`s in mapped loops include dynamic context (e.g. `Mover widget ${label} para cima`) and that nested decorative SVG icons include `aria-hidden="true"`.
