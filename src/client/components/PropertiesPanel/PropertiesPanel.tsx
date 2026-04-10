import { h, Fragment } from 'preact';
import { useState, useCallback, useMemo } from 'preact/hooks';
import { ChevronRight } from 'lucide-preact';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import { LayoutSection } from './sections/LayoutSection';
import { TextSection } from './sections/TextSection';
import { StylesSection } from './sections/StylesSection';
import { TransformSection } from './sections/TransformSection';
import { AttributesSection } from './sections/AttributesSection';
import { getElementById } from '../../bridge/dom-bridge';
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
  children: preact.ComponentChildren;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div class={styles.section}>
      <div class={styles.sectionHeader} onClick={() => setOpen(!open)}>
        <ChevronRight
          size={10}
          class={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
        {title}
      </div>
      {open && <div class={styles.sectionBody}>{children}</div>}
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
      // Remove from live DOM
      if (selectedNodeId !== null) {
        const el = getElementById(selectedNodeId);
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
        <span class={styles.headerSelector}>{selector}</span>
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
        <Section title="Styles">
          <StylesSection
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
