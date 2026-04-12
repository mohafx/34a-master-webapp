import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { isLocalhostDev } from '../utils/isLocalhostDev';

export type DevAccountState = 'guest' | 'user' | 'premium';
export type DevShortcutId = 'onboarding' | 'tiktok' | 'auth' | 'paywall' | 'lernplan';
export type DevTransitionState = 'none' | 'active_7_days' | 'active_2_days' | 'active_last_day' | 'expired';

type ShortcutRequest = {
  id: DevShortcutId;
  nonce: number;
};

interface DevPanelContextType {
  enabled: boolean;
  panelOpen: boolean;
  overrideState: DevAccountState | null;
  isOverrideActive: boolean;
  setOverrideState: (state: DevAccountState) => void;
  clearOverrideState: () => void;
  setPanelOpen: (open: boolean) => void;
  shortcutRequest: ShortcutRequest | null;
  openShortcut: (id: DevShortcutId) => void;
  consumeShortcut: () => void;
  simulatedUser: SupabaseUser | null;
  transitionState: DevTransitionState;
  setTransitionState: (state: DevTransitionState) => void;
  transitionNoticeReplayNonce: number;
  replayTransitionNotice: () => void;
}

const DevPanelContext = createContext<DevPanelContextType | undefined>(undefined);

function createSimulatedUser(state: Exclude<DevAccountState, 'guest'>): SupabaseUser {
  const email = state === 'premium' ? 'premium@localhost.dev' : 'user@localhost.dev';
  const name = state === 'premium' ? 'Premium Nutzer' : 'Test Nutzer';

  return {
    id: state === 'premium' ? 'dev-premium-user' : 'dev-standard-user',
    email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { display_name: name },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as SupabaseUser;
}

export function DevPanelProvider({ children }: { children: ReactNode }) {
  const enabled = isLocalhostDev();
  const [panelOpen, setPanelOpen] = useState(false);
  const [overrideState, setOverrideStateInternal] = useState<DevAccountState | null>(null);
  const [shortcutRequest, setShortcutRequest] = useState<ShortcutRequest | null>(null);
  const [transitionState, setTransitionState] = useState<DevTransitionState>('none');
  const [transitionNoticeReplayNonce, setTransitionNoticeReplayNonce] = useState(0);

  const setOverrideState = (state: DevAccountState) => {
    setOverrideStateInternal(state);
  };

  const clearOverrideState = () => {
    setOverrideStateInternal(null);
  };

  const openShortcut = (id: DevShortcutId) => {
    setShortcutRequest({ id, nonce: Date.now() });
  };

  const consumeShortcut = () => {
    setShortcutRequest(null);
  };

  const replayTransitionNotice = () => {
    setTransitionNoticeReplayNonce((nonce) => nonce + 1);
  };

  const simulatedUser = useMemo(() => {
    if (!enabled || !overrideState || overrideState === 'guest') {
      return null;
    }

    return createSimulatedUser(overrideState);
  }, [enabled, overrideState]);

  const value = useMemo(
    () => ({
      enabled,
      panelOpen,
      overrideState,
      isOverrideActive: enabled && overrideState !== null,
      setOverrideState,
      clearOverrideState,
      setPanelOpen,
      shortcutRequest,
      openShortcut,
      consumeShortcut,
      simulatedUser,
      transitionState,
      setTransitionState,
      transitionNoticeReplayNonce,
      replayTransitionNotice,
    }),
    [enabled, overrideState, panelOpen, shortcutRequest, simulatedUser, transitionState, transitionNoticeReplayNonce],
  );

  return <DevPanelContext.Provider value={value}>{children}</DevPanelContext.Provider>;
}

export function useDevPanel() {
  const context = useContext(DevPanelContext);

  if (!context) {
    throw new Error('useDevPanel must be used within DevPanelProvider');
  }

  return context;
}
