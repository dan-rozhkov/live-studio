import { getElementById, assignId } from '../bridge/dom-bridge';
import { useStore } from '../state/store';
import { selectAndFetchStyles, refreshIfSelected } from '../utils/select-node';
import {
  rebuildDomTree,
  removeElementById,
  duplicateElementById,
  replaceElementTag,
} from '../components/DomTree/DomOperations';
import type { UndoOp, UndoDirection } from './use-undo';

/**
 * Apply a single undo/redo entry to the live DOM.
 * Does NOT queue edits for MCP — undo/redo is local-only preview.
 */
export function applyUndoEntry(entry: UndoOp, direction: UndoDirection): void {
  const value = direction === 'undo' ? entry.oldValue : entry.newValue;

  switch (entry.type) {
    case 'style': {
      const el = getElementById(entry.nodeId!) as HTMLElement | undefined;
      if (!el) return;
      el.style.setProperty(entry.property!, value ?? '');
      useStore.getState().updateProperty(entry.property!, value ?? '');
      refreshIfSelected(entry.nodeId);
      break;
    }

    case 'attribute': {
      const el = getElementById(entry.nodeId!);
      if (!el) return;
      el.setAttribute(entry.property!, value ?? '');
      rebuildDomTree();
      refreshIfSelected(entry.nodeId);
      break;
    }

    case 'attribute-delete': {
      const el = getElementById(entry.nodeId!);
      if (!el) return;
      if (direction === 'undo') {
        el.setAttribute(entry.property!, entry.oldValue ?? '');
      } else {
        el.removeAttribute(entry.property!);
      }
      rebuildDomTree();
      refreshIfSelected(entry.nodeId);
      break;
    }

    case 'text': {
      const el = getElementById(entry.nodeId!);
      if (!el) return;
      const textNodes = Array.from(el.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE,
      );
      if (textNodes.length > 0) {
        textNodes[0].textContent = value ?? '';
        for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
      }
      rebuildDomTree();
      break;
    }

    case 'dom': {
      applyDomEntry(entry, direction);
      break;
    }

    case 'batch': {
      const ops = entry.operations ?? [];
      const ordered = direction === 'undo' ? [...ops].reverse() : ops;
      for (const op of ordered) {
        applyUndoEntry(op, direction);
      }
      rebuildDomTree();
      break;
    }
  }
}

function applyDomEntry(entry: UndoOp, direction: UndoDirection): void {
  switch (entry.action) {
    case 'delete': {
      if (direction === 'undo') {
        const parent = entry.parentId != null ? getElementById(entry.parentId) : null;
        if (!parent) return;
        const temp = document.createElement('div');
        temp.innerHTML = entry.html ?? '';
        const restored = temp.firstElementChild;
        if (!restored) return;
        const sibling =
          entry.siblingId != null ? getElementById(entry.siblingId) : null;
        parent.insertBefore(restored, sibling ?? null);
        const newId = assignId(restored);
        entry.nodeId = newId;
        rebuildDomTree();
        selectAndFetchStyles(newId);
      } else {
        removeElementById(entry.nodeId!);
        rebuildDomTree();
        useStore.getState().clearSelection();
      }
      break;
    }

    case 'duplicate': {
      if (direction === 'undo') {
        removeElementById(entry.newNodeId!);
        rebuildDomTree();
        selectAndFetchStyles(entry.nodeId!);
      } else {
        const newId = duplicateElementById(entry.nodeId!);
        if (newId != null) {
          entry.newNodeId = newId;
          rebuildDomTree();
          selectAndFetchStyles(newId);
        }
      }
      break;
    }

    case 'add': {
      if (direction === 'undo') {
        removeElementById(entry.nodeId!);
        rebuildDomTree();
        useStore.getState().clearSelection();
      } else {
        const parent =
          entry.parentId != null ? getElementById(entry.parentId) : null;
        if (!parent) return;
        const newEl = document.createElement('div');
        newEl.style.width = '100px';
        newEl.style.height = '100px';
        if (entry.siblingId != null) {
          const sib = getElementById(entry.siblingId);
          if (sib) {
            parent.insertBefore(newEl, sib.nextSibling);
          } else {
            parent.appendChild(newEl);
          }
        } else {
          parent.appendChild(newEl);
        }
        const newId = assignId(newEl);
        entry.nodeId = newId;
        rebuildDomTree();
        selectAndFetchStyles(newId);
      }
      break;
    }

    case 'tag-change': {
      const targetTag = direction === 'undo' ? entry.oldTag! : entry.newTag!;
      const newId = replaceElementTag(entry.nodeId!, targetTag);
      if (newId != null) {
        entry.nodeId = newId;
        rebuildDomTree();
        selectAndFetchStyles(newId);
      }
      break;
    }
  }
}
