import type { FC } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: FC<ErrorStateProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-900/50 bg-rose-950/20 text-rose-200',
        className
      )}
    >
      <div className="p-3 mb-3 rounded-full bg-rose-900/30 text-rose-400 border border-rose-800/60">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <h3 className="text-sm font-semibold tracking-wide uppercase">{title}</h3>
      <p className="mt-1 text-xs text-rose-300/80 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-rose-900/50 hover:bg-rose-900/80 text-rose-100 rounded-md border border-rose-700/80 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
