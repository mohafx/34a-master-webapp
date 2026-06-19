import { supabase } from '../lib/supabase';

// Admin-Dev-Tools für die mündliche Prüfung. Rufen SECURITY-DEFINER-RPCs auf,
// die serverseitig prüfen, dass der Aufrufer Admin ist, und nur auf das eigene
// Konto (auth.uid()) wirken. Siehe Migration 20260619180000_admin_oral_exam_dev_tools.sql.

/** Löscht die eigenen oral_exam_sessions → Tickets sind wieder voll verfügbar. */
export async function adminResetOralExamTickets(): Promise<number> {
    const { data, error } = await supabase.rpc('admin_reset_oral_exam_tickets');
    if (error) {
        throw new Error(error.message || 'Tickets konnten nicht zurückgesetzt werden.');
    }
    return (data as number) ?? 0;
}

/** Schaltet das eigene Konto app-weit auf Premium (true) oder Free (false). */
export async function adminSetPremium(premium: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_premium', { p_premium: premium });
    if (error) {
        throw new Error(error.message || 'Premium-Status konnte nicht geändert werden.');
    }
}
