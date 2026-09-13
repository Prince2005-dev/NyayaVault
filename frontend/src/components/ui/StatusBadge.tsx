import type { FC } from 'react';
import { Lock, Clock, CheckCircle2, AlertTriangle, AlertOctagon, Archive } from 'lucide-react';
import { cn } from '../../utils/cn';

export type BadgeType =
  | 'SEALED'
  | 'PENDING'
  | 'DRAFT'
  | 'ARCHIVED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'VERIFIED'
  | 'MISMATCH'
  | 'ANCHORED'
  | 'FAILED';

interface StatusBadgeProps {
  status: BadgeType | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className,
}) => {
  const norm = status.toUpperCase();

  let colorStyle = 'bg-slate-800 text-slate-300 border-slate-700';
  let Icon = Clock;
  let label = status;

  switch (norm) {
    case 'SEALED':
      colorStyle = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/80';
      Icon = Lock;
      label = 'SEALED';
      break;
    case 'VERIFIED':
      colorStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-600';
      Icon = CheckCircle2;
      label = 'VERIFIED';
      break;
    case 'ANCHORED':
      colorStyle = 'bg-blue-950/70 text-blue-300 border-blue-600/80';
      Icon = CheckCircle2;
      label = 'ANCHORED';
      break;
    case 'PENDING':
    case 'ANCHOR PENDING':
      colorStyle = 'bg-amber-950/60 text-amber-300 border-amber-600/70';
      Icon = Clock;
      label = 'PENDING';
      break;
    case 'MISMATCH':
    case 'TAMPER DETECTED':
      colorStyle = 'bg-rose-950/90 text-rose-200 border-rose-600 animate-pulse font-bold';
      Icon = AlertOctagon;
      label = 'TAMPER DETECTED';
      break;
    case 'FAILED':
      colorStyle = 'bg-rose-950/70 text-rose-300 border-rose-700';
      Icon = AlertTriangle;
      label = 'FAILED';
      break;
    case 'ACTIVE':
      colorStyle = 'bg-cyan-950/70 text-cyan-300 border-cyan-700/80';
      Icon = CheckCircle2;
      label = 'ACTIVE';
      break;
    case 'CLOSED':
      colorStyle = 'bg-slate-800/80 text-slate-400 border-slate-700';
      Icon = Archive;
      label = 'CLOSED';
      break;
    case 'ARCHIVED':
      colorStyle = 'bg-zinc-900 text-zinc-400 border-zinc-700';
      Icon = Archive;
      label = 'ARCHIVED';
      break;
    case 'DRAFT':
      colorStyle = 'bg-slate-800 text-slate-300 border-slate-700';
      Icon = Clock;
      label = 'DRAFT';
      break;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono tracking-wide rounded-md border uppercase shadow-xs',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        colorStyle,
        className
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{label}</span>
    </span>
  );
};
