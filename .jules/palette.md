## 2025-06-06 - Accessible Icon-Only Delete Buttons in Settings

**Learning:** When using mapped UI components (like `DashboardActionButton` wrapping an icon such as `<Trash2>`) to delete items in a dynamic list, screen readers require specific, contextual `aria-label`s (e.g., `aria-label={"Remover tradução da tag " + tag}`) to distinguish the buttons. Additionally, the nested SVG icon itself should be explicitly hidden with `aria-hidden="true"` so that screen readers don't attempt to announce both the button label and the generic "SVG" or icon element.

**Action:** Whenever implementing icon-only buttons, especially inside lists or tables, ensure the wrapping button receives a clear, dynamically contextual `aria-label` and the inner icon component has `aria-hidden="true"`.
