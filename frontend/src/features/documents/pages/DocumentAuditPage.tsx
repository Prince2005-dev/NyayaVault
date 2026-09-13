import { type FC } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  History,
  Clock,
  Lock,
  UserCheck,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Eye,
  Download,
  FolderX,
  Shield,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate } from '../../../utils/cn';
import { AppApiError } from '../../../services/errors';
import type { AuditEvent } from '../../../types';

export const DocumentAuditPage: FC = () => {
  const { id } = useParams<{ id: string }>();

  // Fetch parent Document record for context
  const {
    data: doc,
    isLoading: docLoading,
    error: docError,
  } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.documents.get(id || ''),
    enabled: !!id,
    retry: 1,
  });

  // Fetch Chronological Audit Events
  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ['document-audit', id],
    queryFn: () => api.documents.audit(id || ''),
    enabled: !!id,
    retry: 1,
  });

  const isLoading = docLoading || auditLoading;

  if (isLoading) {
    return <LoadingSpinner size="lg" label="Loading immutable audit trail from ledger..." />;
  }

  // Handle 404 / Document Not Found
  if (docError) {
    const isNotFound =
      (docError instanceof AppApiError &&
        (docError.code === 'DOCUMENT_NOT_FOUND' || docError.status === 404)) ||
      docError.message.includes('not found');

    if (isNotFound) {
      return (
        <div className="max-w-2xl mx-auto py-12">
          <EmptyState
            icon={FolderX}
            title="Document Record Not Found"
            description={`The document with ID '${id}' does not exist or has no registered audit history.`}
            action={
              <Link
                to="/cases"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Cases Directory</span>
              </Link>
            }
          />
        </div>
      );
    }

    return (
      <ErrorState
        title="Failed to Load Document Context"
        message={docError instanceof Error ? docError.message : 'API connection error.'}
      />
    );
  }

  // Handle Audit API Error
  if (auditError) {
    return (
      <ErrorState
        title="Failed to Retrieve Audit Records"
        message={auditError instanceof Error ? auditError.message : 'Error querying audit trail endpoint.'}
        onRetry={() => refetchAudit()}
      />
    );
  }

  const events: AuditEvent[] = auditData?.events || [];

  // Helper to format action name
  const formatActionName = (action: string): string => {
    return action
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Presentation-only category icon and color styling
  const getEventStyle = (action: string) => {
    const norm = action.toUpperCase();
    if (norm.includes('UPLOAD')) {
      return {
        icon: UploadCloud,
        color: 'text-blue-400 bg-blue-950/80 border-blue-600/70',
        badge: 'bg-blue-950/60 text-blue-300 border-blue-800',
      };
    }
    if (norm.includes('SEAL')) {
      return {
        icon: Lock,
        color: 'text-emerald-400 bg-emerald-950/80 border-emerald-600/70',
        badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
      };
    }
    if (norm.includes('VERIF') || norm.includes('HASH')) {
      return {
        icon: ShieldCheck,
        color: 'text-teal-400 bg-teal-950/80 border-teal-600/70',
        badge: 'bg-teal-950/60 text-teal-300 border-teal-800',
      };
    }
    if (norm.includes('BLOCKCHAIN') || norm.includes('ANCHOR')) {
      return {
        icon: CheckCircle2,
        color: 'text-indigo-400 bg-indigo-950/80 border-indigo-600/70',
        badge: 'bg-indigo-950/60 text-indigo-300 border-indigo-800',
      };
    }
    if (norm.includes('VIEW')) {
      return {
        icon: Eye,
        color: 'text-slate-300 bg-slate-800 border-slate-700',
        badge: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    }
    if (norm.includes('DOWNLOAD')) {
      return {
        icon: Download,
        color: 'text-amber-400 bg-amber-950/80 border-amber-600/70',
        badge: 'bg-amber-950/60 text-amber-300 border-amber-800',
      };
    }
    return {
      icon: History,
      color: 'text-slate-400 bg-slate-900 border-slate-800',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Return to Document Breadcrumb */}
      <div>
        <Link
          to={`/documents/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Document ({doc?.name || id})</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                {id}
              </span>
              {doc?.caseId && (
                <span className="font-mono text-xs text-slate-400">
                  Matter: {doc.caseId}
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
              <History className="w-5 h-5 text-blue-400 shrink-0" />
              <span>Audit Trail: {doc?.name || 'Document History'}</span>
            </h1>

            <p className="text-xs text-slate-400 font-mono">
              Immutable chronological record of digital evidence lifecycle events and custody checkpoints.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="px-3 py-1 text-xs font-mono font-semibold bg-slate-900 text-blue-300 border border-slate-800 rounded-lg">
              {events.length} Recorded Events
            </span>
          </div>
        </div>
      </div>

      {/* Security & Read-Only Notice */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400 font-mono">
        <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Read-Only Audit Trail: All entries are generated and cryptographically bound by backend custody ledgers. The frontend functions solely as a presentation layer and cannot create, modify, or delete audit records.
        </span>
      </div>

      {/* TIMELINE LIST */}
      {events.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit events recorded for this document."
          description="Custody operations, sealing, and verification activities will appear here once registered by the backend."
          action={
            <Link
              to={`/documents/${id}`}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700"
            >
              <span>Back to Document Details</span>
            </Link>
          }
        />
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
          {events.map((event, index) => {
            const style = getEventStyle(event.action);
            const Icon = style.icon;

            return (
              <div key={event.id || index} className="relative group">
                {/* Node Dot / Icon */}
                <div
                  className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full border flex items-center justify-center shadow-md transition-transform group-hover:scale-110 ${style.color}`}
                >
                  <Icon className="w-3 h-3" />
                </div>

                {/* Event Content Card */}
                <div className="bg-[#0d1322] border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-xs transition-colors space-y-2.5">
                  {/* Top Row: Action Title, Category Pill, Timestamp */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-100 font-mono tracking-tight">
                        {formatActionName(event.action)}
                      </h3>
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${style.badge}`}
                      >
                        {event.action}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDate(event.timestamp)}</span>
                    </div>
                  </div>

                  {/* Middle Row: Actor Information */}
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <div className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <span>
                      <strong className="text-slate-200">
                        {event.actor?.name || 'Authorized Officer'}
                      </strong>{' '}
                      <span className="text-[11px] font-mono text-slate-500">
                        (ID: {event.actor?.id || 'usr_unknown'})
                      </span>
                    </span>
                  </div>

                  {/* Bottom Row: Event Details if available */}
                  {event.details && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <p className="text-xs text-slate-400 font-sans leading-relaxed">
                        {event.details}
                      </p>
                    </div>
                  )}

                  {/* Event ID Tag */}
                  <div className="pt-1 text-[10px] font-mono text-slate-600 flex justify-between items-center">
                    <span>Ledger ID: {event.id}</span>
                    <span className="text-slate-600">Event #{index + 1}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
