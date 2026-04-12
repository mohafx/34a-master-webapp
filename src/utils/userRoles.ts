export const ADMIN_EMAILS = ['m.almajzoub1@gmail.com'];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
