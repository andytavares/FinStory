// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigation } from '@renderer/lib/navigation';

const start = { view: 'dashboard' };

describe('navigation history', () => {
  it('starts with no history behind or ahead', () => {
    const { result } = renderHook(() => useNavigation(start));
    expect(result.current.current.view).toBe('dashboard');
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('goes back after a drill-down', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'register', categoryId: 'dining' }));
    expect(result.current.current.categoryId).toBe('dining');
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.back());
    expect(result.current.current.view).toBe('dashboard');
    expect(result.current.canGoForward).toBe(true);
  });

  it('goes forward again', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'register', categoryId: 'dining' }));
    act(() => result.current.back());
    act(() => result.current.forward());
    expect(result.current.current.categoryId).toBe('dining');
    expect(result.current.canGoForward).toBe(false);
  });

  it('discards the forward stack when navigating somewhere new', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'register' }));
    act(() => result.current.back());
    act(() => result.current.navigate({ view: 'reports' }));
    expect(result.current.canGoForward).toBe(false);
    expect(result.current.current.view).toBe('reports');
  });

  it('does not stack a duplicate of where you already are', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'dashboard' }));
    expect(result.current.canGoBack).toBe(false);
  });

  it('treats a different drill-down target as a distinct entry', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'register', categoryId: 'dining' }));
    act(() => result.current.navigate({ view: 'register', categoryId: 'groceries' }));
    act(() => result.current.back());
    expect(result.current.current.categoryId).toBe('dining');
  });

  it('replace changes the current entry without adding history', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.navigate({ view: 'register' }));
    act(() => result.current.replace({ view: 'register', direction: 'in' }));
    expect(result.current.current.direction).toBe('in');
    act(() => result.current.back());
    expect(result.current.current.view).toBe('dashboard');
  });

  it('back at the start and forward at the end are no-ops', () => {
    const { result } = renderHook(() => useNavigation(start));
    act(() => result.current.back());
    expect(result.current.current.view).toBe('dashboard');
    act(() => result.current.forward());
    expect(result.current.current.view).toBe('dashboard');
  });
});
