import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI to show on error. If not provided, uses default error UI */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Scope name for error reporting (e.g., "Canvas", "Timeline") */
  scope?: string;
  /** Show home button to navigate back */
  showHomeButton?: boolean;
  /** Compact mode for smaller sections */
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console with component stack
    console.error(
      `[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ''}] Uncaught error:`,
      error,
      errorInfo.componentStack
    );

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReload = () => {
    // Reset error state and try to re-render children
    this.setState({ hasError: false, error: null });
  };

  handleFullReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      const { scope, showHomeButton, compact } = this.props;
      const errorMessage = this.state.error?.message || 'Unknown error';

      if (compact) {
        return (
          <div className="flex items-center justify-center p-4 bg-bg-secondary border border-border-default rounded">
            <div className="flex items-center gap-3 text-text-secondary">
              <AlertTriangle size={16} className="text-error shrink-0" />
              <span className="text-sm">
                {scope ? `Erreur ${scope.toLowerCase()}` : 'Erreur'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={this.handleReload}
                className="ml-2"
              >
                <RefreshCw size={14} className="mr-1" />
                Réessayer
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 bg-bg-secondary">
          <div className="flex flex-col items-center text-center max-w-md">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-error/10 mb-4">
              <AlertTriangle size={24} className="text-error" />
            </div>

            <h2 className="text-sm font-semibold text-text-primary mb-1">
              {scope ? `Erreur dans ${scope}` : 'Une erreur est survenue'}
            </h2>

            <p className="text-xs text-text-secondary mb-4">
              Le composant a rencontré un problème et ne peut pas s'afficher.
            </p>

            {/* Error details in development */}
            {import.meta.env.DEV && (
              <details className="w-full mb-4 text-left">
                <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary">
                  Détails techniques
                </summary>
                <pre className="mt-2 p-2 bg-bg-tertiary rounded text-xs text-text-secondary overflow-auto max-h-32">
                  {errorMessage}
                </pre>
              </details>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={this.handleReload}
              >
                <RefreshCw size={14} className="mr-1.5" />
                Réessayer
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={this.handleFullReload}
              >
                Recharger la page
              </Button>

              {showHomeButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={this.handleGoHome}
                >
                  <Home size={14} className="mr-1.5" />
                  Accueil
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  scope?: string
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary scope={scope || displayName}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return ComponentWithErrorBoundary;
}
