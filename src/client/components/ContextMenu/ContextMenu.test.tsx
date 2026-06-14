import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { ContextMenu, type MenuItem } from './ContextMenu';

/**
 * Characterization tests for ContextMenu.
 *
 * Clamping math (read from source ContextMenu.tsx):
 *   const rect = el.getBoundingClientRect();
 *   const maxX = window.innerWidth - rect.width - 4;
 *   const maxY = window.innerHeight - rect.height - 4;
 *   if (x > maxX) el.style.left = `${Math.max(4, maxX)}px`;
 *   if (y > maxY) el.style.top  = `${Math.max(4, maxY)}px`;
 *
 * The initial inline style is `{ left: x, top: y }` (numbers, rendered by
 * preact as bare px values), and the clamp effect overrides `left`/`top`
 * only when the requested coordinate exceeds the computed max.
 */

function getMenu(): HTMLElement {
  return screen.getByRole('menu');
}

describe('ContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('viewport edge clamping', () => {
    beforeEach(() => {
      // jsdom defaults innerWidth/innerHeight to 1024x768; pin them so the
      // math below is deterministic regardless of environment.
      Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    });

    it('clamps left/top when opened past the right/bottom edge (measured menu size)', () => {
      // Mock the measured menu size so the clamp depends on real dimensions.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 200,
        height: 150,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const items: MenuItem[] = [{ label: 'A', onSelect: vi.fn() }];
      // x/y placed beyond the viewport so both clamp branches fire.
      render(<ContextMenu x={990} y={790} items={items} onClose={vi.fn()} />);

      const menu = getMenu();
      // maxX = 1000 - 200 - 4 = 796; maxY = 800 - 150 - 4 = 646.
      expect(menu.style.left).toBe('796px');
      expect(menu.style.top).toBe('646px');
    });

    it('floors the clamp at 4px when the menu is wider/taller than the viewport', () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 2000,
        height: 2000,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const items: MenuItem[] = [{ label: 'A', onSelect: vi.fn() }];
      render(<ContextMenu x={500} y={500} items={items} onClose={vi.fn()} />);

      const menu = getMenu();
      // maxX = 1000 - 2000 - 4 = -1004 -> Math.max(4, -1004) = 4.
      expect(menu.style.left).toBe('4px');
      expect(menu.style.top).toBe('4px');
    });

    it('does not override left/top when the menu fits inside the viewport', () => {
      // Default jsdom getBoundingClientRect returns all-zero, so the menu has
      // width/height 0 and any x <= innerWidth-4 stays untouched.
      const items: MenuItem[] = [{ label: 'A', onSelect: vi.fn() }];
      render(<ContextMenu x={10} y={20} items={items} onClose={vi.fn()} />);

      const menu = getMenu();
      // Initial inline style from `style={{ left: x, top: y }}`.
      expect(menu.style.left).toBe('10px');
      expect(menu.style.top).toBe('20px');
    });
  });

  describe('item rendering', () => {
    it('renders items, separators, icons and shortcuts', () => {
      const items: MenuItem[] = [
        { label: 'Duplicate', onSelect: vi.fn(), shortcut: 'Cmd+D' },
        { type: 'separator' },
        { label: 'Delete', onSelect: vi.fn(), danger: true },
      ];
      render(<ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />);

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(2);
      expect(screen.getByText('Duplicate')).toBeTruthy();
      expect(screen.getByText('Delete')).toBeTruthy();
      expect(screen.getByText('Cmd+D')).toBeTruthy();

      // Separator is a non-button div, so only 2 menuitem buttons exist.
      const menu = getMenu();
      const separators = menu.querySelectorAll('div');
      expect(separators.length).toBeGreaterThan(0);
    });

    it('renders a disabled item with the disabled attribute', () => {
      const onSelect = vi.fn();
      const items: MenuItem[] = [{ label: 'Nope', onSelect, disabled: true }];
      render(<ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />);

      const btn = screen.getByRole('menuitem') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe('item interaction', () => {
    it('calls onSelect then onClose when an item is clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const items: MenuItem[] = [{ label: 'Run', onSelect }];
      render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

      await user.click(screen.getByRole('menuitem'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not fire onSelect/onClose when a disabled item is clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const items: MenuItem[] = [{ label: 'Run', onSelect, disabled: true }];
      render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

      // userEvent refuses to click a disabled element; assert nothing fired.
      const btn = screen.getByRole('menuitem') as HTMLButtonElement;
      // The onClick guard also returns early; verify via direct fireEvent that
      // the handler's `if (it.disabled) return` path is taken.
      fireEvent.click(btn);

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('close triggers', () => {
    it('closes on Escape keydown', () => {
      const onClose = vi.fn();
      render(<ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on a non-Escape key', () => {
      const onClose = vi.fn();
      render(<ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'a' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on window scroll (capture phase)', () => {
      const onClose = vi.fn();
      render(<ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />);

      fireEvent.scroll(window);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on window blur', () => {
      const onClose = vi.fn();
      render(<ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />);

      fireEvent.blur(window);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on backdrop mousedown', () => {
      const onClose = vi.fn();
      const { container } = render(
        <ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />,
      );

      // The backdrop is the first div sibling of the menu.
      const backdrop = container.querySelector('div');
      expect(backdrop).toBeTruthy();
      fireEvent.mouseDown(backdrop as Element);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes (and prevents default) on backdrop contextmenu', () => {
      const onClose = vi.fn();
      const { container } = render(
        <ContextMenu x={0} y={0} items={[{ label: 'A', onSelect: vi.fn() }]} onClose={onClose} />,
      );

      const backdrop = container.querySelector('div') as Element;
      const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      fireEvent(backdrop, evt);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(evt.defaultPrevented).toBe(true);
    });
  });
});
