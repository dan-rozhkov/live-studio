import { ContextMenu } from './ContextMenu';
import { useContextMenuStore } from './use-context-menu';

/**
 * Mount once at the app root. Renders the active context menu (if any)
 * driven by `useContextMenuStore`.
 */
export function ContextMenuRoot() {
  const open = useContextMenuStore((s) => s.open);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const items = useContextMenuStore((s) => s.items);
  const close = useContextMenuStore((s) => s.close);

  if (!open) return null;
  return <ContextMenu x={x} y={y} items={items} onClose={close} />;
}
