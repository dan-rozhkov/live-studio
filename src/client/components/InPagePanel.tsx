/**
 * InPagePanel — Root component for the live-studio in-page editor.
 *
 * Initializes all hooks, wires callbacks between subsystems, and renders
 * the full visual editor UI: toolbar, overlays, navigator panel (DOM tree +
 * chat), inspector panel (properties), context menus, and question popover.
 */

import { h } from 'preact';
import { useCallback, useEffect } from 'preact/hooks';

import { useStore } from '../state/store';
import { selectAndFetchStyles } from '../utils/select-node';
import { getElementById, buildElementSelector } from '../bridge/dom-bridge';

// Hooks
import { usePageBridge } from '../hooks/use-page-bridge';
import { useElementPicker } from '../hooks/use-element-picker';
import { useMcpDirect } from '../hooks/use-mcp-direct';
import { useInlineEdit } from '../hooks/use-inline-edit';
import { useKeyboard } from '../hooks/use-keyboard';
import { useScreenshot } from '../hooks/use-screenshot';
import { useSelectedClickGuard } from '../hooks/use-selected-click-guard';
import { useUndoStore } from '../hooks/use-undo';
import { applyUndoEntry } from '../hooks/use-apply-undo';

// Components
import { Toolbar } from './Toolbar/Toolbar';
import { Panel } from './Panel/Panel';
import type { TabDef } from './Panel/Panel';
import { Overlays } from './Overlays/Overlays';
import { DragControls } from './Overlays/DragControls';
import { Measures } from './Overlays/Measures';
import { VariantPicker } from './Overlays/VariantPicker';
import { DomTree } from './DomTree/DomTree';
import { useDomOperations, DomContextMenu, ActionBar } from './DomTree/DomOperations';
import { PropertiesPanel } from './PropertiesPanel/PropertiesPanel';
import { DesignMdPanel } from './DesignMdPanel/DesignMdPanel';
import { VariablesPanel } from './VariablesPanel/VariablesPanel';
import { ChatPanel, ChatActions } from './ChatPanel/ChatPanel';
import { QuestionPopover } from './QuestionPopover';
import { ContextMenuRoot } from './ContextMenu';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const NAVIGATOR_TABS: TabDef[] = [
  { id: 'elements', label: 'Elements', shortcut: '\u2325E' },
  { id: 'chat', label: 'Chat', shortcut: '\u2325T' },
];

const INSPECTOR_TABS: TabDef[] = [
  { id: 'design', label: 'Design' },
  { id: 'variables', label: 'Variables' },
  { id: 'design-md', label: 'DESIGN.md' },
];

const INSPECTOR_CONTENT: Record<string, () => h.JSX.Element> = {
  design: PropertiesPanel,
  variables: VariablesPanel,
  'design-md': DesignMdPanel,
};

// ---------------------------------------------------------------------------
// InPagePanel
// ---------------------------------------------------------------------------

export function InPagePanel() {
  // ── 1. Initialize hooks ──────────────────────────────────────────────

  // DOM tree observation (MutationObserver + tree sync)
  usePageBridge();

  // Prevent the host page from receiving clicks on the selected element
  useSelectedClickGuard();

  // MCP WebSocket connection
  const {
    sendEdit,
    sendAnswer,
    sendUserMessage,
    sendStartVariant,
    sendVariantApply,
    sendVariantCancel,
  } = useMcpDirect();

  // ── Shared select-node callback ──────────────────────────────────────

  const handleSelectNode = useCallback((nodeId: number) => {
    selectAndFetchStyles(nodeId);
    // Open the inspector panel when a node is selected
    const store = useStore.getState();
    if (!store.panels.inspector.open) {
      store.setPanelOpen('inspector', true);
    }
  }, []);

  const handleToggleSelectNode = useCallback((nodeId: number) => {
    useStore.getState().toggleNodeSelection(nodeId);
  }, []);

  // Element picker — visual element selection
  const { isPickingElement, togglePicker } = useElementPicker(handleSelectNode);

  // DOM operations (context menu, delete, duplicate, tag change, etc.)
  const domOps = useDomOperations();

  // Inline text editing (double-click to edit)
  const handleInlineEditComplete = useCallback(
    (id: number, oldText: string, newText: string) => {
      useUndoStore.getState().push({
        type: 'text',
        nodeId: id,
        oldValue: oldText,
        newValue: newText,
      });
      useStore.getState().queueEdit({
        type: 'text',
        element: `[data-ls-id="${id}"]`,
        value: `${oldText} \u2192 ${newText}`,
      });
    },
    [],
  );

  useInlineEdit(handleInlineEditComplete, handleSelectNode);

  const takeScreenshot = useScreenshot();

  const requestVariantsForSelection = useCallback(
    (nodeId: number | null) => {
      const store = useStore.getState();
      if (nodeId === null || store.variant) return;
      const el = getElementById(nodeId);
      if (!el) return;
      sendStartVariant({
        targetNodeId: nodeId,
        targetHtml: (el as HTMLElement).outerHTML,
        selector: buildElementSelector(el),
      });
    },
    [sendStartVariant],
  );

  // Keyboard shortcuts
  useKeyboard({
    applyEntry: applyUndoEntry,
    sendEdit,
    handleSelectNode,
    deleteElement: domOps.deleteElement,
    duplicateElement: domOps.duplicateElement,
    takeScreenshot,
  });

  // ── 2. Store subscriptions ───────────────────────────────────────────

  // ── Theme sync ──────────────────────────────────────────────────────
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const host = document.querySelector('live-studio-panel');
    if (!host) return;
    if (theme === 'light') {
      host.setAttribute('data-theme', 'light');
    } else {
      host.removeAttribute('data-theme');
    }
  }, [theme]);

  const navigatorOpen = useStore((s) => s.panels.navigator.open);
  const navigatorTab = useStore((s) => s.panels.navigator.activeTab);
  const inspectorOpen = useStore((s) => s.panels.inspector.open);
  const inspectorTab = useStore((s) => s.panels.inspector.activeTab);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const question = useStore((s) => s.question);
  const setHoveredNodeId = useStore((s) => s.setHoveredNodeId);

  // Close the inspector when nothing is selected — but only on the Design tab.
  // The DESIGN.md tab is a project-wide view and should stay open regardless.
  useEffect(() => {
    if (selectedNodeId === null && inspectorOpen && inspectorTab === 'design') {
      useStore.getState().setPanelOpen('inspector', false);
    }
  }, [selectedNodeId, inspectorOpen, inspectorTab]);

  // ── 3. Panel callbacks ──────────────────────────────────────────────

  const handleCloseNavigator = useCallback(() => {
    useStore.getState().setPanelOpen('navigator', false);
  }, []);

  const handleCloseInspector = useCallback(() => {
    useStore.getState().setPanelOpen('inspector', false);
  }, []);

  const handleHover = useCallback(
    (nodeId: number | null) => {
      setHoveredNodeId(nodeId);
    },
    [setHoveredNodeId],
  );

  const handleChatSend = useCallback(
    (text: string, attachments: any[]) => {
      sendUserMessage(text, attachments);
    },
    [sendUserMessage],
  );

  const handleChatGenerateVariants = useCallback(() => {
    requestVariantsForSelection(useStore.getState().selectedNodeId);
  }, [requestVariantsForSelection]);

  const handleQuestionAnswer = useCallback(
    (answer: string) => {
      sendAnswer(answer);
    },
    [sendAnswer],
  );

  const handleQuestionClose = useCallback(() => {
    useStore.getState().setQuestion(null);
  }, []);

  // ── 4. Render ────────────────────────────────────────────────────────

  return (
    <div data-live-studio-root>
      {/* Toolbar — always visible */}
      <Toolbar
        isPicking={isPickingElement}
        onTogglePicker={togglePicker}
        onSendEdit={sendEdit}
        onScreenshot={takeScreenshot}
      />

      {/* Overlays + DragControls — always rendered, self-manage visibility */}
      <Overlays />
      <DragControls />
      <Measures />
      <VariantPicker onApply={sendVariantApply} onCancel={sendVariantCancel} />

      {/* Navigator Panel (Elements tree + Chat) */}
      {navigatorOpen && (
        <Panel
          panelId="navigator"
          tabs={NAVIGATOR_TABS}
          onClose={handleCloseNavigator}
          headerSlot={navigatorTab === 'elements' ? <ActionBar /> : navigatorTab === 'chat' ? <ChatActions /> : undefined}
        >
          {navigatorTab === 'elements' && (
            <DomTree
              onSelectNode={handleSelectNode}
              onToggleSelectNode={handleToggleSelectNode}
              onHover={handleHover}
              onTagChange={domOps.handleTagChange}
              onContextMenu={domOps.handleTreeContextMenu}
              onMoveNode={domOps.handleMoveElement}
            />
          )}
          {navigatorTab === 'chat' && (
            <ChatPanel onSend={handleChatSend} onGenerateVariants={handleChatGenerateVariants} />
          )}
        </Panel>
      )}

      {/* Inspector Panel (Properties/Design) */}
      {inspectorOpen && (
        <Panel
          panelId="inspector"
          tabs={INSPECTOR_TABS}
          onClose={handleCloseInspector}
        >
          {(() => {
            const Content = INSPECTOR_CONTENT[inspectorTab] ?? PropertiesPanel;
            return <Content />;
          })()}
        </Panel>
      )}

      {/* Context menu for DOM tree operations */}
      <DomContextMenu
        contextMenu={domOps.contextMenu}
        onClose={domOps.closeContextMenu}
        onAddChild={domOps.handleAddChild}
        onAddSibling={domOps.handleAddSibling}
        onDuplicate={domOps.handleDuplicateElement}
        onDelete={domOps.handleDeleteElement}
      />

      {/* Global context menu — driven by useContextMenu hook from any element */}
      <ContextMenuRoot />

      {/* Question popover — shown when agent asks a question */}
      {question && (
        <QuestionPopover
          question={question}
          onAnswer={handleQuestionAnswer}
          onClose={handleQuestionClose}
        />
      )}
    </div>
  );
}
