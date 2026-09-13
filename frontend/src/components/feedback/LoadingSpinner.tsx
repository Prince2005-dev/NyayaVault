import type { FC } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export const LoadingSpinner: FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 p-4', className)}>
      <Loader2 className={cn('animate-spin text-blue-500', sizeClasses[size])} />
      {label && <p className="text-xs font-mono tracking-wider text-slate-400 uppercase">{label}</p>}
    </div>
  );
};
