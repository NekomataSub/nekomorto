## 2024-05-18 - Improve string array sorting performance
**Learning:** String.prototype.localeCompare inside an Array.prototype.sort() callback is extremely slow because it implicitly instantiates an Intl.Collator for every comparison. Pre-instantiating Intl.Collator outside the loop improves performance significantly, especially for large arrays (O(N log N) comparisons).
**Action:** Always prefer initializing a single Intl.Collator (like the ones exposed in `search-ranking.ts`) and reusing its `.compare` method instead of directly calling `a.localeCompare(b)` when sorting collections.
