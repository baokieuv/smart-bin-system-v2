import { TranslationKey } from "./language";

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  label: string;
  check: boolean;
};

// Thêm tham số t (tùy chọn) để hỗ trợ đa ngôn ngữ
export const getPasswordRules = (password: string, t?: (key: TranslationKey) => string): PasswordRule[] => [
  { 
    label: t ? t("ruleMinLength") : `At least ${PASSWORD_MIN_LENGTH} characters`, 
    check: password.length >= PASSWORD_MIN_LENGTH 
  },
  { 
    label: t ? t("ruleUppercase") : "Includes an uppercase letter", 
    check: /[A-Z]/.test(password) 
  },
  { 
    label: t ? t("ruleNumber") : "Includes a number", 
    check: /\d/.test(password) 
  },
  { 
    label: t ? t("ruleSpecialChar") : "Includes a special character", 
    check: /[^A-Za-z0-9]/.test(password) 
  },
];

export const getPasswordStrengthScore = (password: string) => {
  // Không cần truyền t khi chỉ cần tính điểm check boolean
  const rules = getPasswordRules(password);
  return rules.reduce((score, rule) => score + (rule.check ? 1 : 0), 0);
};

export const isPasswordStrongEnough = (password: string) => getPasswordStrengthScore(password) >= 4;