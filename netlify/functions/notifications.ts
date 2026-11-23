import type { Config } from '@netlify/functions';
import { escapeHtml, requiredEnv, serviceClient, siteOrigin } from '../lib/server';

interface Notification {
  id: string;
  recipient_email: string;
  recipient_language: string;
  event: string;
  case_id: string;
  attempts: number;
}

function message(item: Notification, origin: string) {
  const turkish = item.recipient_language === 'tr';
  const escalated = item.event.includes('escalat');
  const subject = turkish
    ? escalated
      ? 'School Portal — yönetim incelemesi gerekli'
      : 'School Portal — acil rehberlik incelemesi'
    : escalated
      ? 'School Portal — management review required'
      : 'School Portal — urgent guidance review';
  const summary = turkish
    ? 'Bir rehberlik kaydı incelemenizi bekliyor. Ayrıntıları görmek için okul portalında oturum açın.'
    : 'A guidance case needs your review. Sign in to the school portal to view the details.';
  const label = turkish ? 'Okul portalını aç' : 'Open school portal';
  const link = `${origin}/?view=guidance&case=${encodeURIComponent(item.case_id)}`;
  return {
    subject,
    text: `${summary}\n\n${label}: ${link}\n\nSchool Portal`,
    html: `<div style="font-family:Arial,sans-serif;color:#533420;max-width:560px"><h2>School Portal</h2><p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(link)}" style="color:#7B461F">${escapeHtml(label)}</a></p></div>`,
  };
}

export default async function notifications(): Promise<void> {
  const db = serviceClient();
  const { error: deadlineError } = await db.rpc('advance_guidance_deadlines');
  if (deadlineError) throw new Error(`Guidance deadline processing failed (${deadlineError.code})`);

  // Check delivery configuration before claiming; unavailable email does not stop deadlines.
  const apiKey = requiredEnv('RESEND_API_KEY');
  const sender = requiredEnv('EMAIL_FROM');
  const origin = siteOrigin();
  const { data, error: claimError } = await db.rpc('claim_notifications', { p_limit: 5 });
  if (claimError) throw new Error(`Notification claim failed (${claimError.code})`);
  const items = (data || []) as Notification[];

  await Promise.all(
    items.map(async (item) => {
      let success = false;
      let failure: string | null = null;
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `school-portal-notification-${item.id}`,
          },
          body: JSON.stringify({
            from: sender,
            to: [item.recipient_email],
            ...message(item, origin),
          }),
          signal: AbortSignal.timeout(8000),
        });
        success = response.ok;
        if (!success) failure = `Email provider HTTP ${response.status}`;
      } catch {
        failure = 'Email provider unavailable or timed out';
      }
      const { error } = await db.rpc('finish_notification', {
        p_id: item.id,
        p_success: success,
        p_error: failure,
      });
      if (error)
        console.error('Notification status update failed', {
          notificationId: item.id,
          code: error.code,
        });
    }),
  );
}

export const config: Config = { schedule: '*/5 * * * *' };
