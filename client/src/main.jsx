import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Root Error Boundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#ef4444',
          background: '#0b0f19',
          minHeight: '100vh',
          fontFamily: 'Inter, sans-serif'
        }}>
          <h2 style={{ fontSize: '20px', marginBottom: '12px', color: '#f87171' }}>
            Terjadi Kesalahan pada Aplikasi (React Error Boundary)
          </h2>
          <pre style={{
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            color: '#fca5a5',
            overflowX: 'auto',
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Muat Ulang Aplikasi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
