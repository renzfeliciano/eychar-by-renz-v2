/**
 * "Chrome on Windows", "Safari on iPhone": a short, human description of the
 * browser and system in a User-Agent string, for telling people where their
 * account was signed in. Best effort; unknown parts read as "a browser" /
 * "an unknown device". Never used for security decisions.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari"
    : /Electron\//.test(ua) ? "the desktop app"
    : null;
  const system =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `a browser on ${system}`;
  return "an unknown device";
}

/** Reads one header from Node-style or Fetch-style headers. */
export function readHeader(headers: Record<string, string | string[] | undefined> | Headers | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}
