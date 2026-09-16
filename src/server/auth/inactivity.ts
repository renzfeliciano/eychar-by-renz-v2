const DEFAULT_INACTIVITY_MINUTES = 30;

export function getInactivityMs(): number {
  const minutes = Number(process.env.SESSION_INACTIVITY_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INACTIVITY_MINUTES) * 60_000;
}
