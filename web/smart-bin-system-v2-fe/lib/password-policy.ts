// Shared password validation rules and strength helpers.

export type PasswordRule = {
  label: string;
  check: boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

export const getPasswordRuleChecks = (password: string) => {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSpecialChar,
  };
};

export const getPasswordRules = (password: string): PasswordRule[] => {
  const checks = getPasswordRuleChecks(password);

  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, check: checks.hasMinLength },
    { label: 'Contains uppercase letter', check: checks.hasUppercase },
    { label: 'Contains number', check: checks.hasNumber },
    { label: 'Contains special character', check: checks.hasSpecialChar },
  ];
};

export const getPasswordStrengthScore = (password: string) => {
  const checks = getPasswordRuleChecks(password);
  return Number(checks.hasMinLength) + Number(checks.hasUppercase) + Number(checks.hasNumber) + Number(checks.hasSpecialChar);
};

export const isPasswordStrongEnough = (password: string) => {
  const checks = getPasswordRuleChecks(password);
  return checks.hasMinLength && checks.hasUppercase && checks.hasNumber && checks.hasSpecialChar;
};
