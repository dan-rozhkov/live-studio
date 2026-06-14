import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import type { ChatMessage } from '../../state/slices/chat-slice';

/**
 * Characterization tests for ChatPanel.
 *
 * Behavior read from ChatPanel.tsx:
 * - autoAttachments = selectedNodeIds, minus any id already in
 *   pendingAttachments, mapped to { nodeId, label } where label is
 *   `node.tag(+#id)` resolved from domTree (or `#<id>` if not found).
 * - variantsDisabled = !isConnected || selectedNodeIds.length === 0 || variant !== null.
 * - Send button disabled = !isConnected || !inputValue.trim().
 * - Empty state shown when no messages and not responding.
 */

const tree: DomNode = {
  id: 1,
  tag: 'body',
  children: [
    { id: 2, tag: 'div', attributes: { id: 'header' }, children: [] },
    { id: 5, tag: 'button', children: [] },
    { id: 7, tag: 'span', children: [] },
  ],
};

// Snapshot the slices we mutate so each test starts clean.
function resetStore() {
  useStore.setState({
    chatMessages: [],
    agentResponding: false,
    pendingAttachments: [],
    selectedNodeIds: [],
    selectedNodeId: null,
    domTree: null,
    variant: null,
    mcpStatus: 'disconnected',
  });
}

describe('ChatPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    resetStore();
    vi.restoreAllMocks();
  });

  describe('empty state', () => {
    it('renders the empty state when there are no messages and agent is idle', () => {
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(screen.getByText(/Send a message to your AI agent/i)).toBeTruthy();
    });

    it('hides the empty state once a message exists', () => {
      const msg: ChatMessage = {
        id: 'm1',
        role: 'agent',
        content: 'Hello there',
        timestamp: Date.now(),
      };
      useStore.setState({ chatMessages: [msg] });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);

      expect(screen.queryByText(/Send a message to your AI agent/i)).toBeNull();
      expect(screen.getByText('Hello there')).toBeTruthy();
    });

    it('hides the empty state while the agent is responding (typing indicator)', () => {
      useStore.setState({ agentResponding: true });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(screen.queryByText(/Send a message to your AI agent/i)).toBeNull();
    });
  });

  describe('auto-attachment dedup', () => {
    it('derives auto-attachment chips from the selection with resolved labels', () => {
      useStore.setState({
        mcpStatus: 'connected',
        domTree: tree,
        selectedNodeIds: [2, 5],
      });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);

      // id 2 -> div#header (has attributes.id), id 5 -> button (no id).
      expect(screen.getByText('div#header')).toBeTruthy();
      expect(screen.getByText('button')).toBeTruthy();
    });

    it('filters out a selected node already present in pendingAttachments', () => {
      useStore.setState({
        mcpStatus: 'connected',
        domTree: tree,
        selectedNodeIds: [2, 5],
        // node 5 already pending -> must NOT appear as an auto chip.
        pendingAttachments: [{ nodeId: 5, label: 'button (pinned)' }],
      });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);

      // Auto chip for id 2 stays.
      expect(screen.getByText('div#header')).toBeTruthy();
      // The pending chip (its own label) is rendered.
      expect(screen.getByText('button (pinned)')).toBeTruthy();
      // The auto label for node 5 ("button") must be absent because it was deduped.
      expect(screen.queryByText('button')).toBeNull();
    });

    it('falls back to #<id> label when the node is not found in the tree', () => {
      useStore.setState({
        mcpStatus: 'connected',
        domTree: tree,
        selectedNodeIds: [999],
      });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(screen.getByText('#999')).toBeTruthy();
    });

    it('produces no auto chips when there is no domTree', () => {
      useStore.setState({
        mcpStatus: 'connected',
        domTree: null,
        selectedNodeIds: [2, 5],
      });
      const { container } = render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      // No attachments section rendered at all.
      expect(container.textContent).not.toContain('div#header');
    });
  });

  describe('send button disabled logic', () => {
    it('is disabled when not connected', () => {
      useStore.setState({ mcpStatus: 'disconnected' });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
    });

    it('is disabled when connected but input is empty', () => {
      useStore.setState({ mcpStatus: 'connected' });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
    });

    it('is enabled once connected and non-whitespace text is typed, and sends', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      useStore.setState({ mcpStatus: 'connected' });
      render(<ChatPanel onSend={onSend} onGenerateVariants={vi.fn()} />);

      const textarea = screen.getByPlaceholderText('Message agent...');
      await user.type(textarea, 'hello');

      const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(false);

      await user.click(send);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith('hello', []);
    });

    it('stays disabled when input is only whitespace', async () => {
      const user = userEvent.setup();
      useStore.setState({ mcpStatus: 'connected' });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);

      const textarea = screen.getByPlaceholderText('Message agent...');
      await user.type(textarea, '   ');

      const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
    });
  });

  describe('variants button disabled logic', () => {
    // variantsDisabled = !isConnected || selectedNodeIds.length === 0 || variant !== null
    function getVariantsBtn(): HTMLButtonElement {
      return screen.getByRole('button', { name: 'Generate variants' }) as HTMLButtonElement;
    }

    it('is disabled when not connected (even with a selection)', () => {
      useStore.setState({ mcpStatus: 'disconnected', selectedNodeIds: [2] });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(getVariantsBtn().disabled).toBe(true);
    });

    it('is disabled when connected but there is no selection', () => {
      useStore.setState({ mcpStatus: 'connected', selectedNodeIds: [] });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(getVariantsBtn().disabled).toBe(true);
    });

    it('is disabled when a variant session is already active', () => {
      useStore.setState({
        mcpStatus: 'connected',
        selectedNodeIds: [2],
        variant: {
          taskId: 't1',
          targetNodeId: 2,
          phase: 'previewing',
          variantNames: ['a'],
          activeName: 'a',
        },
      });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={vi.fn()} />);
      expect(getVariantsBtn().disabled).toBe(true);
    });

    it('is enabled when connected, has a selection, and no active variant', async () => {
      const user = userEvent.setup();
      const onGenerateVariants = vi.fn();
      useStore.setState({ mcpStatus: 'connected', selectedNodeIds: [2], variant: null });
      render(<ChatPanel onSend={vi.fn()} onGenerateVariants={onGenerateVariants} />);

      const btn = getVariantsBtn();
      expect(btn.disabled).toBe(false);
      await user.click(btn);
      expect(onGenerateVariants).toHaveBeenCalledTimes(1);
    });
  });

  describe('send combines auto + pending attachments and clears pending', () => {
    it('sends [...autoAttachments, ...pendingAttachments] then clears pending', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      useStore.setState({
        mcpStatus: 'connected',
        domTree: tree,
        selectedNodeIds: [2],
        pendingAttachments: [{ nodeId: 5, label: 'button (pinned)' }],
      });
      render(<ChatPanel onSend={onSend} onGenerateVariants={vi.fn()} />);

      const textarea = screen.getByPlaceholderText('Message agent...');
      await user.type(textarea, 'do it');
      await user.click(screen.getByRole('button', { name: 'Send' }));

      expect(onSend).toHaveBeenCalledTimes(1);
      const [text, attachments] = onSend.mock.calls[0];
      expect(text).toBe('do it');
      expect(attachments).toEqual([
        { nodeId: 2, label: 'div#header' },
        { nodeId: 5, label: 'button (pinned)' },
      ]);
      // pendingAttachments cleared after send.
      expect(useStore.getState().pendingAttachments).toEqual([]);
    });
  });
});
