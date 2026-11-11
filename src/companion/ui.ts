/** Class names of the companion, from the ZN design system (CLAUDE.md) */

export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 bg-accent text-white hover:bg-accent-hover px-3 py-2.5 text-sm font-medium rounded sketchy-border disabled:opacity-50 disabled:pointer-events-none';

export const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 border border-border-default text-text-primary bg-bg-primary hover:bg-bg-secondary px-3 py-2.5 text-sm font-medium rounded sketchy-border disabled:opacity-50 disabled:pointer-events-none';

/** Secondary button for a destructive action (its own colour, no conflicting text class) */
export const dangerButton = secondaryButton.replace('text-text-primary', 'text-error');

export const inputClass =
  'w-full px-2 py-2 text-base rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent sketchy-border';

export const sectionTitle = 'text-xs text-text-secondary font-medium uppercase tracking-wider';

/** Option of a choice group: the selected one stands out (one class set each, no conflicting borders) */
export function choiceButton(selected: boolean): string {
  return `inline-flex items-center justify-center gap-1.5 min-h-12 px-3 text-sm font-medium rounded sketchy-border border ${
    selected
      ? 'border-accent bg-accent-light text-accent'
      : 'border-border-default bg-bg-primary text-text-secondary'
  }`;
}

const iconBase =
  'inline-flex items-center justify-center flex-shrink-0 rounded sketchy-border border disabled:opacity-50 disabled:pointer-events-none';

/** Square icon-only actions (the label goes to aria-label) */
export const iconButtons = {
  secondary: `${iconBase} border-border-default bg-bg-primary text-text-secondary active:bg-bg-secondary`,
  primary: `${iconBase} border-accent bg-accent text-white active:bg-accent-hover`,
  danger: `${iconBase} border-border-default bg-bg-primary text-error active:bg-bg-secondary`,
  /** Second tap of a deletion */
  confirm: `${iconBase} border-error bg-error text-white`,
} as const;
