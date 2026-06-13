export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  label: string;
  check: boolean;
};

export const getPasswordRules = (password: string): PasswordRule[] => [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, check: password.length >= PASSWORD_MIN_LENGTH },
  { label: "Includes an uppercase letter", check: /[A-Z]/.test(password) },
  { label: "Includes a number", check: /\d/.test(password) },
  { label: "Includes a special character", check: /[^A-Za-z0-9]/.test(password) },
];

export const getPasswordStrengthScore = (password: string) => {
  const rules = getPasswordRules(password);
  return rules.reduce((score, rule) => score + (rule.check ? 1 : 0), 0);
};

export const isPasswordStrongEnough = (password: string) => getPasswordStrengthScore(password) >= 4;