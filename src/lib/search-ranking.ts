const PT_BR_COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });
const PT_BR_VARIANT_COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "variant" });
const EN_VARIANT_COLLATOR = new Intl.Collator("en", { sensitivity: "variant" });

export type ProjectSearchItem = {
  label: string;
  href: string;
  image?: string;
  synopsis?: string;
  tags: string[];
};

export type PostSearchItem = {
  label: string;
  href: string;
  excerpt?: string;
};

export type RankedItem<T> = {
  item: T;
  score: number;
};

export const normalizeSearchText = (value: string): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const comparePtBr = (a: string, b: string): number =>
  PT_BR_COLLATOR.compare(String(a || ""), String(b || ""));

export const comparePtBrVariant = (a: string, b: string): number =>
  PT_BR_VARIANT_COLLATOR.compare(String(a || ""), String(b || ""));

export const compareEnVariant = (a: string, b: string): number =>
  EN_VARIANT_COLLATOR.compare(String(a || ""), String(b || ""));

export const sortAlphabeticallyPtBr = (values: string[]): string[] => [...values].sort(comparePtBr);

export const selectVisibleTags = (tags: string[], maxTags = 3, maxChars = 18): string[] => {
  const selected: string[] = [];
  for (const rawTag of tags) {
    if (selected.length >= maxTags) {
      break;
    }
    const tag = String(rawTag || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!tag) {
      continue;
    }
    if (Array.from(tag).length > maxChars) {
      continue;
    }
    selected.push(tag);
  }
  return selected;
};

const splitWords = (value: string) =>
  normalizeSearchText(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);

const textIncludesToken = (text: string, token: string) => text.includes(token);

const wordsStartWithToken = (value: string, token: string) =>
  splitWords(value).some((word) => word.startsWith(token));

const scoreTextField = (
  value: string,
  token: string,
  weights: { startsWith: number; wordStartsWith: number; includes: number },
) => {
  const normalized = normalizeSearchText(value);
  if (!normalized || !token) {
    return 0;
  }
  if (normalized.startsWith(token)) {
    return weights.startsWith;
  }
  if (wordsStartWithToken(normalized, token)) {
    return weights.wordStartsWith;
  }
  if (textIncludesToken(normalized, token)) {
    return weights.includes;
  }
  return 0;
};

const scoreTags = (tags: string[], token: string) => {
  let best = 0;
  tags.forEach((tag) => {
    const normalized = normalizeSearchText(tag);
    if (!normalized) {
      return;
    }
    if (normalized.startsWith(token)) {
      best = Math.max(best, 48);
      return;
    }
    if (wordsStartWithToken(normalized, token)) {
      best = Math.max(best, 38);
      return;
    }
    if (normalized.includes(token)) {
      best = Math.max(best, 28);
    }
  });
  return best;
};

const hasTokenMatch = (fields: string[], token: string) =>
  fields.some((field) => normalizeSearchText(field).includes(token));

export const rankProjects = (items: ProjectSearchItem[], query: string): ProjectSearchItem[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked: RankedItem<ProjectSearchItem>[] = [];

  items.forEach((item) => {
    const searchableFields = [
      item.label,
      item.synopsis || "",
      ...(Array.isArray(item.tags) ? item.tags : []),
    ];
    const matchesAllTokens = tokens.every((token) => hasTokenMatch(searchableFields, token));
    if (!matchesAllTokens) {
      return;
    }

    let score = 0;
    tokens.forEach((token) => {
      score += scoreTextField(item.label, token, {
        startsWith: 140,
        wordStartsWith: 110,
        includes: 80,
      });
      score += scoreTags(item.tags || [], token);
      score += scoreTextField(item.synopsis || "", token, {
        startsWith: 24,
        wordStartsWith: 18,
        includes: 12,
      });
    });

    const labelLength = normalizeSearchText(item.label).length;
    score += Math.max(0, 24 - Math.min(labelLength, 24));
    ranked.push({ item, score });
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return comparePtBr(a.item.label, b.item.label);
  });
  return ranked.map((entry) => entry.item);
};

export const rankPosts = (items: PostSearchItem[], query: string): PostSearchItem[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked: RankedItem<PostSearchItem>[] = [];

  items.forEach((item) => {
    const searchableFields = [item.label, item.excerpt || ""];
    const matchesAllTokens = tokens.every((token) => hasTokenMatch(searchableFields, token));
    if (!matchesAllTokens) {
      return;
    }

    let score = 0;
    tokens.forEach((token) => {
      score += scoreTextField(item.label, token, {
        startsWith: 140,
        wordStartsWith: 105,
        includes: 74,
      });
      score += scoreTextField(item.excerpt || "", token, {
        startsWith: 20,
        wordStartsWith: 14,
        includes: 10,
      });
    });

    const labelLength = normalizeSearchText(item.label).length;
    score += Math.max(0, 20 - Math.min(labelLength, 20));
    ranked.push({ item, score });
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return comparePtBr(a.item.label, b.item.label);
  });
  return ranked.map((entry) => entry.item);
};
