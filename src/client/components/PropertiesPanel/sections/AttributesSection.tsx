import { h, Fragment } from 'preact';
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { X, Check } from 'lucide-preact';
import inputStyles from '../inputs/inputs.module.css';
import styles from './AttributesSection.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewAttr {
  id: number;
  name: string;
  value: string;
}

export interface AttributesSectionProps {
  /** Current attributes of the selected element (from DomNode.attributes) */
  attributes: Record<string, string>;
  /** CSS selector for the selected element (for queueEdit) */
  selector: string;
  /** Called when an attribute value changes */
  onAttributeChange: (name: string, value: string) => void;
  /** Called when an attribute should be deleted */
  onAttributeDelete: (name: string) => void;
  /** Called when an attribute is renamed */
  onAttributeRename: (oldName: string, newName: string) => void;
}

// Internal attributes to skip
const SKIP_PREFIXES = ['data-ls-', 'data-cs-'];
const SKIP_NAMES = new Set(['style']);

function shouldSkip(name: string): boolean {
  if (SKIP_NAMES.has(name)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inline value input — commit on blur/Enter
// ---------------------------------------------------------------------------

function AttrValueInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = useCallback(() => {
    if (local !== value) onChange(local);
  }, [local, value, onChange]);

  return (
    <input
      type="text"
      class={inputStyles.textInput}
      value={local}
      onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
        setLocal((e.target as HTMLInputElement).value)
      }
      onBlur={commit}
      onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') onChange(local);
      }}
    />
  );
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let nextNewId = 0;

export function AttributesSection({
  attributes,
  onAttributeChange,
  onAttributeDelete,
  onAttributeRename,
}: AttributesSectionProps) {
  const [newAttrs, setNewAttrs] = useState<NewAttr[]>([]);
  const valueRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Inline name editing state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const editNameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingName !== null) editNameRef.current?.select();
  }, [editingName]);

  const startEditName = useCallback((name: string) => {
    setEditingName(name);
    setEditNameValue(name);
  }, []);

  const commitEditName = useCallback(() => {
    if (editingName === null) return;
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== editingName) {
      onAttributeRename(editingName, trimmed);
    }
    setEditingName(null);
  }, [editingName, editNameValue, onAttributeRename]);

  const cancelEditName = useCallback(() => {
    setEditingName(null);
  }, []);

  // Filter out internal attributes
  const attrEntries = Object.entries(attributes).filter(
    ([name]) => !shouldSkip(name),
  );

  // Add new attribute row
  const handleAddAttribute = useCallback(() => {
    setNewAttrs((prev) => [...prev, { id: nextNewId++, name: '', value: '' }]);
  }, []);

  // Commit new attribute
  const handleCommitNew = useCallback(
    (attr: NewAttr) => {
      if (attr.name.trim()) {
        onAttributeChange(attr.name.trim(), attr.value);
      }
      setNewAttrs((prev) => prev.filter((a) => a.id !== attr.id));
      delete valueRefs.current[attr.id];
    },
    [onAttributeChange],
  );

  const handleCancelNew = useCallback((id: number) => {
    setNewAttrs((prev) => prev.filter((a) => a.id !== id));
    delete valueRefs.current[id];
  }, []);

  const focusValue = (id: number) => {
    valueRefs.current[id]?.focus();
  };

  return (
    <>
      {/* Regular attributes (class is rendered at the panel top) */}
      {attrEntries
        .filter(([name]) => name !== 'class')
        .map(([name, value]) => {
          const isEditing = editingName === name;

          return (
            <div class={styles.attrRow} key={name}>
              {isEditing ? (
                <input
                  ref={editNameRef}
                  type="text"
                  class={styles.attrNameInput}
                  value={editNameValue}
                  onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                    setEditNameValue((e.target as HTMLInputElement).value)
                  }
                  onBlur={commitEditName}
                  onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') commitEditName();
                    if (e.key === 'Escape') cancelEditName();
                  }}
                />
              ) : (
                <span
                  class={styles.attrName}
                  title={name}
                  onDblClick={() => startEditName(name)}
                >
                  {name}
                </span>
              )}
              <AttrValueInput
                value={value}
                onChange={(v) => onAttributeChange(name, v)}
              />
              <button
                class={styles.deleteBtn}
                onClick={() => onAttributeDelete(name)}
                title={`Delete attribute "${name}"`}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

      {/* Empty state */}
      {attrEntries.length === 0 && newAttrs.length === 0 && (
        <div class={styles.emptyHint}>No attributes</div>
      )}

      {/* New attribute rows */}
      {newAttrs.map((attr) => (
        <div class={styles.newAttrRow} key={attr.id}>
          <input
            type="text"
            placeholder="name"
            autoFocus
            class={`${styles.newAttrInput} ${styles.newAttrName}`}
            value={attr.name}
            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
              const val = (e.target as HTMLInputElement).value;
              setNewAttrs((prev) =>
                prev.map((a) => (a.id === attr.id ? { ...a, name: val } : a)),
              );
            }}
            onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                focusValue(attr.id);
              }
              if (e.key === 'Escape') handleCancelNew(attr.id);
            }}
          />
          <input
            ref={(el) => {
              valueRefs.current[attr.id] = el;
            }}
            type="text"
            placeholder="value"
            class={`${styles.newAttrInput} ${styles.newAttrValue}`}
            value={attr.value}
            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
              const val = (e.target as HTMLInputElement).value;
              setNewAttrs((prev) =>
                prev.map((a) => (a.id === attr.id ? { ...a, value: val } : a)),
              );
            }}
            onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleCommitNew(attr);
              if (e.key === 'Escape') handleCancelNew(attr.id);
            }}
            onBlur={() => {
              if (attr.name.trim()) handleCommitNew(attr);
            }}
          />
          <button
            class={styles.newAttrCommit}
            onClick={() => handleCommitNew(attr)}
            title="Add attribute"
          >
            <Check size={10} />
          </button>
          <button
            class={styles.newAttrCancel}
            onClick={() => handleCancelNew(attr.id)}
            title="Cancel"
          >
            <X size={10} />
          </button>
        </div>
      ))}

      {/* Add button */}
      <button
        class={styles.addBtn}
        onClick={handleAddAttribute}
        title="Add attribute"
      >
        + Add attribute
      </button>
    </>
  );
}
