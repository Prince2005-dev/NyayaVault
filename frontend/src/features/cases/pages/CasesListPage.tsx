import { useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderLock,
  Search,
  Filter,
  PlusCircle,
  ExternalLink,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { useAuth } from '../../../app/providers/AuthProvider';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate } from '../../../utils/cn';
import type { CaseClassification, CaseStatus } from '../../../types';

export const CasesListPage: FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<string>('ALL');

  const {
    data: cases = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cases', searchTerm, statusFilter, classificationFilter],
    queryFn: () =>
      api.cases.list({
        search: searchTerm,
        status: statusFilter,
        classification: classificationFilter,
      }),
  });

  const canCreateCase =
    user?.role === 'INSPECTOR' ||
    user?.role === 'FORENSIC_OFFICER' ||
    (user?.role as string) === 'ADMIN';

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setClassificationFilter('ALL');
  };

  const hasActiveFilters =
    searchTerm !== '' || statusFilter !== 'ALL' || classificationFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderLock className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Case Records & Custody Directory
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Official repository of legal and investigative matters secured under cryptographic custody.
          </p>
        </div>

        {canCreateCase && (
          <Link
            to="/cases/new"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-sm shadow-blue-900/30 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Register New Case</span>
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Case ID, FIR Number, or Case Title..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
            >
              <option value="ALL">Status: All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CLOSED">CLOSED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>

          {/* Classification Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5" />
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
            >
              <option value="ALL">Classification: All</option>
              <option value="INTERNAL">INTERNAL</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL</option>
              <option value="HIGHLY_RESTRICTED">HIGHLY RESTRICTED</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Cases Content */}
      {isLoading ? (
        <LoadingSpinner size="lg" label="Querying case registry..." />
      ) : error ? (
        <ErrorState
          title="Error Fetching Case Records"
          message={error instanceof Error ? error.message : 'API connection error.'}
          onRetry={() => refetch()}
        />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="No cases found"
          description={
            hasActiveFilters
              ? 'No registered matters match your current search or filter criteria.'
              : 'The case ledger is empty. Register your first case to begin securing documents.'
          }
          action={
            hasActiveFilters ? (
              <button
                onClick={resetFilters}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 cursor-pointer"
              >
                Clear Filters
              </button>
            ) : canCreateCase ? (
              <Link
                to="/cases/new"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Register First Case</span>
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Case ID</th>
                  <th className="py-3 px-4">Case Title & Description</th>
                  <th className="py-3 px-4">FIR No.</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Investigating Officer</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {c.caseNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-100">{c.title}</p>
                      {c.description && (
                        <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                          {c.description}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {c.policeStation} • {c.department}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {c.firNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <ClassificationBadge
                        classification={c.classification as CaseClassification}
                        size="sm"
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={c.status as CaseStatus} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <p className="font-medium text-slate-200">
                        {c.investigatingOfficer?.name}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        ID: {c.investigatingOfficer?.id}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-400 font-mono">
                      {formatDate(c.updatedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/cases/${c.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-blue-600 rounded-md border border-slate-700 hover:border-blue-500 transition-colors shadow-xs cursor-pointer"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-800 bg-slate-900/40 text-[11px] font-mono text-slate-500 flex justify-between items-center">
            <span>Showing {cases.length} records</span>
            <span>Total Registered Matters: {cases.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};
