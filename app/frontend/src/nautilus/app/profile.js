// The Profile page: shared by the page and its tests.

// Same rule as sign-up and the reset-password page.
export const MIN_PASSWORD_LENGTH = 8;

// Whether this account signs in with an email and password. One made with
// Google has no Nautilus password to change.
export function signsInWithPassword(user) {
  const meta = user?.app_metadata ?? {};
  const providers = Array.isArray(meta.providers) ? meta.providers : [meta.provider];
  return providers.includes("email");
}

// What's wrong with a new password, field by field, or {} when it's fine.
export function passwordProblems(password, confirm) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (confirm !== password) return { confirm: "The passwords don’t match." };
  return {};
}
