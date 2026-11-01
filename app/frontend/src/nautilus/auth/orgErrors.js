// What to tell someone when creating or joining an organization fails. The API
// sends a stable `code` for the cases a person can act on.
export function orgErrorMessage(error) {
  switch (error?.code) {
    case 'invalid_join_code':
      return 'That code doesn’t match an organization. Check it with your admin — they may have made a new one.';
    case 'membership_inactive':
      return 'Your access to that organization was turned off. Ask its admin to turn it back on.';
    case 'already_in_organization':
      return 'This account already belongs to an organization. To join or start another one, sign up with a different email.';
    default:
      return error?.message || 'Something went wrong. Try again.';
  }
}
