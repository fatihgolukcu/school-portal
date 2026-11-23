import { createClient } from '@supabase/supabase-js';

// Keep in sync with src/accounts.ts.
export const USERNAME_DOMAIN = 'users.schoolportal.invalid';
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function serviceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function siteOrigin(): string {
  const url = new URL(requiredEnv('URL'));
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('URL must use HTTPS (HTTP is permitted only for localhost)');
  }
  return url.origin;
}

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}
