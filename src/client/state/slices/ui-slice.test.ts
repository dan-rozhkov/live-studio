import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

beforeEach(() => {
  useStore.setState({ showMinMax: {} });
});

describe('toggleMinMax', () => {
  it('goes undefined -> min when toggling min first', () => {
    useStore.getState().toggleMinMax('padding', 'min');
    expect(useStore.getState().showMinMax.padding).toBe('min');
  });

  it('goes min -> null when toggling the same side again', () => {
    const s = useStore.getState();
    s.toggleMinMax('padding', 'min'); // -> min
    s.toggleMinMax('padding', 'min'); // current === which -> null
    expect(useStore.getState().showMinMax.padding).toBeNull();
  });

  it('goes null -> max when toggling the other side from null', () => {
    const s = useStore.getState();
    s.toggleMinMax('padding', 'min'); // -> min
    s.toggleMinMax('padding', 'min'); // -> null
    s.toggleMinMax('padding', 'max'); // current === null -> max
    expect(useStore.getState().showMinMax.padding).toBe('max');
  });

  it('goes min -> both when toggling the opposite side', () => {
    const s = useStore.getState();
    s.toggleMinMax('padding', 'min'); // -> min
    s.toggleMinMax('padding', 'max'); // current !== which -> both
    expect(useStore.getState().showMinMax.padding).toBe('both');
  });

  it('stays at both once reached (both is a sink for min/max toggles)', () => {
    const s = useStore.getState();
    s.toggleMinMax('padding', 'min'); // min
    s.toggleMinMax('padding', 'max'); // both
    s.toggleMinMax('padding', 'min'); // current 'both' !== 'min' -> both
    expect(useStore.getState().showMinMax.padding).toBe('both');
    s.toggleMinMax('padding', 'max'); // current 'both' !== 'max' -> both
    expect(useStore.getState().showMinMax.padding).toBe('both');
  });

  it('tracks separate properties independently', () => {
    const s = useStore.getState();
    s.toggleMinMax('padding', 'min');
    s.toggleMinMax('margin', 'max');
    expect(useStore.getState().showMinMax).toEqual({ padding: 'min', margin: 'max' });
  });
});
