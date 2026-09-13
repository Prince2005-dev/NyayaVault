import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] p-6 text-slate-200">
          <div className="max-w-md w-full p-6 rounded-xl border border-rose-800 bg-slate-900 shadow-2xl text-center">
            <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-rose-950 text-rose-400 mb-4 border border-rose-800">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Application Boundary Error</h2>
            <p className="text-xs text-slate-400 mb-6 font-mono">
              {this.state.error?.message || 'An unexpected rendering error occurred in NyayaVault.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
