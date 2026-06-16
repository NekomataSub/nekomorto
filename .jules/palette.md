## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## $(date +%Y-%m-%d) - Add missing ARIA labels to dashboard settings icon buttons
**Learning:** Found an accessibility issue pattern specific to this app's components where `DashboardActionButton`s configured with `size="icon"` (typically used for "Delete" or "Remove" actions with Lucide icons) across various settings tabs lacked `aria-label`s, rendering them inscrutable to screen readers.
**Action:** When adding or modifying `DashboardActionButton`s or other icon-only buttons in the application, ensure an explicit `aria-label` attribute in Portuguese (e.g., `aria-label="Remover tradução de tag"`) is consistently provided.
