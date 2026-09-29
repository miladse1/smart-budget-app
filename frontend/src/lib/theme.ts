/** Light / dark / system theme. Stored per device; resolves to data-theme on <html>. */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "budgetflow.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice = readTheme()) {
  const dark = choice === "dark" || (choice === "system" && media().matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", dark ? "#0b100d" : "#faf9f5");
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
  applyTheme(choice);
}

export function watchSystemTheme() {
  const listener = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  media().addEventListener("change", listener);
  return () => media().removeEventListener("change", listener);
}
