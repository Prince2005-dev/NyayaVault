import { useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Shield,
  FileText,
  ExternalLink,
  Lock,
  FolderLock,
  ChevronDown,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { formatDate } from '../../../utils/cn';

export const AuditPage: FC = () => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  // 1. Fetch accessible cases for the authenticated user
  const {
    data: cases = [],
    isLoading: casesLoading,
    error: casesError,
    refetch: refetchCases,
  } = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.cases.list(),
  });

  // Resolve active case: explicitly selected case, or default to the first accessible case
  const activeCase = cases.find((c) => c.id === selectedCaseId) || cases[0] || null;
  const activeCaseId = activeCase?.id || '';

  // 2. Fetch documents scoped strictly to the active case
  const {
    data: documents = [],
    isLoading: docsLoading,
    error: docsError,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['case-documents', activeCaseId],
    queryFn: () => api.documents.listByCase(activeCaseId),
    enabled: Boolean(activeCaseId),
  });

  const isLoading = casesLoading || (Boolean(activeCaseId) && docsLoading);
  const error = casesError || docsError;

  const handleRetry = () => {
    refetchCases();
    if (activeCaseId) {
      refetchDocs();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Evidence Audit & Custody Ledgers
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Official immutable inspection point for digital evidence integrity logs and forensic audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Ledger Integrity: <strong className="text-slate-200">ACTIVE</strong></span>
        </div>
      </div>

      {/* Security Advisory */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400 font-mono">
        <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Read-Only Audit Ledger: Select any evidentiary artifact below to review its complete chronological chain-of-custody timeline.
        </span>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingSpinner size="lg" label="Loading audit repository..." />
      ) : error ? (
        <ErrorState
          title="Error Loading Audit Records"
          message={error instanceof Error ? error.message : 'API connection error.'}
          onRetry={handleRetry}
        />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="No Registered Cases Available"
          description="There are currently no authorized case matters registered in the custody vault. Register or join a case matter to inspect evidence audit trails."
          action={
            <Link
              to="/cases/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
            >
              <span>Create Case Matter</span>
            </Link>
          }
        />
      ) : (
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
          {/* Card Header with dynamic case selection */}
          <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Evidence Artifacts with Cryptographic Records</span>
            </h3>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">Case Matter:</span>
              {cases.length > 1 ? (
                <div className="relative">
                  <select
                    value={activeCaseId}
                    onChange={(e) => setSelectedCaseId(e.target.value)}
                    className="appearance-none bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-mono rounded-lg px-3 py-1.5 pr-8 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {cases.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                        {c.caseNumber} - {c.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded border border-blue-800/60">
                  {activeCase?.caseNumber || activeCaseId}
                </span>
              )}
            </div>
          </div>

          {/* Documents Table or Empty Documents State */}
          {documents.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs font-mono text-slate-400">
                No evidentiary artifacts uploaded to case <strong className="text-slate-200">{activeCase?.caseNumber || activeCaseId}</strong> yet.
              </p>
              <Link
                to={`/cases/${activeCaseId}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                <span>Open Case to Upload Evidence</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-900/80 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Document ID</th>
                    <th className="py-3 px-4">Document Name & Type</th>
                    <th className="py-3 px-4">Classification</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sealed At</th>
                    <th className="py-3 px-4 text-right">Audit Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                        {doc.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-200">{doc.name}</p>
                        <p className="text-[10px] font-mono text-slate-500 uppercase">
                          {doc.documentType} • v{doc.version}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <ClassificationBadge classification={doc.classification} size="sm" />
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={doc.status} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {formatDate(doc.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/documents/${doc.id}/audit`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:text-white bg-blue-950/60 hover:bg-blue-600 rounded-md border border-blue-800/60 hover:border-blue-500 transition-colors shadow-xs"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>View Audit Trail</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
