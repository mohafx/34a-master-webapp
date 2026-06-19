import { describe, expect, it } from 'vitest';

// Simulates the routing logic inside the oral-exam-session Edge Function
function resolveAgentId(
  mode: 'free_test_3q' | 'full_simulation',
  env: Record<string, string>
): string {
  const ELEVENLABS_AGENT_ID = env.ELEVENLABS_AGENT_ID || "";
  const ELEVENLABS_AGENT_ID_MINI = env.ELEVENLABS_AGENT_ID_MINI || ELEVENLABS_AGENT_ID;
  const ELEVENLABS_AGENT_ID_FULL = env.ELEVENLABS_AGENT_ID_FULL || "";

  const agentId = mode === "full_simulation" ? ELEVENLABS_AGENT_ID_FULL : ELEVENLABS_AGENT_ID_MINI;
  return agentId;
}

describe('oral exam agent routing', () => {
  it('selects mini agent when mode is free_test_3q', () => {
    const env = {
      ELEVENLABS_AGENT_ID: 'agent-fallback',
      ELEVENLABS_AGENT_ID_MINI: 'agent-mini-specific',
      ELEVENLABS_AGENT_ID_FULL: 'agent-full',
    };
    
    const agentId = resolveAgentId('free_test_3q', env);
    expect(agentId).toBe('agent-mini-specific');
  });

  it('falls back to ELEVENLABS_AGENT_ID for mini agent if ELEVENLABS_AGENT_ID_MINI is missing', () => {
    const env = {
      ELEVENLABS_AGENT_ID: 'agent-fallback',
      ELEVENLABS_AGENT_ID_FULL: 'agent-full',
    };
    
    const agentId = resolveAgentId('free_test_3q', env);
    expect(agentId).toBe('agent-fallback');
  });

  it('selects full agent when mode is full_simulation', () => {
    const env = {
      ELEVENLABS_AGENT_ID: 'agent-fallback',
      ELEVENLABS_AGENT_ID_FULL: 'agent-full-specific',
    };
    
    const agentId = resolveAgentId('full_simulation', env);
    expect(agentId).toBe('agent-full-specific');
  });

  it('returns empty string if full agent is missing in full_simulation', () => {
    const env = {
      ELEVENLABS_AGENT_ID: 'agent-fallback',
    };
    
    const agentId = resolveAgentId('full_simulation', env);
    expect(agentId).toBe('');
  });
});
