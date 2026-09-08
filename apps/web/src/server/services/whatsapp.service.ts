/**
 * WhatsApp Cloud API provider.
 *
 * Setup:
 * 1. Create a Meta Business Account at https://business.facebook.com
 * 2. Create an app at https://developers.facebook.com → Business type
 * 3. Add WhatsApp product → get Phone Number ID and Access Token
 * 4. Create message templates for: payment_reminder, payment_received, lift_notification
 * 5. Set these in your .env:
 *    WHATSAPP_PHONE_ID=your_phone_number_id
 *    WHATSAPP_ACCESS_TOKEN=your_access_token
 */

const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

interface WhatsAppMessageParams {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
}

interface WhatsAppTextParams {
  to: string;
  text: string;
}

function getConfig() {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  return { phoneId, token, configured: !!phoneId && !!token };
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91')) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Send a WhatsApp template message (for notifications outside 24hr window).
 */
export async function sendTemplate(params: WhatsAppMessageParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { phoneId, token, configured } = getConfig();
  if (!configured) {
    console.warn('[WhatsApp] Not configured — WHATSAPP_PHONE_ID and WHATSAPP_ACCESS_TOKEN required');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatPhone(params.to),
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: params.languageCode || 'hi' },
          components: params.components || [],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[WhatsApp] Template send failed:', data);
      return { success: false, error: data.error?.message || 'Send failed' };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp] Network error:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Send a plain text message (only within 24hr customer service window).
 */
export async function sendText(params: WhatsAppTextParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { phoneId, token, configured } = getConfig();
  if (!configured) {
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatPhone(params.to),
        type: 'text',
        text: { body: params.text },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[WhatsApp] Text send failed:', data);
      return { success: false, error: data.error?.message || 'Send failed' };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp] Network error:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Check if WhatsApp integration is configured.
 */
export function isConfigured(): boolean {
  return getConfig().configured;
}

/**
 * Pre-built notification senders for common scenarios.
 */
export async function sendPaymentReminder(phone: string, customerName: string, amount: number, groupName: string, monthLabel: string) {
  return sendTemplate({
    to: phone,
    templateName: 'payment_reminder',
    languageCode: 'hi',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: `₹${amount.toLocaleString('en-IN')}` },
        { type: 'text', text: groupName },
        { type: 'text', text: monthLabel },
      ],
    }],
  });
}

export async function sendPaymentConfirmation(phone: string, customerName: string, amount: number, groupName: string, monthLabel: string, receiptNumber: string) {
  return sendTemplate({
    to: phone,
    templateName: 'payment_received',
    languageCode: 'hi',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: `₹${amount.toLocaleString('en-IN')}` },
        { type: 'text', text: groupName },
        { type: 'text', text: monthLabel },
        { type: 'text', text: receiptNumber },
      ],
    }],
  });
}

export async function sendLiftNotification(phone: string, customerName: string, payoutAmount: number, groupName: string, monthLabel: string) {
  return sendTemplate({
    to: phone,
    templateName: 'lift_notification',
    languageCode: 'hi',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: customerName },
        { type: 'text', text: `₹${payoutAmount.toLocaleString('en-IN')}` },
        { type: 'text', text: groupName },
        { type: 'text', text: monthLabel },
      ],
    }],
  });
}
