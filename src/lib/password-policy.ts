/**
 * The password policy — rules, checks and the strength score.
 *
 * **This file is deliberately free of `node:` imports, and that is the whole
 * reason it is a separate module from `lib/password.ts`.** The policy is
 * needed in two places: the server, which validates it, and the browser, which
 * shows the live checklist somebody types against. The hashing is needed only
 * on the server.
 */

export type PasswordRule = {
  key: string;
  label: string;
  requirement: string;
  test: (password: string) => boolean;
};

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "length",
    label: `At least ${PASSWORD_MIN} characters`,
    requirement: `at least ${PASSWORD_MIN} characters`,
    test: (p) => p.length >= PASSWORD_MIN,
  },
  {
    key: "lower",
    label: "One lower-case letter (a–z)",
    requirement: "a lower-case letter (a–z)",
    test: (p) => /[a-z]/.test(p),
  },
  {
    key: "upper",
    label: "One capital letter (A–Z)",
    requirement: "a capital letter (A–Z)",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    key: "digit",
    label: "One number (0–9)",
    requirement: "a number (0–9)",
    test: (p) => /[0-9]/.test(p),
  },
  {
    key: "special",
    label: "One symbol (! ? @ # - . or similar)",
    requirement: "a symbol, such as ! ? @ # - or .",
    test: (p) => /[^a-zA-Z0-9]/.test(p),
  },
];

const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "iloveyou",
  "abc12345",
  "admin123",
  "vkon1234",
  "welcome1",
]);

export function checkPassword(password: string): Record<string, boolean> {
  const res: Record<string, boolean> = {};
  for (const rule of PASSWORD_RULES) {
    res[rule.key] = rule.test(password);
  }
  return res;
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Please use at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return "That password is too long.";
  }
  if (COMMON.has(password.toLowerCase())) {
    return "That password is too easy to guess. Please pick another.";
  }
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) {
      return `Your password needs ${rule.requirement}.`;
    }
  }
  return null;
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;

  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  if (met < PASSWORD_RULES.length) return password.length >= 6 ? 1 : 0;
  if (COMMON.has(password.toLowerCase())) return 1;

  const distinct = new Set(password).size;
  if (password.length >= 16 && distinct >= 10) return 4;
  if (password.length >= 12 && distinct >= 8) return 3;
  return 2;
}

/**
 * Whether the two boxes agree, for the forms that ask for a password twice —
 * register, reset, and set-or-change on the account page.
 *
 * Lives here rather than in each action so all three say the same thing, and
 * here rather than in `lib/password.ts` because it is pure string comparison:
 * that module pulls in `node:crypto` and cannot be imported by a client
 * component. `PasswordField` shows its own live hint while typing; this is the
 * check that actually decides, because the second box is a plain form field
 * and a request can simply omit it.
 */
export const PASSWORD_MISMATCH = "Both entries must be the same.";

export function confirmationProblem(
  password: string,
  confirmation: string,
): string | null {
  return password === confirmation ? null : PASSWORD_MISMATCH;
}
