import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one bad chart cannot blank the whole dashboard.
 *
 * Shows the message rather than swallowing it — a silent failure here would
 * leave someone reading stale or partial figures without knowing.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="grid min-h-[60vh] place-items-center p-8">
        <div className="card max-w-lg p-6">
          <h1 className="text-lg font-semibold text-notready">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This view failed to render. The rest of the dashboard is unaffected.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-surface hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
