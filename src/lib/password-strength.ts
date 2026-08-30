// Shared client-side password strength rules — mirrors the server-side
// `passwordSchema` in `src/lib/validations.ts` so the UI can give instant
// feedback before submitting, without duplicating the actual enforcement
// (the server always re-validates).
export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordRuleCheck {
  key: string;
  labelFa: string;
  labelEn: string;
  passed: boolean;
}

export function checkPasswordRules(password: string): PasswordRuleCheck[] {
  return [
    {
      key: "length",
      labelFa: `حداقل ${PASSWORD_MIN_LENGTH} کاراکتر`,
      labelEn: `At least ${PASSWORD_MIN_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      key: "lower",
      labelFa: "حداقل یک حرف کوچک انگلیسی (a-z)",
      labelEn: "At least one lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      key: "upper",
      labelFa: "حداقل یک حرف بزرگ انگلیسی (A-Z)",
      labelEn: "At least one uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      key: "digit",
      labelFa: "حداقل یک عدد (0-9)",
      labelEn: "At least one digit",
      passed: /[0-9]/.test(password),
    },
    {
      key: "special",
      labelFa: "حداقل یک کاراکتر خاص (!@#$%...)",
      labelEn: "At least one special character",
      passed: /[^a-zA-Z0-9]/.test(password),
    },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return checkPasswordRules(password).every((rule) => rule.passed);
}

export function passwordStrengthScore(password: string): number {
  if (!password) return 0;
  const rules = checkPasswordRules(password);
  return rules.filter((rule) => rule.passed).length / rules.length;
}
