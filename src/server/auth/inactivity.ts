const DEFAULT_INACTIVITY_MINUTES = 30;

export function getInactivityMs(): number {
  const minutes = Number(process.env.SESSION_INACTIVITY_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INACTIVITY_MINUTES) * 60_000;
}

const DEFAULT_SESSION_MAX_HOURS = 12;

/** The absolute cap on a session's life however active it stays (SESSION_MAX_HOURS, default 12). */
export function getSessionMaxAgeMs(): number {
  const hours = Number(process.env.SESSION_MAX_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_SESSION_MAX_HOURS) * 60 * 60_000;
}
