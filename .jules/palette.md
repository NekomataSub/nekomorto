## $(date +%Y-%m-%d) - Added ARIA labels to Settings Dashboard Trash Buttons
**Learning:** Found several icon-only action buttons (e.g. Delete/Trash) in the dashboard settings layout missing `aria-label`s, indicating this might be a pattern across internal dashboard components where functionality is prioritized over a11y.
**Action:** Always verify icon-only buttons (`DashboardActionButton` using Lucide icons) have appropriate `aria-label`s, especially in complex list/array configuration forms. Keep them in Portuguese to match the app's language context.
## 2026-06-12 - Add specific ARIA labels to icon-only delete buttons in dynamic mapped lists
**Learning:** Icon-only delete buttons inside `.map()` iterations often lack distinct `aria-label` attributes and include screen reader announcements for the icon itself. Using generic labels like 'Remover' makes it hard for users of assistive technologies to distinguish which exact item is being removed.
**Action:** Always append dynamic properties (e.g., `item.label` or `index + 1`) to the `aria-label` of icon-only action buttons inside loops, and add `aria-hidden="true"` to the nested icon element to prevent redundant announcements.
