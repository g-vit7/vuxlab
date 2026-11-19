export const themes = {
  default: "Padrão",
  vital: "Vital",
  contrast: "Alto Contraste",
  coffee: "Café",
} as const;
export const modes = {
  system: "Sistema",
  light: "Claro",
  dark: "Escuro",
} as const;
export type Appearance = {
  theme: keyof typeof themes;
  mode: keyof typeof modes;
};

export function localAppearance(): Appearance {
  const theme = localStorage.getItem("vuxlab-palette") ?? "";
  const mode = localStorage.getItem("vuxlab-theme") ?? "";
  return {
    theme: Object.hasOwn(themes, theme)
      ? (theme as Appearance["theme"])
      : "default",
    mode: Object.hasOwn(modes, mode) ? (mode as Appearance["mode"]) : "system",
  };
}

export function saveLocalAppearance(appearance: Appearance) {
  localStorage.setItem("vuxlab-palette", appearance.theme);
  localStorage.setItem("vuxlab-theme", appearance.mode);
}
