interface WhatsAppSupportOptions {
  topic: string;
  message?: string | null;
  context?: Record<string, string | number | boolean | null | undefined>;
}

export function openWhatsAppSupport({ topic, message, context = {} }: WhatsAppSupportOptions) {
  const lines = [
    `Hallo, ich brauche Hilfe zur ${topic}.`,
    '',
    message ? `Nachricht/Fehler: ${message}` : null,
    '',
    `Seite: ${window.location.hash || window.location.pathname}`,
    `Zeitpunkt: ${new Date().toLocaleString('de-DE')}`,
    ...Object.entries(context)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${String(value)}`),
  ].filter(Boolean);

  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '+491782907020';
  const normalizedNumber = whatsappNumber.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(lines.join('\n'))}`;

  window.open(whatsappUrl, '_blank');
}
