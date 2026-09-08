export const admin = {
  updateFailed: 'Could not update the account.',
  suspendPrompt: (email: string) => (
    `Suspend ${email} for how many days?\nLeave blank to suspend until you lift it.`
  ),
  reasonOptional: 'Reason (optional)',
  back: 'Back to Padel Mate',
  eyebrow: 'Administration',
  title: 'Accounts',
  restore: 'Restore',
  suspend: 'Suspend',
  administrator: 'Administrator',
  active: 'Active',
  untilLifted: 'until lifted',
  untilDate: (date: string) => `until ${date}`,
  suspended: (until: string) => `Suspended ${until}`,
  suspendedWithReason: (until: string, reason: string) => `Suspended ${until} — ${reason}`,
  cannotSuspendSelf: 'You cannot suspend your own account.',
  unknownRequest: 'Unknown request.',
  suspensionDaysInvalid: 'Suspension length must be a positive number of days.',
  missingParam: (name: string) => `Missing ${name}.`,
  genericError: 'Something went wrong. Please try again.',
};
