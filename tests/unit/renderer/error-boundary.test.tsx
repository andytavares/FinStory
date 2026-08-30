// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@renderer/components/ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom({ fail }: { fail: boolean }): React.JSX.Element {
  if (fail) throw new Error('kaboom in a view');
  return <p>All good</p>;
}

describe('error boundary: a blank window is never acceptable', () => {
  it('renders children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('shows an explanation instead of a blank page when a view throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This screen could not be displayed')).toBeDefined();
    expect(screen.getByText(/kaboom in a view/)).toBeDefined();
  });

  it('reassures that data is intact, since a render failure is not a data failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Your data is safe and unchanged/)).toBeDefined();
  });

  it('offers a way out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
  });

  it('recovers when Try again is pressed and the cause is gone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Toggle(): React.JSX.Element {
      return (
        <ErrorBoundary>
          <Boom fail={false} />
        </ErrorBoundary>
      );
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    rerender(<Toggle />);
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('logs the failure so it also reaches the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(spy).toHaveBeenCalled();
  });
});
