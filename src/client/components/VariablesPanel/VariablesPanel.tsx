import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Plus } from 'lucide-preact';
import { useStore } from '../../state/store';
import { fetchDesignTokens } from '../../bridge/token-bridge';
import { isColorValue, isNumericValue } from '../../utils/css-value';
import { CreateVariableForm } from '../PropertiesPanel/inputs/CreateVariableForm';
import pickerStyles from '../PropertiesPanel/inputs/VariablePicker.module.css';
import styles from './VariablesPanel.module.css';

type TypeFilter = 'any' | 'color' | 'number' | 'other';

export function VariablesPanel() {
  const designTokens = useStore((s) => s.designTokens);
  const setDesignTokens = useStore((s) => s.setDesignTokens);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('any');
  const [creating, setCreating] = useState(false);

  // Variables tab may open before any element is selected (which normally hydrates tokens).
  useEffect(() => {
    if (useStore.getState().designTokens.length === 0) {
      const tokens = fetchDesignTokens();
      if (tokens.length > 0) setDesignTokens(tokens);
    }
  }, [setDesignTokens]);

  const filtered = useMemo(() => {
    const byType = typeFilter === 'any' ? designTokens
      : typeFilter === 'color' ? designTokens.filter((t) => isColorValue(t.value))
      : typeFilter === 'number' ? designTokens.filter((t) => isNumericValue(t.value))
      : designTokens.filter((t) => !isColorValue(t.value) && !isNumericValue(t.value));

    const sorted = byType.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((t) => t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q));
  }, [designTokens, typeFilter, search]);

  return (
    <div class={styles.panel}>
      <div class={styles.toolbar}>
        <input
          type="text"
          class={pickerStyles.search}
          placeholder="Search variables..."
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <select
          class={styles.typeSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter((e.target as HTMLSelectElement).value as TypeFilter)}
        >
          <option value="any">All</option>
          <option value="color">Color</option>
          <option value="number">Number</option>
          <option value="other">Other</option>
        </select>
      </div>

      {creating ? (
        <div class={styles.createForm}>
          <CreateVariableForm
            initialName={search}
            onCancel={() => setCreating(false)}
            onCreated={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          class={`${pickerStyles.createNew} ${styles.createNewTop}`}
          onClick={() => setCreating(true)}
        >
          <Plus size={12} />
          <span>New variable{search ? `: ${search}` : ''}</span>
        </button>
      )}

      <div class={styles.list}>
        {filtered.length === 0 ? (
          <div class={pickerStyles.empty}>
            {designTokens.length === 0 ? 'No variables yet' : 'No variables found'}
          </div>
        ) : (
          filtered.map((token) => (
            <div key={token.name} class={pickerStyles.item}>
              {isColorValue(token.value) && (
                <span class={pickerStyles.colorSwatch} style={{ background: token.value }} />
              )}
              <span class={pickerStyles.tokenName}>{token.name}</span>
              <span class={pickerStyles.tokenValue}>{token.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
