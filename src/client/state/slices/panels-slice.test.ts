import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

beforeEach(() => {
  // Reset all panels to a known closed state with default docks/sizes.
  useStore.setState({
    panels: {
      inspector: { open: false, dock: 'right', size: 320, activeTab: 'design' },
      navigator: { open: false, dock: 'left', size: 300, activeTab: 'elements' },
      timeline: { open: false, dock: 'bottom', size: 250, activeTab: 'animations' },
    },
    dockedClaims: { left: 0, right: 0, bottom: 0 },
  });
});

describe('recomputeClaims (via panel actions)', () => {
  it('derives dock widths from open panels', () => {
    const s = useStore.getState();
    s.setPanelOpen('navigator', true); // left 300
    s.setPanelOpen('inspector', true); // right 320
    s.setPanelOpen('timeline', true); // bottom 250
    expect(useStore.getState().dockedClaims).toEqual({ left: 300, right: 320, bottom: 250 });
  });

  it('reports zeros when all panels are closed', () => {
    const s = useStore.getState();
    s.setPanelOpen('navigator', true);
    s.setPanelOpen('navigator', false);
    expect(useStore.getState().dockedClaims).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it('ignores the size of a closed panel', () => {
    const s = useStore.getState();
    s.setPanelOpen('navigator', true); // left 300 open
    s.setPanelSize('inspector', 999); // inspector still closed
    expect(useStore.getState().dockedClaims).toEqual({ left: 300, right: 0, bottom: 0 });
  });

  it('takes the max size when two open panels share a dock', () => {
    const s = useStore.getState();
    s.setPanelDock('timeline', 'left'); // both navigator and timeline now on left
    s.setPanelOpen('navigator', true); // 300
    s.setPanelOpen('timeline', true); // 250
    expect(useStore.getState().dockedClaims.left).toBe(300);
  });

  it('recomputes after a size change on an open panel', () => {
    const s = useStore.getState();
    s.setPanelOpen('inspector', true);
    s.setPanelSize('inspector', 480);
    expect(useStore.getState().dockedClaims.right).toBe(480);
  });
});
