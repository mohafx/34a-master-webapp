import { AppLanguage, type UserSettings } from '../types';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getEffectiveExamDate(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem('examDate');
}

export function setEffectiveExamDate(examDate: string | null) {
  if (!canUseStorage()) {
    return;
  }

  if (examDate) {
    window.localStorage.setItem('examDate', examDate);
  } else {
    window.localStorage.removeItem('examDate');
  }
}

export function getEffectiveLanguage(): AppLanguage {
  if (!canUseStorage()) {
    return AppLanguage.DE;
  }

  const stored = window.localStorage.getItem('34a_lang');
  return stored === AppLanguage.DE_AR ? AppLanguage.DE_AR : AppLanguage.DE;
}

export function setEffectiveLanguage(language: AppLanguage) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem('34a_lang', language);
}

export function getEffectiveSettings(): UserSettings {
  if (!canUseStorage()) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem('34a_settings') || '{}');
  } catch (error) {
    console.error('Could not parse stored settings:', error);
    return {};
  }
}

export function setEffectiveSettings(settings: Partial<UserSettings>) {
  if (!canUseStorage()) {
    return;
  }

  const current = getEffectiveSettings();
  window.localStorage.setItem('34a_settings', JSON.stringify({ ...current, ...settings }));
}

export function hasCompletedOnboarding(userId: string): boolean {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(`34a_onboarding_completed_${userId}`) === 'true';
}

export function markOnboardingCompleted(userId: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(`34a_onboarding_completed_${userId}`, 'true');
}
