import { USERNAME_DOMAIN, json, serviceClient, siteOrigin } from '../lib/server';

// Administrator account tools: set a password, send a reset link, or delete an unused account.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set(['set_password', 'send_reset', 'delete']);

export default async function manageUser(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'POST required.' });
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Sign in again. / Yeniden giriş yapın.' });

  try {
    const db = serviceClient();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user)
      return json(401, {
        error:
          'Your session has expired. Sign in again. / Oturumunuz sona erdi, yeniden giriş yapın.',
      });
    const { data: requester, error: profileError } = await db
      .from('profiles')
      .select('roles, active')
      .eq('id', auth.user.id)
      .single();
    if (profileError || !requester?.active || !requester.roles?.includes('administrator'))
      return json(403, {
        error:
          'Only an active administrator can manage accounts. / Hesapları yalnızca aktif yönetici yönetebilir.',
      });

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096)
      return json(413, { error: 'Request is too large.' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'Invalid JSON.' });
    }
    const action = typeof body?.action === 'string' ? body.action : '';
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    if (!actions.has(action) || !uuid.test(userId))
      return json(400, { error: 'Unknown action or user.' });

    const { data: target, error: targetError } = await db
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();
    if (targetError || !target)
      return json(404, { error: 'User not found. / Kullanıcı bulunamadı.' });
    const log = (name: string) =>
      db.from('audit_log').insert({
        actor_id: auth.user.id,
        action: name,
        entity_type: 'profiles',
        entity_id: userId,
        details: { email: target.email },
      });

    if (action === 'set_password') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 10 || password.length > 72)
        return json(400, {
          error: 'Use a password of 10–72 characters. / Şifre 10–72 karakter arasında olmalıdır.',
        });
      const { error } = await db.auth.admin.updateUserById(userId, { password });
      if (error)
        return json(502, {
          error: 'The password could not be changed. / Şifre değiştirilemedi.',
        });
      await log('password_set');
      return json(200, { ok: true });
    }

    if (action === 'send_reset') {
      const email = String(target.email || '').toLowerCase();
      if (!email || email.endsWith(`@${USERNAME_DOMAIN}`))
        return json(400, {
          error:
            'Username accounts have no email. Set a new password instead. / Kullanıcı adı hesaplarının e-postası yok; yeni şifre belirleyin.',
        });
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteOrigin()}/reset-password`,
      });
      if (error)
        return json(502, {
          error: 'The reset email could not be sent. / Sıfırlama e-postası gönderilemedi.',
        });
      await log('password_reset_sent');
      return json(200, { ok: true });
    }

    // delete
    if (userId === auth.user.id)
      return json(400, {
        error: 'You cannot delete your own account. / Kendi hesabınızı silemezsiniz.',
      });
    const { error: deleteError } = await db.rpc('delete_unused_profile', {
      p_profile_id: userId,
      p_actor_id: auth.user.id,
    });
    if (deleteError) {
      if (deleteError.message?.includes('has_records'))
        return json(409, {
          code: 'has_records',
          error:
            'This person already has school records (classes, attendance, reports…). Archive them instead. / Bu kişinin okul kayıtları var (sınıf, yoklama, rapor…). Bunun yerine arşivleyin.',
        });
      if (deleteError.message?.includes('administrator'))
        return json(409, {
          error: 'Keep at least one active administrator. / En az bir aktif yönetici kalmalıdır.',
        });
      console.error('delete_unused_profile failed', { code: deleteError.code });
      return json(500, { error: 'The user could not be deleted. / Kullanıcı silinemedi.' });
    }
    const { error: authDeleteError } = await db.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      // The profile is gone, so the login can no longer open the portal; report it anyway.
      console.error('auth deleteUser failed after profile delete');
      return json(200, { ok: true, loginRemains: true });
    }
    return json(200, { ok: true });
  } catch {
    console.error('manage-user failed: check server configuration and service availability');
    return json(500, {
      error: 'Account tools are temporarily unavailable. / Hesap araçları şu anda kullanılamıyor.',
    });
  }
}
