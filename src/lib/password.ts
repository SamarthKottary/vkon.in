import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing, on `node:crypto` alone.
 *
 * The dependency policy (ARCHITECTURE.md §2) is why this is hand-written
 * rather than `bcrypt` or `argon2`: both are native modules with a build step,
 * and scrypt is in the standard library, is memory-hard, and is what RFC 7914
 * exists for. There is no cryptography invented here — the only decisions are
 * the parameters and the encoding, and both are recorded below.
 *
 * **Format:** `scrypt$N$r$p$saltHex$hashHex`. The parameters travel *inside*
 * the stored value rather than living in a constant, so raising them later
 * re-hashes new passwords while every existing one still verifies against the
 * cost it was written with. A constant would invalidate the whole table.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * N = 2^15 costs about 32 MB and ~100 ms per hash on the deployment box.
 *
 * OWASP's floor for scrypt is 2^17, which is four times that memory on every
 * single sign-in. This deploys as one small self-hosted container that also
 * serves the site, and 2^17 measured badly enough there to be a availability
 * problem of its own. 2^15/r=8/p=1 is the documented acceptable alternative
 * when paired with a real rate limit on the sign-in path, which
 * `account/actions.ts` has. Raise N here when the box gets bigger: old hashes
 * keep working, because the cost is stored per-hash.
 */
const N = 32768;
const R = 8;
const P = 1;
/** Explicit, because the default 32 MB is exactly what N=2^15 needs and the
 *  check is not generous about "exactly". */
const MAXMEM = 96 * 1024 * 1024;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** Bounds enforced before hashing. A megabyte-long "password" is a denial of
 *  service against a deliberately slow function, not a strong password. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time verify.
 *
 * Returns false for every malformed or absent hash rather than throwing: a
 * Google-only account has `password_hash = NULL`, and "sign in with a password
 * you never set" must be an ordinary failed sign-in, not a 500 that tells the
 * caller the account exists.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  /* A tampered row must not be able to ask this process for 8 GB. */
  if (n > 1 << 20 || r > 32 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "hex");
    expected = Buffer.from(parts[5], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * The rule stated once, so the register form, the reset form and the server
 * action cannot drift apart on what counts as acceptable.
 *
 * Length only, plus a check against the handful of passwords that are always
 * tried first. Composition rules ("one capital, one symbol") push people
 * towards `Password1!` and are no longer recommended by NIST; length is what
 * actually costs an attacker anything.
 */
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
  return null;
}

export * from "./password-policy";

