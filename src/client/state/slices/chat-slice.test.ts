import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../store';

beforeEach(() => {
  useStore.setState({ chatMessages: [], agentResponding: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addChatMessage', () => {
  it('auto-assigns an id and timestamp when omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'));
    useStore.getState().addChatMessage({ role: 'user', content: 'hello' });
    const [msg] = useStore.getState().chatMessages;
    expect(msg.content).toBe('hello');
    expect(msg.role).toBe('user');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
    expect(msg.timestamp).toBe(Date.parse('2026-06-14T00:00:00.000Z'));
  });

  it('preserves a provided id and timestamp', () => {
    useStore.getState().addChatMessage({
      role: 'agent',
      content: 'hi',
      id: 'fixed-id',
      timestamp: 12345,
    });
    const [msg] = useStore.getState().chatMessages;
    expect(msg.id).toBe('fixed-id');
    expect(msg.timestamp).toBe(12345);
  });

  it('truncates the history to the most recent 200 messages', () => {
    const add = useStore.getState().addChatMessage;
    for (let i = 0; i < 205; i++) {
      add({ role: 'user', content: `m${i}`, id: `id-${i}` });
    }
    const msgs = useStore.getState().chatMessages;
    expect(msgs).toHaveLength(200);
    // oldest five dropped; keeps m5..m204
    expect(msgs[0].content).toBe('m5');
    expect(msgs[msgs.length - 1].content).toBe('m204');
  });

  it('keeps exactly 200 without truncating at the boundary', () => {
    const add = useStore.getState().addChatMessage;
    for (let i = 0; i < 200; i++) {
      add({ role: 'user', content: `m${i}`, id: `id-${i}` });
    }
    expect(useStore.getState().chatMessages).toHaveLength(200);
    expect(useStore.getState().chatMessages[0].content).toBe('m0');
  });
});
