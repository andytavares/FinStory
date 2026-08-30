// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useQuery } from '@renderer/lib/ipc';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

describe('useQuery keeps the view stable across refetches', () => {
  it('loads data on mount', async () => {
    installMoneyBridge({ 'categories:list': [{ id: 'a' }] });
    const { result } = renderHook(() => useQuery<Array<{ id: string }>>('categories:list'));
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.loading).toBe(false);
  });

  it('does NOT blank the data while refetching', async () => {
    installMoneyBridge({ 'categories:list': [{ id: 'a' }] });
    const { result } = renderHook(() => useQuery<Array<{ id: string }>>('categories:list'));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => result.current.refetch());
    // Blanking here is what scrolled the list back to the top on every toggle.
    expect(result.current.data).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('reports loading only on the first fetch', async () => {
    installMoneyBridge({ 'categories:list': [] });
    const { result } = renderHook(() => useQuery<unknown[]>('categories:list'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('surfaces an error rather than hanging', async () => {
    installMoneyBridge({});
    const { result } = renderHook(() => useQuery<unknown>('nope:missing'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false);
  });
});
