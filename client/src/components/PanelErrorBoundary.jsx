import React from 'react';

/**
 * Error boundary that wraps individual panels so a crash in one
 * panel (e.g. corrupted factory state) doesn't take down the whole app.
 */
export default class PanelErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[PanelErrorBoundary]', error, info);
  }

  // Reset when the panel changes so users can navigate away
  componentDidUpdate(prevProps) {
    if (prevProps.panelKey !== this.props.panelKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u26A0\uFE0F'}</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>This panel encountered an error</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
