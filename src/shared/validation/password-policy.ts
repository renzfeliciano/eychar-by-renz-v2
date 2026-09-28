/**
 * Password rules for every account (staff and self-service), following
 * NIST SP 800-63B: length over complexity, a block list of common and
 * predictable choices, and nothing built from the account's own name. No
 * forced symbol mixes or periodic expiry; those push people to predictable
 * patterns.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Common passwords and keyboard walks, compared after lower-casing and
// stripping trailing digits and symbols ("Password1234!" → "password").
const COMMON = new Set([
  "password",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "password1",
  "qwerty",
  "qwertyuiop",
  "qwertyuiop[]",
  "asdfghjkl",
  "zxcvbnm",
  "abcdefg",
  "abcdefgh",
  "abcdefghijkl",
  "abc",
  "letmein",
  "welcome",
  "admin",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "basketball",
  "superman",
  "batman",
  "trustno",
  "changeme",
  "secret",
  "master",
  "login",
  "starwars",
  "whatever",
  "freedom",
  "shadow",
  "michael",
  "jennifer",
  "charlie",
  "hello",
  "helloworld",
  "computer",
  "internet",
  "pcas",
  "workforce",
  "workforcehub",
  "hris",
  "company",
  "summer",
  "winter",
  "spring",
  "autumn",
  "mahalkita",
  "iloveu",
  "pilipinas",
  "philippines",
  "manila",
  "",
]);

export type PasswordContext = { username?: string | null; email?: string | null };

export function checkPassword(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);

  const lowered = password.toLowerCase();
  const stem = lowered.replace(/[\d\W_]+$/, "");
  if (COMMON.has(lowered) || COMMON.has(stem) || /^\d+$/.test(password)) {
    problems.push("This password is too common. Choose something less predictable.");
  }
  if (new Set(password).size < 5) problems.push("Avoid repeating the same character.");

  const names = [context.username, context.email?.split("@")[0]].filter((name): name is string => Boolean(name && name.length >= 3));
  if (names.some((name) => lowered.includes(name.toLowerCase()))) {
    problems.push("Don't include your username or email in the password.");
  }
  return problems;
}
