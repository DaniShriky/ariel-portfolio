// TODO: replace with Ariel's real WhatsApp number (international format, digits only, no + or spaces)
export const WHATSAPP_NUMBER = '10000000000';
// TODO: replace with Ariel's real phone number (used for the tel: link)
export const PHONE_NUMBER = '+10000000000';

export function getWhatsappLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
