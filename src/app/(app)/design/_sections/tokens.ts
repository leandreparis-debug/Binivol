/** Colour tokens listed on the design page (name, CSS variable, hex). */
export const COLOR_TOKENS = [
  { name: "canvas", value: "#ECECEA", usage: "Fond de l'application" },
  { name: "surface", value: "#FFFFFF", usage: "Cartes, menus" },
  { name: "veil", value: "#F5F5F3", usage: "Sous-blocs, survols, onglets inactifs" },
  { name: "ink", value: "#121212", usage: "Texte, actions principales, élément actif" },
  { name: "ink-2", value: "#2B2B2B", usage: "Texte secondaire fort, survol de ink" },
  { name: "muted", value: "#6A6A69", usage: "Texte secondaire (ajusté depuis #717170)" },
  { name: "line", value: "#E5E5E2", usage: "Filets" },
  { name: "accent", value: "#1F6BFF", usage: "Accent unique (signale)" },
  { name: "accent-2", value: "#5B93FF", usage: "Haut des dégradés" },
  { name: "accent-soft", value: "#E2EBFF", usage: "Fond doux d'accent" },
  { name: "accent-ink", value: "#1748B8", usage: "Texte accent sur fond doux" },
  { name: "ok", value: "#22A06B", usage: "Pastille OK" },
  { name: "ok-soft", value: "#DFF5EA", usage: "Fond doux OK" },
  { name: "ok-ink", value: "#176B48", usage: "Texte OK sur fond doux (ajout)" },
  { name: "warn", value: "#E5A100", usage: "Pastille alerte" },
  { name: "warn-soft", value: "#FFF3D1", usage: "Fond doux alerte" },
  { name: "warn-ink", value: "#8A6200", usage: "Texte alerte sur fond doux" },
  { name: "danger", value: "#D92D3A", usage: "Pastille danger" },
  { name: "danger-soft", value: "#FDE3E5", usage: "Fond doux danger" },
  { name: "danger-ink", value: "#A81E29", usage: "Texte danger sur fond doux (ajout)" },
] as const;

export const TYPE_SCALE = [
  { name: "display", className: "text-display", spec: "44 / 48 · 500 · −0,035em" },
  { name: "figure", className: "text-figure tabular-nums", spec: "34 / 36 · 500 · tabular-nums" },
  { name: "title", className: "text-title", spec: "24 / 30 · 500" },
  { name: "section", className: "text-section", spec: "19 / 26 · 600" },
  { name: "body", className: "text-body", spec: "15 / 22 · 400" },
  { name: "small", className: "text-small", spec: "13 / 18" },
  {
    name: "mono",
    className: "text-mono font-mono",
    spec: "12,5 / 18 · Geist Mono (auto-hébergée)",
  },
] as const;
