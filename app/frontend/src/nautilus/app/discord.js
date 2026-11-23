// Connect Discord (feature 04): shared by the dialog and its tests.

// How often the dialog checks whether the bot has linked the account.
export const POLL_MS = 3000;

// "9:42" for the time left on a code.
export function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
