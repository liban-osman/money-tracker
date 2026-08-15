// Validated categorical palette (dark mode) — see dataviz skill references/palette.md.
// Fixed order is the CVD-safety mechanism: never reassign by rank/sort order.
export const CATEGORICAL = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

// Chart ink tuned to sit on the GitHub-dark UI chrome below.
export const CHART_INK = {
  primary: "#e6edf3",
  secondary: "#8b949e",
  muted: "#6e7681",
  gridline: "#21262d",
  baseline: "#30363d",
} as const;

export const STATUS = {
  good: "#3fb950",
  critical: "#f85149",
} as const;

// GitHub dark theme (Primer) — page/card chrome.
export const UI = {
  page: "#0d1117",
  surface: "#161b22",
  surfaceRaised: "#21262d",
  surfaceHover: "#30363d",
  border: "#30363d",
  textPrimary: "#e6edf3",
  textSecondary: "#c9d1d9",
  textMuted: "#8b949e",
  textSubtle: "#6e7681",
} as const;
