import { useState, type FC } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FolderLock,
  FileText,
  Building,
  UserCheck,
  Calendar,
  Clock,
  PlusCircle,
  ExternalLink,
  Download,
  ShieldCheck,
  FolderX,
  Info,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate, formatBytes } from '../../../utils/cn';
import { AppApiError } from '../../../services/errors';
import { UploadDocumentModal } from '../../documents/components/UploadDocumentModal';
import type { CaseClassification, CaseStatus } from '../../../types';

export const CaseDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  // Fetch Case Information
  const {
    data: caseData,
    isLoading: caseLoading,
    error: caseError,
    refetch: refetchCase,
  } = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.cases.get(id || ''),
    enabled: !!id,
    retry: 1,
  });

  // Fetch Documents belonging to this case
  const {
    data: documents = [],
    isLoading: docsLoading,
    error: docsError,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['case-documents', id],
    queryFn: () => api.documents.listByCase(id || ''),
    enabled: !!caseData?.id,
  });

  // Secure authorized download handler
  const handleDownload = async (docId: string, fileName: string) => {
    try {
      setDownloadingId(docId);
      const blob = await api.documents.download(docId);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  // Loading state
  if (caseLoading) {
    return <LoadingSpinner size="lg" label="Retrieving secured case records from ledger..." />;
  }

  // Not Found state
  if (caseError) {
    const isNotFound =
      (caseError instanceof AppApiError && (caseError.code === 'CASE_NOT_FOUND' || caseError.status === 404)) ||
      caseError.message.includes('not found');

    if (isNotFound) {
      return (
        <div className="max-w-2xl mx-auto py-12">
          <EmptyState
            icon={FolderX}
            title="Case Record Not Found"
            description={`The requested case matter '${id}' does not exist or has not been registered in the ledger.`}
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
        title="Failed to Load Case Record"
        message={caseError instanceof Error ? caseError.message : 'API connection error.'}
        onRetry={() => refetchCase()}
      />
    );
  }

  if (!caseData) return null;

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/cases"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Cases Directory</span>
        </Link>
      </div>

      {/* HEADER SECTION */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                {caseData.caseNumber}
              </span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-xs text-slate-400">
                Ref: {caseData.firNumber}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              {caseData.title}
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Jurisdiction: {caseData.policeStation} • Division: {caseData.department}
            </p>
          </div>

          {/* Status & Classification Badges */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ClassificationBadge
              classification={caseData.classification as CaseClassification}
              size="md"
            />
            <StatusBadge status={caseData.status as CaseStatus} size="md" />
          </div>
        </div>
      </div>

      {/* CASE INFORMATION METADATA CARD */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <FileText className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
            Case Information & Chain of Custody
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* FIR Number */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              FIR Number
            </span>
            <span className="mt-1 text-xs font-mono font-semibold text-slate-200 block">
              {caseData.firNumber}
            </span>
          </div>

          {/* Investigating Officer */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Investigating Officer</span>
            </span>
            <span className="mt-1 text-xs font-semibold text-slate-200 block">
              {caseData.investigatingOfficer?.name}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Badge/ID: {caseData.investigatingOfficer?.id}
            </span>
          </div>

          {/* Department */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-blue-400" />
              <span>Department / Division</span>
            </span>
            <span className="mt-1 text-xs font-semibold text-slate-200 block">
              {caseData.department}
            </span>
          </div>

          {/* Police Station */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              Police Station / Jurisdiction
            </span>
            <span className="mt-1 text-xs font-semibold text-slate-200 block">
              {caseData.policeStation}
            </span>
          </div>

          {/* Created At */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Registered Timestamp</span>
            </span>
            <span className="mt-1 text-xs font-mono text-slate-200 block">
              {formatDate(caseData.createdAt)}
            </span>
          </div>

          {/* Updated At */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Last Modified</span>
            </span>
            <span className="mt-1 text-xs font-mono text-slate-200 block">
              {formatDate(caseData.updatedAt)}
            </span>
          </div>
        </div>

        {/* Narrative Description if available */}
        {caseData.description && (
          <div className="pt-4 border-t border-slate-800/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
              Case Narrative & Evidentiary Summary
            </span>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-3.5 rounded-lg border border-slate-800/60">
              {caseData.description}
            </p>
          </div>
        )}
      </div>

      {/* DOCUMENTS SECTION */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderLock className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-slate-100">
                Evidentiary Documents
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {documents.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Digital documents and forensic reports cryptographically associated with this matter.
            </p>
          </div>

          {/* + Upload Document */}
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Upload Document</span>
          </button>
        </div>

        {/* Documents Content */}
        {docsLoading ? (
          <LoadingSpinner size="md" label="Loading case documents..." />
        ) : docsError ? (
          <ErrorState
            title="Failed to Load Case Documents"
            message={docsError instanceof Error ? docsError.message : 'API error fetching documents.'}
            onRetry={() => refetchDocs()}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents have been added to this case yet."
            description="All uploaded digital evidence and forensic records for this case will appear here with cryptographic fingerprints."
          />
        ) : (
          <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-slate-900/80 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Document Name</th>
                    <th className="py-3 px-4">Document Type</th>
                    <th className="py-3 px-4">Version</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Integrity</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4">Updated At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {documents.map((doc) => {
                    const isTampered = api.isSimulatedTampered(doc.id);
                    const integrityStatus = isTampered ? 'TAMPER DETECTED' : doc.integrityStatus;
                    const isDownloading = downloadingId === doc.id;

                    return (
                      <tr
                        key={doc.id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        {/* Document Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-400 shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-semibold text-slate-100 truncate max-w-xs">
                                {doc.name}
                              </p>
                              <p className="text-[10px] font-mono text-slate-500">
                                {formatBytes(doc.size)} • {doc.mimeType}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Document Type */}
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-semibold text-slate-300">
                            {doc.documentType}
                          </span>
                        </td>

                        {/* Version */}
                        <td className="py-3.5 px-4 font-mono text-slate-300 font-medium">
                          v{doc.version}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={doc.status} size="sm" />
                        </td>

                        {/* Integrity */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={integrityStatus} size="sm" />
                        </td>

                        {/* Uploaded By */}
                        <td className="py-3.5 px-4 text-slate-300">
                          <p className="font-medium text-slate-200">
                            {doc.createdBy?.name}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            {formatDate(doc.createdAt)}
                          </p>
                        </td>

                        {/* Updated At */}
                        <td className="py-3.5 px-4 text-[11px] text-slate-400 font-mono">
                          {formatDate(doc.updatedAt || doc.createdAt)}
                        </td>

                        {/* Action Buttons: Open, Verify, Download */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* Open Action */}
                            <Link
                              to={`/documents/${doc.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors"
                              title="Open Document Record"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>

                            {/* Verify Action */}
                            <Link
                              to={`/documents/${doc.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-950/50 hover:bg-emerald-950/80 rounded border border-emerald-700/60 transition-colors"
                              title="Inspect Cryptographic Verification"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Verify</span>
                            </Link>

                            {/* Download Action */}
                            <button
                              type="button"
                              onClick={() => handleDownload(doc.id, doc.name)}
                              disabled={isDownloading}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 rounded border border-slate-700 transition-colors cursor-pointer"
                              title="Authorized Download"
                            >
                              <Download className={`w-3 h-3 ${isDownloading ? 'animate-bounce' : ''}`} />
                              <span>{isDownloading ? '...' : 'Download'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-900/40 text-[11px] font-mono text-slate-500 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                <span>Documents are sealed under SHA-256 custody ledger protocol.</span>
              </span>
              <span>Total Documents: {documents.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        caseId={caseData.id}
        caseNumber={caseData.caseNumber}
        defaultClassification={caseData.classification as CaseClassification}
      />
    </div>
  );
};
