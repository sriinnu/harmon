import React from 'react';

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ textAlign: 'center', padding: '3em' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--muted)', margin: '1em 0' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button className="btn-primary" onClick={() => { this.setState({ hasError: false }); location.reload(); }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
