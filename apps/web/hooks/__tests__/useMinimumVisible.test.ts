import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMinimumVisible } from '../useMinimumVisible';

describe('useMinimumVisible: el indicador se ve al menos 1 s', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () =>
    renderHook(({ active }) => useMinimumVisible(active, 1000), { initialProps: { active: false } });

  it('aparece en el MISMO render en que empieza la recarga', () => {
    const { result, rerender } = setup();
    expect(result.current).toBe(false);
    rerender({ active: true });
    expect(result.current).toBe(true);
  });

  it('si la petición dura menos de 1 s, sigue visible hasta completar 1 s desde que apareció', () => {
    const { result, rerender } = setup();
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(200));
    rerender({ active: false }); // la petición termina a los 200 ms
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(799));
    expect(result.current).toBe(true); // 999 ms
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false); // 1000 ms
  });

  it('si la petición dura más de 1 s, se ve hasta que termina y luego se oculta enseguida', () => {
    const { result, rerender } = setup();
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current).toBe(true);
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it('una recarga nueva mientras aún se ve no lo oculta ni reinicia la cuenta', () => {
    const { result, rerender } = setup();
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(300));
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(300)); // 600 ms: sigue visible por el mínimo
    rerender({ active: true }); // empieza otra recarga
    act(() => vi.advanceTimersByTime(100));
    rerender({ active: false }); // 700 ms
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(300)); // 1000 ms desde que APARECIÓ
    expect(result.current).toBe(false);
  });
});
