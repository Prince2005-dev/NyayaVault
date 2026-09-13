import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { CaseClassification } from '../../types';

interface ClassificationBadgeProps {
  classification: CaseClassification;
  size?: 'sm' | 'md';
  className?: string;
}

export const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({
  classification,
  size = 'md',
  className,
}) => {
  let style = 'bg-slate-800 text-slate-300 border-slate-700';
  let Icon = Shield;
  let text: string = classification;

  switch (classification) {
    case 'HIGHLY_RESTRICTED':
      style = 'bg-purple-950/80 text-purple-200 border-purple-600/80 shadow-xs shadow-purple-950/50';
      Icon = ShieldAlert;
      text = 'HIGHLY RESTRICTED';
      break;
    case 'CONFIDENTIAL':
      style = 'bg-amber-950/70 text-amber-200 border-amber-600/70';
      Icon = Shield;
      text = 'CONFIDENTIAL';
      break;
    case 'INTERNAL':
      style = 'bg-slate-800/80 text-slate-300 border-slate-600';
      Icon = ShieldCheck;
      text = 'INTERNAL';
      break;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono tracking-wider rounded-md border uppercase font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        style,
        className
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{text}</span>
    </span>
  );
};
