import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  fallback?: ReactNode;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 捕获子组件渲染错误，防止整个页面白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-gray-400 p-4">
            <div className="text-red-400 font-bold mb-2">渲染出错</div>
            <pre className="text-xs text-gray-500 max-w-md overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              className="mt-4 px-3 py-1.5 bg-gray-800 rounded text-sm hover:bg-gray-700"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
