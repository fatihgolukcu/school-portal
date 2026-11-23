import { USERNAME_DOMAIN, USERNAME_PATTERN, json, serviceClient, siteOrigin } from '../lib/server';

const allowedRoles = new Set([
  'administrator',
  'academic_manager',
  'teacher',
  'guidance',
  'parent',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function invite(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'POST required.' });
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Sign in before inviting a user.' });

  try {
    const db = serviceClient();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user)
      return json(401, { error: 'Your session has expired. Sign in again.' });
    const { data: requester, error: profileError } = await db
      .from('profiles')
      .select('roles, active')
      .eq('id', auth.user.id)
      .single();
    if (profileError || !requester?.active || !requester.roles?.includes('administrator')) {
      return json(403, { error: 'Only an active administrator can invite users.' });
    }

    if (Number(request.headers.get('Content-Length') || 0) > 16384)
      return json(413, { error: 'Request is too large.' });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16384)
      return json(413, { error: 'Request is too large.' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'Invalid JSON.' });
    }
    if (!body || Array.isArray(body) || typeof body !== 'object')
      return json(400, { error: 'A JSON object is required.' });
    // Username accounts get a hidden address on a reserved domain and a password set by the
    // administrator; no email is sent.
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (
      username &&
      (!USERNAME_PATTERN.test(username) || password.length < 10 || password.length > 72)
    )
      return json(400, {
        error:
          'Usernames use 3–32 letters, numbers, dots, dashes or underscores, with a password of at least 10 characters.',
      });
    const email = username
      ? `${username}@${USERNAME_DOMAIN}`
      : typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const language = body.language ?? 'en';
    const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : [];
    const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds)] : [];
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      fullName.length < 2 ||
      fullName.length > 150
    ) {
      return json(400, { error: 'Provide a valid email and a full name of 2–150 characters.' });
    }
    if (
      !['en', 'tr'].includes(language as string) ||
      roles.length === 0 ||
      roles.some((role) => typeof role !== 'string' || !allowedRoles.has(role))
    ) {
      return json(400, { error: 'Choose English or Turkish and at least one valid role.' });
    }
    if (
      (body.studentIds !== undefined && !Array.isArray(body.studentIds)) ||
      studentIds.length > 50 ||
      studentIds.some((id) => typeof id !== 'string' || !uuid.test(id))
    ) {
      return json(400, { error: 'Invalid student links.' });
    }
    if (studentIds.length && !roles.includes('parent'))
      return json(400, { error: 'Student links require the parent role.' });
    if (studentIds.length) {
      const { data: students, error } = await db
        .from('students')
        .select('id')
        .in('id', studentIds as string[]);
      if (error || students?.length !== studentIds.length)
        return json(400, { error: 'One or more selected students no longer exist.' });
    }

    const { data: existingId, error: lookupError } = await db.rpc('find_invited_user_by_email', {
      p_email: email,
    });
    if (lookupError) throw new Error('Account lookup failed');
    let userId: string | undefined = existingId || undefined;
    if (username) {
      if (userId) return json(409, { error: 'That username is already taken.' });
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, language },
      });
      if (error || !data.user)
        return json(502, { error: 'The account could not be created. Try another username.' });
      userId = data.user.id;
    } else if (!userId) {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteOrigin()}/?invite=1`,
        data: { full_name: fullName, language },
      });
      if (error || !data.user)
        return json(502, {
          error:
            'The invitation could not be sent. Check the configured authentication email sender, then retry.',
        });
      userId = data.user.id;
    }
    const { error: provisionError } = await db.rpc('provision_invited_user', {
      p_user_id: userId,
      p_email: email,
      p_full_name: fullName,
      p_roles: roles,
      p_language: language,
      p_student_ids: studentIds,
      p_requested_by: auth.user.id,
    });
    if (provisionError) {
      console.error('invite provision failed', { code: provisionError.code });
      return json(500, {
        error:
          'Account access could not be saved. Retry this invitation; the existing account will be reused.',
      });
    }
    return json(200, { userId, existingUser: Boolean(existingId) });
  } catch {
    console.error('invite failed: check server configuration and service availability');
    return json(500, {
      error: 'Invitations are temporarily unavailable. Contact the administrator.',
    });
  }
}
