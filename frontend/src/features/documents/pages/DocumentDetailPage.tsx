import { useState, useEffect, type FC } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  Shield,
  Lock,
  Calendar,
  Clock,
  UserCheck,
  Download,
  Eye,
  ShieldCheck,
  Copy,
  Check,
  FolderX,
  Info,
  Layers,
  X,
  ExternalLink,
  History,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { LoadingSpinner } from '../../../components/feedback/LoadingSpinner';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorState } from '../../../components/feedback/ErrorState';
import { formatDate, formatBytes } from '../../../utils/cn';
import { AppApiError, formatErrorMessage } from '../../../services/errors';
import { VerificationResultPanel } from '../components/VerificationResultPanel';
import { VersionHistorySection } from '../components/VersionHistorySection';
import type { CaseClassification, CaseStatus, VerificationResult } from '../../../types';

export const DocumentDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Sealing State
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [sealSuccessMessage, setSealSuccessMessage] = useState<string | null>(null);

  // Verification State
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Document Viewer Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fetch Document Record
  const {
    data: doc,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.documents.get(id || ''),
    enabled: !!id,
    retry: 1,
  });

  // Clean up preview object URL on unmount or close
  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Copy hash or transaction ID to clipboard
  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Secure Authorized Download
  const handleDownload = async () => {
    if (!doc) return;
    try {
      setIsDownloading(true);
      setDownloadError(null);
      const blob = await api.documents.download(doc.id);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      setDownloadError('Unable to download document. Please verify your access permissions and network connection.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Secure View Action (PDF / Image embedded preview)
  const handleOpenPreview = async () => {
    if (!doc) return;
    setIsPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const blob = await api.documents.download(doc.id);
      const objectUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    } catch (err) {
      console.error('Preview error:', err);
      setPreviewError('Failed to load document content stream for preview. Please verify your access permissions.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
  };

  // Secure Server-side Sealing & Blockchain Anchoring
  const handleSealDocument = async () => {
    if (!doc || isSealing) return;
    setIsSealing(true);
    setSealError(null);
    setSealSuccessMessage(null);

    try {
      await api.documents.seal(doc.id);
      setSealSuccessMessage('Document successfully sealed and cryptographic proof anchored on-chain.');
      await queryClient.invalidateQueries({ queryKey: ['document', doc.id] });
      await queryClient.invalidateQueries({ queryKey: ['case-documents', doc.caseId] });
      await queryClient.invalidateQueries({ queryKey: ['document-versions', doc.id] });
      await queryClient.invalidateQueries({ queryKey: ['document-audit', doc.id] });
      await refetch();
    } catch (err) {
      setSealError(formatErrorMessage(err));
    } finally {
      setIsSealing(false);
    }
  };

  // Secure Server-side Hash Verification
  const handleVerifyIntegrity = async () => {
    if (!doc || isVerifying) return;
    if (doc.status === 'DRAFT') {
      setVerificationError('Document must be sealed before cryptographic verification can be performed.');
      return;
    }
    setIsVerifying(true);
    setVerificationError(null);

    try {
      const result = await api.documents.verify(doc.id);
      setVerificationResult(result);
    } catch (err) {
      setVerificationError(formatErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  };

  // Loading state
  if (isLoading) {
    return <LoadingSpinner size="lg" label="Loading secured document record from vault..." />;
  }

  // Not Found state (404)
  if (error) {
    const isNotFound =
      (error instanceof AppApiError && (error.code === 'DOCUMENT_NOT_FOUND' || error.status === 404)) ||
      error.message.includes('not found');

    if (isNotFound) {
      return (
        <div className="max-w-2xl mx-auto py-12">
          <EmptyState
            icon={FolderX}
            title="Document Record Not Found"
            description="The requested document could not be found or is no longer available."
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
        title="Failed to Load Document"
        message={error instanceof Error ? error.message : 'API connection error.'}
        onRetry={() => refetch()}
      />
    );
  }

  if (!doc) return null;

  const isTampered = api.isSimulatedTampered(doc.id);
  const effectiveIntegrity = isTampered ? 'TAMPER DETECTED' : doc.integrityStatus;
  const isDraft = doc.status === 'DRAFT';

  return (
    <div className="space-y-8">
      {/* Return to Case Breadcrumb */}
      <div>
        <Link
          to={`/cases/${doc.caseId}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Case ({doc.caseId})</span>
        </Link>
      </div>

      {/* DOCUMENT HEADER */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded border border-blue-800/60">
                {doc.id}
              </span>
              <span className="text-slate-500">•</span>
              <Link
                to={`/cases/${doc.caseId}`}
                className="font-mono text-xs text-slate-400 hover:text-blue-400 transition-colors"
              >
                Case: {doc.caseId}
              </Link>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-xs text-slate-400 uppercase">
                {doc.documentType}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
              <FileText className="w-6 h-6 text-blue-400 shrink-0" />
              <span>{doc.name}</span>
            </h1>

            <p className="text-xs text-slate-400 font-mono">
              Version {doc.version} • {formatBytes(doc.size)} • {doc.mimeType}
            </p>
          </div>

          {/* Status & Classification Badges */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ClassificationBadge
              classification={doc.classification as CaseClassification}
              size="md"
            />
            <StatusBadge status={doc.status as CaseStatus} size="md" />
          </div>
        </div>
      </div>

      {/* CUSTODY LIFECYCLE ADVISORY & ALERTS */}
      {isDraft && (
        <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/70 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider font-mono">
              Pending Custody Action: Document in DRAFT Status
            </p>
            <p className="text-xs text-slate-300">
              This evidentiary artifact has been securely ingested into encrypted storage. To compute its authoritative SHA-256 fingerprint, commit it to the immutable audit chain, and anchor proof onto the blockchain, execute the <span className="text-emerald-400 font-semibold font-mono">Seal & Anchor Document</span> action below. Sealing is required before integrity verification can be performed.
            </p>
          </div>
        </div>
      )}

      {sealError && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xs font-semibold text-rose-200 font-mono uppercase">
              Document Sealing Failed
            </h3>
            <p className="text-xs text-rose-300/80 mt-0.5">{sealError}</p>
          </div>
        </div>
      )}

      {sealSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/70 flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xs font-semibold text-emerald-200 font-mono uppercase">
              Document Sealed & Anchored
            </h3>
            <p className="text-xs text-emerald-300/80 mt-0.5">{sealSuccessMessage}</p>
          </div>
        </div>
      )}

      {downloadError && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-semibold text-rose-200 font-mono uppercase">
                Document Download Failed
              </h3>
              <p className="text-xs text-rose-300/80 mt-0.5">{downloadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-rose-400 hover:text-rose-200 p-1 rounded hover:bg-rose-900/50 transition-colors cursor-pointer"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MAIN CONTENT: 2-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: DOCUMENT METADATA */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
              Document Metadata
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Document Type */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                Document Type
              </span>
              <span className="mt-1 text-xs font-mono font-semibold text-slate-200 block">
                {doc.documentType}
              </span>
            </div>

            {/* Version */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                Version
              </span>
              <span className="mt-1 text-xs font-mono font-semibold text-slate-200 block">
                v{doc.version} (Current)
              </span>
            </div>

            {/* File Format / MIME */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                File MIME Type
              </span>
              <span className="mt-1 text-xs font-mono font-semibold text-slate-200 block truncate">
                {doc.mimeType}
              </span>
            </div>

            {/* File Size */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                Artifact Size
              </span>
              <span className="mt-1 text-xs font-mono font-semibold text-slate-200 block">
                {formatBytes(doc.size)}
              </span>
            </div>

            {/* Uploaded By */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Uploaded By</span>
              </span>
              <span className="mt-1 text-xs font-semibold text-slate-200 block">
                {doc.createdBy?.name || 'Officer'}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                ID: {doc.createdBy?.id || 'usr_001'}
              </span>
            </div>

            {/* Created Timestamp */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Creation Timestamp</span>
              </span>
              <span className="mt-1 text-xs font-mono text-slate-200 block">
                {formatDate(doc.createdAt)}
              </span>
            </div>

            {/* Updated Timestamp */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 sm:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Last Updated / Sealed</span>
              </span>
              <span className="mt-1 text-xs font-mono text-slate-200 block">
                {formatDate(doc.updatedAt || doc.createdAt)}
              </span>
            </div>
          </div>

          {/* Description if present */}
          {doc.description && (
            <div className="pt-4 border-t border-slate-800/60">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
                Description / Evidentiary Context
              </span>
              <p className="text-xs text-slate-300 bg-slate-900/40 p-3.5 rounded-lg border border-slate-800/60 leading-relaxed">
                {doc.description}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SECURITY / INTEGRITY TRUST SUMMARY */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-6 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                  Cryptographic Trust Summary
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                Server-Verified
              </span>
            </div>

            {/* Trust Badges Summary Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1.5">
                  Integrity Status
                </span>
                <StatusBadge status={effectiveIntegrity} size="md" />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1.5">
                  Blockchain Anchor
                </span>
                <StatusBadge status={doc.blockchainStatus || 'ANCHORED'} size="md" />
              </div>
            </div>

            {/* SHA-256 Digest Box (Presentation only) */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SHA-256 Cryptographic Hash</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(doc.sha256, 'sha256')}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Copy SHA-256 Hash"
                >
                  {copiedField === 'sha256' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="p-2.5 rounded bg-black/40 border border-slate-800 font-mono text-[11px] text-emerald-300/90 break-all select-all">
                {doc.sha256 || 'Pending calculation by vault'}
              </div>
            </div>

            {/* Blockchain Transaction ID Box */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Blockchain Anchor Transaction ID</span>
                </span>
                {doc.blockchainTxId && (
                  <button
                    type="button"
                    onClick={() => handleCopy(doc.blockchainTxId, 'txId')}
                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Copy Transaction ID"
                  >
                    {copiedField === 'txId' ? (
                      <Check className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
              <div className="p-2.5 rounded bg-black/40 border border-slate-800 font-mono text-[11px] text-blue-300/90 break-all select-all">
                {doc.blockchainTxId || 'Not yet anchored'}
              </div>
            </div>

            {/* Sealed At Timestamp */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Vault Sealing Timestamp:</span>
              <span className="text-slate-200 font-semibold">
                {isDraft ? 'Pending vault sealing' : formatDate(doc.updatedAt || doc.createdAt)}
              </span>
            </div>
          </div>

          {/* Presentation Advisory */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-400 font-mono flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              Values are certified by backend custody ledgers. The frontend functions solely as a presentation layer and does not calculate hashes or mutate blockchain proofs.
            </span>
          </div>
        </div>
      </div>

      {/* VERIFICATION RESULT PANEL */}
      <VerificationResultPanel
        result={verificationResult}
        isVerifying={isVerifying}
        error={verificationError}
        onVerify={handleVerifyIntegrity}
        onDismiss={() => {
          setVerificationResult(null);
          setVerificationError(null);
        }}
      />

      {/* VERSION HISTORY SECTION */}
      <VersionHistorySection
        documentId={doc.id}
        currentVersionNumber={doc.version}
      />

      {/* BOTTOM ACTION BAR */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>Authorized Custody Actions</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Audit Trail Action */}
          <Link
            to={`/documents/${doc.id}/audit`}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <History className="w-4 h-4 text-blue-400" />
            <span>Audit Trail</span>
          </Link>

          {/* View Document Action */}
          <button
            type="button"
            onClick={handleOpenPreview}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <Eye className="w-4 h-4 text-blue-400" />
            <span>View Document</span>
          </button>

          {/* Download Document Action */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 rounded-lg border border-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <Download className={`w-4 h-4 text-emerald-400 ${isDownloading ? 'animate-bounce' : ''}`} />
            <span>{isDownloading ? 'Downloading...' : 'Download Document'}</span>
          </button>

          {/* Seal & Anchor Document Action (Active when in DRAFT status) */}
          {isDraft && (
            <button
              type="button"
              onClick={handleSealDocument}
              disabled={isSealing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-emerald-900/30"
              title="Seal document and anchor cryptographic proof on blockchain"
            >
              <Lock className={`w-4 h-4 ${isSealing ? 'animate-spin' : ''}`} />
              <span>{isSealing ? 'Sealing & Anchoring...' : 'Seal & Anchor Document'}</span>
            </button>
          )}

          {/* Verify Integrity Action (Enabled only after document is sealed) */}
          {isDraft ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 text-slate-500 rounded-lg border border-slate-700/50 cursor-not-allowed"
              title="Document must be sealed before verification can be performed"
            >
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <span>Verify Integrity (Seal Required)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleVerifyIntegrity}
              disabled={isVerifying}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30"
            >
              <ShieldCheck className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Verifying Integrity...' : 'Verify Integrity'}</span>
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENT PREVIEW MODAL (Authorized in-browser viewer) */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
            {/* Preview Modal Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs font-bold text-slate-100 truncate">{doc.name}</span>
                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">
                  {doc.mimeType}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                    title="Open in new window"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="flex-1 bg-black/50 p-4 flex items-center justify-center overflow-auto">
              {previewLoading ? (
                <LoadingSpinner size="lg" label="Streaming authorized document bytes..." />
              ) : previewError ? (
                <div className="text-center p-6 text-xs text-rose-300">
                  <p>{previewError}</p>
                </div>
              ) : previewUrl ? (
                doc.mimeType === 'image/png' || doc.mimeType === 'image/jpeg' ? (
                  <img
                    src={previewUrl}
                    alt={doc.name}
                    className="max-h-full max-w-full object-contain rounded-lg border border-slate-800 shadow-lg"
                  />
                ) : doc.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewUrl}
                    title={doc.name}
                    className="w-full h-full rounded-lg border border-slate-800 bg-white"
                  />
                ) : doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || doc.name.toLowerCase().endsWith('.docx') ? (
                  <div className="text-center p-8 space-y-4 max-w-md">
                    <FileText className="w-12 h-12 text-blue-400 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-slate-100">
                        DOCX Preview Not Available
                      </h4>
                      <p className="text-xs text-slate-300">
                        In-browser visual preview is not supported for DOCX files. Download the file to view its full contents in Microsoft Word or a compatible editor.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isDownloading ? 'Downloading...' : `Download ${doc.name}`}</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-8 space-y-4 max-w-md">
                    <Info className="w-12 h-12 text-slate-400 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-slate-100">
                        Preview Not Supported
                      </h4>
                      <p className="text-xs text-slate-300">
                        In-browser visual preview is not supported for this file format ({doc.mimeType}).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isDownloading ? 'Downloading...' : `Download ${doc.name}`}</span>
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
