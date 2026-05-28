export const normalizeKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const buildTranslationMap = (record?: Record<string, string>) => {
  const map = new Map<string, string>();
  Object.entries(record || {}).forEach(([key, value]) => {
    const normalized = normalizeKey(key);
    if (!normalized) {
      return;
    }
    map.set(normalized, String(value ?? ""));
  });
  return map;
};

export const translateTag = (tag: string, map: Map<string, string>) => {
  const translated = map.get(normalizeKey(tag));
  return translated && translated.trim() ? translated : tag;
};

export const translateGenre = (genre: string, map: Map<string, string>) => {
  const translated = map.get(normalizeKey(genre));
  return translated && translated.trim() ? translated : genre;
};

const anilistRoleEntries: Array<[string, string]> = [
  ["director", "Direção"],
  ["chief director", "Diretor chefe"],
  ["assistant director", "Direção assistente"],
  ["action director", "Direção de ação"],
  ["series composition", "Composição de série"],
  ["script", "Roteiro"],
  ["storyboard", "Storyboard"],
  ["story", "História"],
  ["episode director", "Direção de episódio"],
  ["original story", "História original"],
  ["original creator", "Autor original"],
  ["original work assistance", "Assistência de obra original"],
  ["character design", "Design de personagens"],
  ["original character design", "Design original de personagens"],
  ["original character design assistance", "Assistência de design original de personagens"],
  ["chief character design", "Design-chefe de personagens"],
  ["animation director", "Direção de animação"],
  ["main animator", "Animador principal"],
  ["chief animation director", "Direção-chefe de animação"],
  ["key animation", "Animação-chave"],
  ["in-between animation", "Intercalação"],
  ["art director", "Direção de arte"],
  ["art design", "Design de arte"],
  ["background art", "Arte de fundo"],
  ["color design", "Design de cor"],
  ["color coordinator", "Coordenação de cor"],
  ["director of photography", "Direção de fotografia"],
  ["photography director", "Direção de fotografia"],
  ["editing", "Edição"],
  ["music", "Música"],
  ["sound director", "Direção de som"],
  ["sound effects", "Efeitos sonoros"],
  ["sound design", "Design de som"],
  ["theme song performance", "Performance da música tema"],
  ["theme song performance (op)", "Performance da música tema (OP)"],
  ["theme song performance (ed)", "Performance da música tema (ED)"],
  ["producer", "Produção"],
  ["assistant producer", "Produção assistente"],
  ["production", "Produção"],
  ["production assistant", "Assistência de produção"],
  ["3d director", "Direção 3D"],
  ["3d animation", "Animação 3D"],
  ["3d modeling", "Modelagem 3D"],
  ["cg director", "Direção de CG"],
  ["mechanical design", "Design mecânico"],
  ["prop design", "Design de props"],
  ["design assistance", "Assistência de design"],
  ["title logo design", "Design do logo do título"],
  ["design works", "Design works"],
  ["layout", "Layout"],
  ["literary arts", "Artes literárias"],
  ["special effects", "Efeitos especiais"],
  ["cg", "CG"],
  ["design", "Design"],
  ["casting", "Casting"],
  ["supervisor", "Supervisor"],
  ["creative producer", "Produção criativa"],
  ["illustration", "Ilustração"],
];

const relationEntries: Array<[string, string]> = [
  ["adaptation", "Adaptação"],
  ["prequel", "Prequela"],
  ["sequel", "Sequência"],
  ["parent", "Principal"],
  ["side_story", "História paralela"],
  ["side story", "História paralela"],
  ["spin_off", "Spin-off"],
  ["spin-off", "Spin-off"],
  ["source", "Fonte"],
  ["compilation", "Compilação"],
  ["contains", "Contém"],
  ["character", "Personagem"],
  ["summary", "Resumo"],
  ["alternative", "Alternativo"],
  ["other", "Outro"],
];

const anilistRoleMap = new Map<string, string>(anilistRoleEntries);
const relationMap = new Map<string, string>(relationEntries);

export const translateAnilistRole = (role: string, map: Map<string, string>) => {
  const normalized = normalizeKey(role);
  if (!normalized) {
    return role;
  }
  const fromSettings = map.get(normalized);
  if (fromSettings && fromSettings.trim()) {
    return fromSettings;
  }
  return anilistRoleMap.get(normalized) || role;
};

export const translateRelation = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Relacionamento";
  }
  const normalized = normalizeKey(raw).replace(/-/g, "_");
  return relationMap.get(normalized) || relationMap.get(normalized.replace(/_/g, " ")) || raw;
};

export const sortByTranslatedLabel = <T>(
  items: T[],
  translator: (item: T) => string,
  locale = "pt-BR",
) => {
  const collator = new Intl.Collator(locale);
  return [...items].sort((a, b) => collator.compare(translator(a), translator(b)));
};
