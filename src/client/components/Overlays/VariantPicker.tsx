// Floating pill anchored at top-center of the viewport. Lets the user switch
// between AI-generated variants and Apply / Cancel.

import { Loader2, X } from 'lucide-preact';
import { useStore } from '../../state/store';
import { setActiveVariantPreview } from '../../bridge/variants-bridge';
import styles from './VariantPicker.module.css';

interface PickerProps {
  onApply: (taskId: string, variantName: string) => void;
  onCancel: (taskId: string) => void;
}

export function VariantPicker({ onApply, onCancel }: PickerProps) {
  const variant = useStore((s) => s.variant);
  const patchVariant = useStore((s) => s.patchVariant);

  if (!variant) return null;

  if (variant.phase === 'requested') {
    return (
      <div className={styles.pill}>
        <span className={styles.loading}>
          <Loader2 size={10} className={styles.spinner} />
          Generating variants…
        </span>
        <button
          className={`${styles.button} ${styles.iconOnly}`}
          onClick={() => onCancel(variant.taskId)}
        >
          <X size={10} />
        </button>
      </div>
    );
  }

  if (variant.phase !== 'previewing' || variant.variantNames.length === 0) {
    return null;
  }

  const handleSelect = (name: string) => {
    setActiveVariantPreview(name);
    patchVariant({ activeName: name });
  };

  const handleApply = () => {
    onApply(variant.taskId, variant.activeName);
  };

  return (
    <div className={styles.pill}>
      {variant.variantNames.map((name) => (
        <button
          key={name}
          className={`${styles.button} ${name === variant.activeName ? styles.active : ''}`}
          onClick={() => handleSelect(name)}
        >
          {name}
        </button>
      ))}
      <div className={styles.separator} />
      <button className={`${styles.button} ${styles.primary}`} onClick={handleApply}>
        Apply
      </button>
      <button
        className={`${styles.button} ${styles.iconOnly}`}
        onClick={() => onCancel(variant.taskId)}
      >
        <X size={10} />
      </button>
    </div>
  );
}
