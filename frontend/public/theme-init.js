// Paints the stored (or system) appearance before first render, so there is no
// flash of the wrong theme. Kept out of index.html because production serves
// script-src 'self', which blocks inline scripts.
(() => {
  const root = document.documentElement;
  const defaultLight = {
    background: "#F9FAFB",
    foreground: "#111827",
    primary: "#4F46E5",
    secondary: "#F3F4F6",
    accent: "#6366F1",
    muted: "#9CA3AF",
    border: "#E5E7EB",
    surface: "#F3F4F6",
    "surface-strong": "#E5E7EB",
    "surface-stronger": "#D1D5DB",
    overlay: "#9CA3AF",
    "overlay-strong": "#6B7280",
    text: "#111827",
    "text-muted": "#6B7280",
    "text-subtle": "#4B5563",
    red: "#DC2626",
    green: "#16A34A",
    yellow: "#CA8A04",
    blue: "#2563EB",
    pink: "#DB2777",
    teal: "#0D9488",
    mauve: "#7C3AED",
    peach: "#EA580C",
    sky: "#0284C7",
    lavender: "#818CF8",
    canvas: "#F9FAFB",
    "canvas-alt": "#FFFFFF",
    "canvas-strong": "#F3F4F6",
  };
  const defaultDark = {
    background: "#09090b",
    foreground: "#FAFAFA",
    primary: "#6366F1",
    secondary: "#18181b",
    accent: "#818CF8",
    muted: "#52525B",
    border: "#27272a",
    surface: "#18181b",
    "surface-strong": "#121215",
    "surface-stronger": "#1E1B4B",
    overlay: "#27272a",
    "overlay-strong": "#3f3f46",
    text: "#FAFAFA",
    "text-muted": "#A1A1AA",
    "text-subtle": "#D4D4D8",
    red: "#F87171",
    green: "#4ADE80",
    yellow: "#FACC15",
    blue: "#60A5FA",
    pink: "#F472B6",
    teal: "#2DD4BF",
    mauve: "#A78BFA",
    peach: "#FB923C",
    sky: "#38BDF8",
    lavender: "#A5B4FC",
    canvas: "#121215",
    "canvas-alt": "#18181b",
    "canvas-strong": "#09090b",
  };

  let mode = "system";
  try {
    const raw = localStorage.getItem("theme-store-v3");
    if (raw) {
      const parsed = JSON.parse(raw);
      mode = parsed?.state?.mode || mode;
    }
  } catch {
    /* ignore */
  }

  const resolvedMode =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  const colors = resolvedMode === "dark" ? defaultDark : defaultLight;

  root.classList.toggle("dark", resolvedMode === "dark");
  root.style.colorScheme = resolvedMode;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${key}`, value);
  });
  root.style.setProperty("--shadow-color", resolvedMode === "dark" ? "9 9 11" : "243 244 246");
  root.style.setProperty("--inverted-text", colors.text);
})();
