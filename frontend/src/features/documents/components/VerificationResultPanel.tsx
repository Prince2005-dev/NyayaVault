import { useState, type FC } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Clock,
  Copy,
  Check,
  RotateCcw,
  Shield,
  FileSearch,
} from 'lucide-react';
import type { VerificationResult } from '../../../types';
import { formatDate } from '../../../utils/cn';

interface VerificationResultPanelProps {
  result: VerificationResult | null;
  isVerifying: boolean;
  error: string | null;
  onVerify: () => void;
  onDismiss?: () => void;
}

export const VerificationResultPanel: FC<VerificationResultPanelProps> = ({
  result,
  isVerifying,
  error,
  onVerify,
  onDismiss,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(label);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // State 1: Verifying (Loading state with duplicate prevention)
  if (isVerifying) {
    return (
      <div className="bg-[#0d1322] border border-blue-800/80 rounded-2xl p-7 shadow-lg space-y-4 text-center">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold font-mono text-blue-300 uppercase tracking-wider">
            Initiating Cryptographic Verification...
          </h3>
          <p className="text-xs text-slate-400 font-mono">
            Querying backend ledger and comparing document hash against recorded blockchain anchor.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[11px] font-mono text-blue-400">
          <Shield className="w-3.5 h-3.5 animate-pulse" />
          <span>Server-side verification in progress</span>
        </div>
      </div>
    );
  }

  // State 2: Verification Failed / API Error
  if (error) {
    return (
      <div className="bg-[#0d1322] border border-amber-800/80 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-700/60 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1 flex-1">
            <h3 className="text-sm font-bold text-amber-200 uppercase tracking-wide font-mono">
              Verification Service Unavailable
            </h3>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              {error}
            </p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Could not complete cryptographic audit with the backend verification endpoint.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          )}
          <button
            type="button"
            onClick={onVerify}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Verification</span>
          </button>
        </div>
      </div>
    );
  }

  // State 3: No result yet (Idle state)
  if (!result) {
    return (
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
            <FileSearch className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">
              Integrity Audit & Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Request a server-side cryptographic audit to verify document integrity against the recorded ledger hash.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onVerify}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30 shrink-0"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Verify Integrity Now</span>
        </button>
      </div>
    );
  }

  const isVerified = result.status === 'VERIFIED';
  const isMismatch = result.status === 'MISMATCH';

  return (
    <div
      className={`rounded-2xl p-6 shadow-xl border space-y-6 transition-all ${
        isVerified
          ? 'bg-emerald-950/20 border-emerald-600/80'
          : isMismatch
          ? 'bg-rose-950/30 border-rose-600/90'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* Result Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4 border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              isVerified
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-400'
                : 'bg-rose-950/90 border-rose-600 text-rose-300'
            }`}
          >
            {isVerified ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  isVerified
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-rose-950 text-rose-200 border-rose-600 font-extrabold'
                }`}
              >
                {isVerified ? 'INTEGRITY VERIFIED' : 'TAMPER DETECTED'}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Status: {result.status}
              </span>
            </div>

            <p className="text-xs text-slate-300 mt-1 font-sans">
              {isVerified
                ? 'The document hash currently matches the trusted server-side record and recorded blockchain anchor.'
                : 'The current document hash does NOT match the trusted recorded hash. Evidentiary alteration or corruption detected.'}
            </p>
          </div>
        </div>

        {/* Audit Timestamp */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 shrink-0 self-start sm:self-auto">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span>
            {result.timestamp ? formatDate(result.timestamp) : 'Timestamp: Present'}
          </span>
        </div>
      </div>

      {/* Side-by-Side / Monospace Hash Comparison */}
      <div className="space-y-3">
        <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-blue-400" />
          <span>Cryptographic Hash Audit Trail</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Box 1: Current Document SHA-256 */}
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              isVerified
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-rose-950/40 border-rose-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                  isVerified ? 'text-slate-400' : 'text-rose-300'
                }`}
              >
                Current Document SHA-256
              </span>
              <button
                type="button"
                onClick={() => handleCopy(result.currentHash, 'currentHash')}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Copy current hash"
              >
                {copiedHash === 'currentHash' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div
              className={`p-2.5 rounded font-mono text-xs break-all select-all border ${
                isVerified
                  ? 'bg-black/40 border-slate-800 text-emerald-300'
                  : 'bg-rose-950/80 border-rose-700 text-rose-200 font-bold'
              }`}
            >
              {result.currentHash}
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Computed directly from current artifact byte payload.
            </p>
          </div>

          {/* Box 2: Trusted Recorded SHA-256 */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-slate-400">
                Trusted Recorded SHA-256 (Original)
              </span>
              <button
                type="button"
                onClick={() => handleCopy(result.originalHash, 'originalHash')}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Copy trusted hash"
              >
                {copiedHash === 'originalHash' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="p-2.5 rounded bg-black/40 border border-slate-800 font-mono text-xs text-blue-300 break-all select-all">
              {result.originalHash}
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Immutably registered at initial vault sealing time.
            </p>
          </div>
        </div>

        {/* Optional Blockchain Hash & Tx ID if returned */}
        {(result.blockchainHash || result.blockchainTxId) && (
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            {result.blockchainHash && (
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">
                  Blockchain Anchor Hash:
                </span>
                <span className="text-slate-300 break-all">{result.blockchainHash}</span>
              </div>
            )}
            {result.blockchainTxId && (
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">
                  Anchor Transaction ID:
                </span>
                <span className="text-blue-400 break-all">{result.blockchainTxId}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Result Action & Dismiss */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs font-mono">
        <span
          className={`font-semibold ${
            isVerified ? 'text-emerald-400' : 'text-rose-400 font-bold'
          }`}
        >
          {isVerified
            ? '✓ HASH MATCH CONFIRMED (AUTHENTIC RECORD)'
            : '✗ HASH MISMATCH DETECTED (POTENTIAL TAMPERING)'}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onVerify}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Re-verify</span>
          </button>
        </div>
      </div>
    </div>
  );
};
