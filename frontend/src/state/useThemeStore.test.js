import { describe, test, expect, beforeEach, vi } from "vitest";

const listeners = new Set();
const media = { matches: false };

window.matchMedia = vi.fn(() => ({
  get matches() {
    return media.matches;
  },
  addEventListener: (_event, handler) => listeners.add(handler),
  removeEventListener: (_event, handler) => listeners.delete(handler),
}));

function setSystemDark(isDark) {
  media.matches = isDark;
  listeners.forEach((handler) => handler({ matches: isDark }));
}

const { useThemeStore, MODE_CYCLE } = await import("@/state/useThemeStore");

describe("useThemeStore appearance modes", () => {
  beforeEach(() => {
    media.matches = false;
    useThemeStore.getState().setMode("system");
  });

  test("defaults to following the system", () => {
    expect(useThemeStore.getInitialState().mode).toBe("system");
  });

  test("resolves system against the OS preference", () => {
    expect(useThemeStore.getState().resolvedMode).toBe("light");

    media.matches = true;
    useThemeStore.getState().setMode("system");
    expect(useThemeStore.getState().resolvedMode).toBe("dark");
  });

  test("an explicit mode wins over the OS preference", () => {
    media.matches = true;
    useThemeStore.getState().setMode("light");

    expect(useThemeStore.getState().resolvedMode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("repaints when the OS preference changes while following it", () => {
    useThemeStore.getState().watchSystemMode();

    setSystemDark(true);

    expect(useThemeStore.getState().resolvedMode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("ignores OS changes once a mode is chosen explicitly", () => {
    useThemeStore.getState().watchSystemMode();
    useThemeStore.getState().setMode("light");

    setSystemDark(true);

    expect(useThemeStore.getState().resolvedMode).toBe("light");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  test("toggles through system, light and dark", () => {
    const seen = MODE_CYCLE.map(() => {
      const { mode } = useThemeStore.getState();
      useThemeStore.getState().toggleMode();
      return mode;
    });

    expect(seen).toEqual(["system", "light", "dark"]);
    expect(useThemeStore.getState().mode).toBe("system");
  });
});
