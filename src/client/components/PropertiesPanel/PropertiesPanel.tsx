import { h, Fragment } from 'preact';
import { useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { ChevronRight, ChevronDown, Undo2, Redo2, Sun, Moon, Clipboard, Check } from 'lucide-preact';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import { LayoutSection } from './sections/LayoutSection';
import { TextSection } from './sections/TextSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { FillSection } from './sections/FillSection';
import { StrokeSection } from './sections/StrokeSection';
import { EffectsSection } from './sections/EffectsSection';
import { TransformSection } from './sections/TransformSection';
import { AttributesSection } from './sections/AttributesSection';
import { getElementById } from '../../bridge/dom-bridge';
import { useUndoStore } from '../../hooks/use-undo';
import { applyUndoEntry } from '../../hooks/use-apply-undo';
import styles from './PropertiesPanel.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNodeInTree(tree: DomNode | null, nodeId: number): DomNode | null {
  if (!tree) return null;
  if (tree.id === nodeId) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

function buildSelectorFromNode(node: DomNode): string {
  const tag = node.tag;
  const attrs = node.attributes ?? {};
  if (attrs.id) return `${tag}#${attrs.id}`;
  if (attrs['data-testid']) return `${tag}[data-testid="${attrs['data-testid']}"]`;
  if (attrs['data-id']) return `${tag}[data-id="${attrs['data-id']}"]`;
  return tag;
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  actions?: preact.ComponentChildren;
  children: preact.ComponentChildren;
}

function Section({ title, defaultOpen = true, collapsible = true, actions, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <div class={styles.section}>
      <div
        class={`${styles.sectionHeader} ${collapsible ? styles.sectionHeaderClickable : ''}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        {collapsible && (
          <ChevronRight
            size={14}
            class={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          />
        )}
        <span class={styles.sectionTitle}>{title}</span>
        {actions && (
          <div class={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {isOpen && <div class={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------

export function PropertiesPanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const domTree = useStore((s) => s.domTree);
  const computedStyles = useStore((s) => s.computedStyles);
  const parentDisplay = useStore((s) => s.parentDisplay);
  const queueEdit = useStore((s) => s.queueEdit);
  const updateProperty = useStore((s) => s.updateProperty);
  const stagedChanges = useStore((s) => s.stagedChanges);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const hasPast = useUndoStore((s) => s.past.length > 0);
  const hasFuture = useUndoStore((s) => s.future.length > 0);
  const [copiedChanges, setCopiedChanges] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopyChanges = useCallback(() => {
    if (stagedChanges.length === 0) return;
    const payload = {
      changes: stagedChanges,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedChanges(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedChanges(false), 1500);
  }, [stagedChanges]);

  const handleUndo = useCallback(() => {
    const entry = useUndoStore.getState().undo();
    if (entry) applyUndoEntry(entry, 'undo');
  }, []);

  const handleRedo = useCallback(() => {
    const entry = useUndoStore.getState().redo();
    if (entry) applyUndoEntry(entry, 'redo');
  }, []);

  const selectedNode = useMemo(
    () => (selectedNodeId !== null ? findNodeInTree(domTree, selectedNodeId) : null),
    [domTree, selectedNodeId],
  );

  const selector = useMemo(
    () => (selectedNode ? buildSelectorFromNode(selectedNode) : ''),
    [selectedNode],
  );

  const getValue = useCallback(
    (prop: string) => computedStyles[prop] ?? '',
    [computedStyles],
  );

  const handleChange = useCallback(
    (prop: string, newValue: string) => {
      const oldValue = computedStyles[prop] ?? '';
      if (oldValue === newValue) return;

      // Apply to live DOM element
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
        if (el && el instanceof HTMLElement) {
          el.style.setProperty(prop, newValue);
        }
      }

      // Update local property
      updateProperty(prop, newValue);

      useUndoStore.getState().push({
        type: 'style',
        nodeId: selectedNodeId,
        property: prop,
        oldValue,
        newValue,
      });

      // Queue edit for MCP
      queueEdit({
        type: 'style',
        element: selector,
        name: prop,
        value: `${oldValue} \u2192 ${newValue}`,
      });
    },
    [computedStyles, selector, selectedNodeId, queueEdit, updateProperty],
  );

  // ---- Attribute handlers ----

  const handleAttributeChange = useCallback(
    (name: string, newValue: string) => {
      const oldValue = (selectedNode?.attributes ?? {})[name] ?? '';
      if (oldValue === newValue) return;

      useUndoStore.getState().push({
        type: 'attribute',
        nodeId: selectedNodeId,
        property: name,
        oldValue,
        newValue,
      });

      // Apply to live DOM
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
        if (el) el.setAttribute(name, newValue);
      }

      // Queue edit for MCP
      queueEdit({
        type: 'attribute',
        element: selector,
        name,
        value: `${oldValue} \u2192 ${newValue}`,
      });
    },
    [selectedNode, selectedNodeId, selector, queueEdit],
  );

  const handleAttributeDelete = useCallback(
    (name: string) => {
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
        const oldValue = el?.getAttribute(name) ?? '';
        useUndoStore.getState().pushDom({
          type: 'attribute-delete',
          nodeId: selectedNodeId,
          property: name,
          oldValue,
        });
        // Remove from live DOM
        if (el) el.removeAttribute(name);
      }

      // Queue edit for MCP
      queueEdit({
        type: 'attribute',
        element: selector,
        name,
        value: '',
      });
    },
    [selectedNodeId, selector, queueEdit],
  );

  const handleAttributeRename = useCallback(
    (oldName: string, newName: string) => {
      const value = (selectedNode?.attributes ?? {})[oldName] ?? '';

      useUndoStore.getState().pushBatch([
        { type: 'attribute-delete', nodeId: selectedNodeId, property: oldName, oldValue: value },
        { type: 'attribute', nodeId: selectedNodeId, property: newName, oldValue: '', newValue: value },
      ]);

      // Apply to live DOM
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
        if (el) {
          el.removeAttribute(oldName);
          el.setAttribute(newName, value);
        }
      }

      // Queue delete of old + set of new
      queueEdit({
        type: 'attribute',
        element: selector,
        name: oldName,
        value: '',
      });
      queueEdit({
        type: 'attribute',
        element: selector,
        name: newName,
        value,
      });
    },
    [selectedNode, selectedNodeId, selector, queueEdit],
  );

  if (selectedNodeId === null || !selectedNode) {
    return (
      <div class={styles.empty}>
        Select an element to edit its properties
      </div>
    );
  }

  return (
    <div class={styles.panel}>
      <div class={styles.header}>
        <span class={styles.headerTag}>{selectedNode.tag}</span>
        <ChevronDown size={12} style={{ color: 'var(--cs-feint-text)' }} />
        <span class={styles.headerSelector}>{selector}</span>
        <div class={styles.headerActions}>
          <button
            class={styles.headerBtn}
            onClick={handleCopyChanges}
            disabled={stagedChanges.length === 0}
            title="Copy changes to clipboard"
          >
            {copiedChanges ? <Check size={14} /> : <Clipboard size={14} />}
            {stagedChanges.length > 0 && (
              <span class={styles.badge}>{stagedChanges.length}</span>
            )}
          </button>
          <button
            class={styles.headerBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <button
            class={styles.headerBtn}
            onClick={handleUndo}
            disabled={!hasPast}
            title="Undo (\u2318Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            class={styles.headerBtn}
            onClick={handleRedo}
            disabled={!hasFuture}
            title="Redo (\u21E7\u2318Z)"
          >
            <Redo2 size={14} />
          </button>
        </div>
      </div>
      <div class={styles.sections}>
        <Section title="Layout">
          <LayoutSection
            getValue={getValue}
            onChange={handleChange}
            parentDisplay={parentDisplay}
          />
        </Section>
        <Section title="Text">
          <TextSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Appearance">
          <AppearanceSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Fill">
          <FillSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Stroke" defaultOpen={false}>
          <StrokeSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Effects" defaultOpen={false}>
          <EffectsSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Transform" defaultOpen={false}>
          <TransformSection
            getValue={getValue}
            onChange={handleChange}
          />
        </Section>
        <Section title="Attributes" defaultOpen={false}>
          <AttributesSection
            attributes={selectedNode.attributes ?? {}}
            selector={selector}
            onAttributeChange={handleAttributeChange}
            onAttributeDelete={handleAttributeDelete}
            onAttributeRename={handleAttributeRename}
          />
        </Section>
      </div>
    </div>
  );
}
