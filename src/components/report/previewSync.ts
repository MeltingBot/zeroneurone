/** Content sent on leaving write mode, and the value it replaced */
export interface PendingSend {
  sent: string;
  before: string;
}

/**
 * The preview's answer to a new `value` while content just sent is pending:
 * keep showing what was sent while `value` is still the one it replaced (no
 * flash of the old text); take any other value, our echo or a collaborator's
 * edit merged with it.
 */
export function previewOnValue(value: string, pending: PendingSend): { show: string; pending: PendingSend | null } {
  if (value === pending.before) return { show: pending.sent, pending };
  return { show: value, pending: null };
}
