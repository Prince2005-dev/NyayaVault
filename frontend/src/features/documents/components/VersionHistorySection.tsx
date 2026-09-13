import { useState, type FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  CheckCircle2,
  Clock,
  UserCheck,
  Lock,
  ChevronDown,
  Copy,
  Check,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate, formatBytes, truncateHash } from '../../../utils/cn';
import type { DocumentVersion, DocumentStatus } from '../../../types';

interface VersionHistorySectionProps {
  documentId: string;
  currentVersionNumber?: number;
}

export const VersionHistorySection: FC<VersionHistorySectionProps> = ({
  documentId,
  currentVersionNumber,
}) => {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const {
    data: versions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: () => api.documents.versions(documentId),
    enabled: !!documentId,
    retry: 1,
  });

  const handleCopy = (text: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleExpand = (versionNum: number) => {
    setExpandedVersion((prev) => (prev === versionNum ? null : versionNum));
  };

  return (
    <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-800/50 text-blue-400 shadow-xs">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Version History</span>
              {versions && versions.length > 0 && (
                <span className="text-xs font-mono font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  {versions.length} {versions.length === 1 ? 'version' : 'versions'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              Chronological ledger of document revisions and cryptographic ancestry
            </p>
          </div>
        </div>

        {/* Read-Only Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 self-start sm:self-auto">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>Read-Only Custodial History</span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-8 flex justify-center">
          <LoadingSpinner size="md" label="Retrieving document version lineage..." />
        </div>
      )}

      {/* Error State with Retry */}
      {error && !isLoading && (
        <ErrorState
          title="Failed to Load Version History"
          message={error instanceof Error ? error.message : 'Unable to query version records from API.'}
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !error && (!versions || versions.length === 0) && (
        <div className="py-8 text-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800/90 space-y-2">
          <Layers className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-slate-300">
            No version history available for this document.
          </p>
          <p className="text-xs text-slate-500 font-mono">
            This record has no recorded prior revisions or multi-version entries.
          </p>
        </div>
      )}

      {/* Loaded State: Versions List */}
      {!isLoading && !error && versions && versions.length > 0 && (
        <div className="space-y-4">
          {[...versions]
            .sort((a, b) => b.version - a.version)
            .map((v: DocumentVersion) => {
              const isCurrent =
                v.isCurrent ?? (currentVersionNumber !== undefined && v.version === currentVersionNumber);
              const isExpanded = expandedVersion === v.version;

              return (
                <div
                  key={v.version}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    isCurrent
                      ? 'bg-slate-900/70 border-blue-500/50 shadow-sm shadow-blue-950/20 ring-1 ring-blue-500/20'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header Row (Clickable for inspection) */}
                  <div
                    onClick={() => toggleExpand(v.version)}
                    className="p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Left: Version & Status Identification */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-base font-bold text-slate-100">
                        v{v.version}
                      </span>

                      {/* Current Status Pill */}
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Current Version</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                          <span>Superseded</span>
                        </span>
                      )}

                      {/* Document Lifecycle Status Badge */}
                      <StatusBadge status={v.status as DocumentStatus} size="sm" />

                      {/* Version ID if available */}
                      {v.id && (
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {v.id}
                        </span>
                      )}
                    </div>

                    {/* Right: Actor, Timestamp & Expand Action */}
                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400 flex-wrap md:flex-nowrap justify-between md:justify-end">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatDate(v.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-1 text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-sans font-medium">{v.createdBy?.name || 'Officer'}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(v.version);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title={isExpanded ? 'Collapse version details' : 'Inspect version metadata'}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-blue-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Summary Bar: Size, MIME, Hash preview */}
                  <div className="px-4.5 py-2.5 bg-slate-950/40 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-3 text-slate-400">
                      {v.size !== undefined && (
                        <span>Size: <strong className="text-slate-200">{formatBytes(v.size)}</strong></span>
                      )}
                      {v.mimeType && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-300">{v.mimeType}</span>
                        </>
                      )}
                    </div>

                    {/* Hash Preview with quick-copy */}
                    {v.sha256 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-400" />
                          <span>SHA-256:</span>
                        </span>
                        <code className="text-[11px] text-emerald-400/90 font-mono">
                          {truncateHash(v.sha256, 8, 6)}
                        </code>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(v.sha256, `hash-${v.version}`);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                          title="Copy SHA-256"
                        >
                          {copiedField === `hash-${v.version}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expandable Detail Panel (Read-only metadata inspection) */}
                  {isExpanded && (
                    <div className="p-4.5 bg-slate-950/70 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* SHA-256 Full Box */}
                        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Full SHA-256 Digest</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(v.sha256, `full-hash-${v.version}`)}
                              className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                            >
                              {copiedField === `full-hash-${v.version}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="p-2 rounded bg-black/50 border border-slate-800 font-mono text-[10px] text-emerald-300 break-all select-all">
                            {v.sha256}
                          </div>
                        </div>

                        {/* Blockchain Anchor Tx Box */}
                        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span className="flex items-center gap-1.5 text-blue-400">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Anchor Transaction ID</span>
                            </span>
                            {v.blockchainTxId && (
                              <button
                                type="button"
                                onClick={() => handleCopy(v.blockchainTxId || '', `tx-${v.version}`)}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                              >
                                {copiedField === `tx-${v.version}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-blue-400" />
                                    <span className="text-blue-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="p-2 rounded bg-black/50 border border-slate-800 font-mono text-[10px] text-blue-300 break-all select-all">
                            {v.blockchainTxId || 'Not anchored in blockchain ledger'}
                          </div>
                        </div>
                      </div>

                      {/* Additional Archival Metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-slate-500 block text-[10px] uppercase">Registered By</span>
                          <span className="text-slate-200 font-medium">{v.createdBy?.name}</span>
                          <span className="text-slate-500 block text-[10px]">ID: {v.createdBy?.id}</span>
                        </div>

                        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-slate-500 block text-[10px] uppercase">Recorded Timestamp</span>
                          <span className="text-slate-200 font-medium">{formatDate(v.createdAt)}</span>
                        </div>

                        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-slate-500 block text-[10px] uppercase">Custody Lineage</span>
                          <span className="text-slate-200 font-medium">
                            {isCurrent ? 'Active Legal Evidence' : 'Archived Lineage'}
                          </span>
                        </div>
                      </div>

                      {/* Read-Only Notice */}
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800/70">
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>
                          Revisions in NyayaVault are strictly immutable. File replacement, modification, or deletion is prohibited under evidentiary chain-of-custody protocols.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
