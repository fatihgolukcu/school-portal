// Supabase Auth requires an email address. Username accounts use a hidden address on a
// reserved, non-routable domain so staff can sign in with just "admin" or "havva".
// Keep in sync with netlify/lib/server.ts.
export const USERNAME_DOMAIN = 'users.schoolportal.invalid';
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export const isUsername = (input: string) => !input.includes('@');

/** Normalises a typed username ("Admin " → "admin"). */
export const normaliseUsername = (input: string) => input.trim().toLowerCase();

/** Turns "admin" into the hidden sign-in address; email addresses pass through unchanged. */
export function toLoginEmail(input: string) {
  const value = input.trim();
  if (!isUsername(value)) return value.toLowerCase();
  return `${normaliseUsername(value)}@${USERNAME_DOMAIN}`;
}

export const isUsernameAccount = (email?: string | null) =>
  !!email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);

/** Shows "admin" for username accounts and the real address for everyone else. */
export const displayLogin = (email?: string | null) =>
  !email ? '' : isUsernameAccount(email) ? email.slice(0, email.indexOf('@')) : email;
