import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderLock,
  FileText,
  Lock,
  AlertTriangle,
  PlusCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { useAuth } from '../../../app/providers/AuthProvider';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate } from '../../../utils/cn';

export const DashboardPage: FC = () => {
  const { user } = useAuth();

  // Fetch Cases list
  const {
    data: cases = [],
    isLoading: casesLoading,
    error: casesError,
    refetch: refetchCases,
  } = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.cases.list(),
  });

  // Fetch Documents for the primary active case
  const primaryCaseId = cases[0]?.id || '';
  const {
    data: recentDocs = [],
    isLoading: docsLoading,
  } = useQuery({
    queryKey: ['documents', primaryCaseId],
    queryFn: () => api.documents.listByCase(primaryCaseId),
    enabled: Boolean(cases.length && primaryCaseId),
  });

  if (casesLoading || (docsLoading && !recentDocs.length)) {
    return <LoadingSpinner size="lg" label="Loading DMS overview & ledger metrics..." />;
  }

  if (casesError) {
    return (
      <ErrorState
        title="Failed to Load Dashboard Data"
        message={casesError instanceof Error ? casesError.message : 'Error contacting API.'}
        onRetry={() => refetchCases()}
      />
    );
  }

  // Calculate metrics
  const totalCases = cases.length;
  const totalDocs = cases.reduce((acc, c) => acc + (c.documentCount || 0), recentDocs.length);
  const sealedDocs = recentDocs.filter((d) => d.status === 'SEALED').length;
  const integrityAlerts = recentDocs.filter(
    (d) => d.integrityStatus === 'MISMATCH' || api.isSimulatedTampered(d.id)
  ).length;

  const canCreateCase =
    user?.role === 'INSPECTOR' ||
    user?.role === 'FORENSIC_OFFICER' ||
    (user?.role as string) === 'ADMIN';

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Secured Session: {user?.role}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Case & Evidence Command Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of cryptographic document custody, blockchain anchors, and active investigations.
          </p>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex items-center gap-2.5">
          {canCreateCase && (
            <Link
              to="/cases/new"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-sm shadow-blue-900/30"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Case</span>
            </Link>
          )}
          <Link
            to="/cases"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <FolderLock className="w-4 h-4 text-slate-400" />
            <span>Open Cases</span>
          </Link>
        </div>
      </div>

      {/* 4 Core Metric Cards (No unnecessary charts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: My Cases */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              My Cases
            </span>
            <div className="p-2 rounded-lg bg-blue-950/70 border border-blue-800/60 text-blue-400">
              <FolderLock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">{totalCases}</span>
            <span className="text-[11px] text-slate-400">Active Files</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
            <span className="text-blue-400 font-medium">100%</span>
            <span>in custody tracking</span>
          </div>
        </div>

        {/* Card 2: Documents */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Documents
            </span>
            <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-800/60 text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">{totalDocs}</span>
            <span className="text-[11px] text-slate-400">Cataloged</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Digital evidentiary artifacts</span>
          </div>
        </div>

        {/* Card 3: Sealed Documents */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Sealed Documents
            </span>
            <div className="p-2 rounded-lg bg-emerald-950/70 border border-emerald-800/60 text-emerald-400">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{sealedDocs}</span>
            <span className="text-[11px] text-slate-400">Immutable</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400/80 font-mono">
            SHA-256 locked & anchored
          </div>
        </div>

        {/* Card 4: Integrity Alerts */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Integrity Alerts
            </span>
            <div
              className={`p-2 rounded-lg border ${
                integrityAlerts > 0
                  ? 'bg-rose-950/80 border-rose-700 text-rose-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                integrityAlerts > 0 ? 'text-rose-400' : 'text-slate-100'
              }`}
            >
              {integrityAlerts}
            </span>
            <span className="text-[11px] text-slate-400">Mismatches</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {integrityAlerts === 0 ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> All hashes consistent
              </span>
            ) : (
              <span className="text-rose-400 font-semibold font-mono">
                Attention required immediately
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Cases & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cases */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderLock className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Recent Cases</h3>
            </div>
            <Link
              to="/cases"
              className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>View all</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-900/60 border-y border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Case ID</th>
                  <th className="py-2.5 px-3">Case Title</th>
                  <th className="py-2.5 px-3">Classification</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cases.slice(0, 4).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono font-semibold text-blue-400">
                      {c.caseNumber}
                    </td>
                    <td className="py-3 px-3 text-slate-200 font-medium truncate max-w-[140px]">
                      {c.title}
                    </td>
                    <td className="py-3 px-3">
                      <ClassificationBadge classification={c.classification} size="sm" />
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="py-3 px-3 text-[11px] font-mono text-slate-400">
                      {formatDate(c.updatedAt)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/cases/${c.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-blue-400 bg-slate-800/70 hover:bg-slate-800 px-2 py-1 rounded border border-slate-700 transition-colors"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Recent Documents</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Primary Case: {primaryCaseId}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-900/60 border-y border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Document</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Integrity</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentDocs.slice(0, 4).map((doc) => {
                  const isTampered = api.isSimulatedTampered(doc.id);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-medium text-slate-200 truncate max-w-[130px]">
                          {doc.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">
                          {doc.documentType}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        v{doc.version}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge
                          status={isTampered ? 'TAMPER DETECTED' : doc.integrityStatus}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={doc.status} size="sm" />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-blue-400 bg-slate-800/70 hover:bg-slate-800 px-2 py-1 rounded border border-slate-700 transition-colors"
                        >
                          <span>Details</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
