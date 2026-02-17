import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            errorInfo: errorInfo.componentStack || null
        });
    }

    handleReload = (): void => {
        window.location.reload();
    };

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="error-boundary-overlay">
                    <div className="error-boundary-card">
                        <h1>Something went wrong</h1>
                        <p className="error-message">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        {this.state.errorInfo && (
                            <details className="error-details">
                                <summary>Technical Details</summary>
                                <pre>{this.state.errorInfo}</pre>
                            </details>
                        )}
                        <div className="error-actions">
                            <button onClick={this.handleReset} className="primary-button">
                                Try Again
                            </button>
                            <button onClick={this.handleReload} className="secondary-button">
                                Reload Application
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
