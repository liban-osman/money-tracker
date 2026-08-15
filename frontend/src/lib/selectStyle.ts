// Native <select> arrows ignore extra padding in most browsers — the OS
// renders the indicator at a fixed offset regardless. appearance-none
// removes it entirely so this custom chevron (and its position) is the
// only one left, fully under our control via padding-right on the element.
export const selectChevronStyle = {
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238b949e' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.65rem center",
  backgroundSize: "1.1em 1.1em",
} as const;
