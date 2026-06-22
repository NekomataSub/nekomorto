## 2025-02-28 - React.memo for recursive list rendering
**Learning:** In React, recursive rendering of lists (like nested comment trees) using inline functions (`renderComment`) causes unnecessary re-renders of the entire tree when state changes (like typing in a form input).
**Action:** Extract recursive render functions into standalone components wrapped in `React.memo`, and ensure props like event handlers are memoized with `useCallback`. This significantly reduces React reconciliation overhead.

## 2025-02-28 - O(N) date parsing optimization for Comment Trees
**Learning:** When constructing recursive nested trees from flat API lists (e.g., comments) and sorting them by date using `Date(string).getTime()`, placing the `new Date()` object instantiation inside the nested `.sort()` function call invokes O(N log N) recursive date parsing operations, which heavily bottlenecks the main thread on platforms that use slower engines for `new Date()`.
**Action:** Pre-compute and map timestamps on the `CommentNode` itself inside an initial, simple O(N) loop before any sorting or recursive mapping occurs, transforming `O(N log N)` date parses into a simple array mutation.
## 2025-04-27 - [Precomputing Timestamps in O(N log N) Sort Operations]
**Learning:** Parsing strings like `Date.getTime()` inside `.sort()` array comparators can cause significant bottlenecks in frequently rendered or large datasets since `.sort()` operations execute the comparator multiple times per item (O(N log N)).
**Action:** Always precompute heavy operations during an initial O(N) map iteration when sorting objects by derived keys, using a Schwartzian transform (map-sort-map).
## 2025-05-01 - Avoid precomputing timestamps unconditionally
**Learning:** Precomputing timestamps for sorting avoids O(N log N) date parsing, but precomputing them unconditionally when the array might be sorted by non-date keys (e.g., alphabetically or by views) introduces unnecessary O(N) date parsing overhead.
**Action:** Only precompute timestamps inside `useMemo` hooks if the selected `sortMode` actually utilizes those timestamps for sorting.
## 2026-06-22 - Optimize string sorting with Intl.Collator\n**Learning:** String.prototype.localeCompare implicitly initializes a new Intl.Collator instance for every invocation, leading to poor performance within Array.prototype.sort comparators on large data sets.\n**Action:** Use pre-initialized Intl.Collator instances, like the `comparePtBrVariant` helper in `src/lib/search-ranking.ts`, to safely sort localized strings without instantiation overhead, preserving the default 'variant' sensitivity.
