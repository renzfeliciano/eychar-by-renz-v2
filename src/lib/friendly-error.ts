/**
 * The words browsers and parsers use for their own failures ("Failed to
 * fetch", "Load failed", "Unexpected token '<' ... is not valid JSON") are
 * for developers. A person who loses signal or gets an error page should read
 * a plain sentence instead, so client code shows an error through this and
 * never `err.message` directly.
 */
const NETWORK_FAILURE = /failed to fetch|load failed|network ?error|network request failed|fetch failed/i;
const PARSE_FAILURE = /unexpected token|unexpected end of|is not valid json|json\.parse|in json at position/i;

export const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (NETWORK_FAILURE.test(error.message)) return OFFLINE_MESSAGE;
  if (error instanceof SyntaxError || PARSE_FAILURE.test(error.message)) return fallback;
  // A TypeError that isn't ours (a library or the browser) has nothing a person can act on.
  if (error instanceof TypeError) return fallback;
  return error.message.trim() ? error.message : fallback;
}
