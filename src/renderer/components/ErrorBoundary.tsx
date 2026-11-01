import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  readonly error: Error | null;
  readonly componentStack: string | null;
}

/**
 * A blank window is never an acceptable failure.
 *
 * Without this, any render error unmounts the tree and leaves an empty page
 * with no indication of what happened or what to do — which is exactly what a
 * user reports as "completely blank screen".
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced in the window; also logged so it appears in the dev console.
    console.error('Renderer error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <p className="eyebrow">Something broke</p>
        <h1 className="mt-2 text-[20px]">This screen could not be displayed</h1>
        <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
          Your data is safe and unchanged — this is a display problem, not a data one.
        </p>

        <pre className="mt-6 max-h-64 overflow-auto border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[12px] whitespace-pre-wrap">
          {error.message}
          {componentStack ? `\n${componentStack}` : ''}
        </pre>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null, componentStack: null })}
            className="btn"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
