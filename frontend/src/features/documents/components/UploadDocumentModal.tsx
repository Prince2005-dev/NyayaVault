import { useState, useRef, type FC, type ChangeEvent, type DragEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  UploadCloud,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Shield,
  Layers,
  FileText,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ClassificationBadge } from '../../../components/ui/ClassificationBadge';
import { formatBytes } from '../../../utils/cn';
import { formatErrorMessage } from '../../../services/errors';
import type {
  CaseClassification,
  DocumentItem,
  DocumentType,
} from '../../../types';

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const uploadMetadataSchema = z.object({
  title: z
    .string()
    .min(2, 'Document title is required')
    .max(120, 'Title cannot exceed 120 characters'),
  documentType: z.enum([
    'FIR',
    'WITNESS_STATEMENT',
    'FORENSIC_REPORT',
    'EVIDENCE',
    'CHARGE_SHEET',
    'COURT_FILING',
    'LEGAL_NOTICE',
    'OTHER',
  ]),
  classification: z.enum(['INTERNAL', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED']),
  description: z.string().optional(),
});

type UploadMetadataForm = z.infer<typeof uploadMetadataSchema>;

type UploadState = 'IDLE' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  defaultClassification?: CaseClassification;
}

export const UploadDocumentModal: FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  defaultClassification = 'CONFIDENTIAL',
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('IDLE');
  const [createdDoc, setCreatedDoc] = useState<DocumentItem | null>(null);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UploadMetadataForm>({
    resolver: zodResolver(uploadMetadataSchema),
    defaultValues: {
      title: '',
      documentType: 'FORENSIC_REPORT',
      classification: defaultClassification,
      description: '',
    },
  });

  if (!isOpen) return null;

  // File validation
  const validateAndSetFile = (file: File) => {
    setFileError(null);
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType =
      ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME_TYPES.includes(file.type);

    if (!isValidType) {
      setFileError(
        `Unsupported file type (${ext || file.type || 'unknown'}). Allowed formats: PDF, JPG, PNG, DOCX.`
      );
      setSelectedFile(null);
      setUploadState('IDLE');
      return;
    }

    setSelectedFile(file);
    setUploadState('SELECTED');

    // Suggest default title based on filename without extension
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ');
    setValue('title', baseName, { shouldValidate: true });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    setUploadState('IDLE');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetModal = () => {
    setSelectedFile(null);
    setFileError(null);
    setUploadState('IDLE');
    setCreatedDoc(null);
    setApiErrorMessage(null);
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (uploadState === 'UPLOADING' || uploadState === 'PROCESSING') return;
    if (uploadState === 'SUCCESS') {
      // Invalidate case documents query so the table immediately shows the new document
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    }
    handleResetModal();
    onClose();
  };

  const onSubmit = async (values: UploadMetadataForm) => {
    if (!selectedFile) {
      setFileError('Please select a document file to proceed.');
      return;
    }

    setApiErrorMessage(null);
    setUploadState('UPLOADING');

    try {
      // Short synthetic visual step to distinguish UPLOADING from server PROCESSING
      await new Promise((r) => setTimeout(r, 400));
      setUploadState('PROCESSING');

      const result = await api.documents.upload(caseId, selectedFile, {
        documentType: values.documentType as DocumentType,
        title: values.title,
        classification: values.classification as CaseClassification,
        description: values.description,
      });

      setCreatedDoc(result);
      setUploadState('SUCCESS');
      // Invalidate immediately in background
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    } catch (err) {
      setApiErrorMessage(formatErrorMessage(err));
      setUploadState('ERROR');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/15 text-blue-400 border border-blue-500/30">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Upload Evidentiary Document
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Target Matter: <span className="text-blue-400 font-semibold">{caseNumber}</span>
              </p>
            </div>
          </div>

          {uploadState !== 'UPLOADING' && uploadState !== 'PROCESSING' && (
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* STATE 1: IDLE / Drag-Drop Zone */}
          {uploadState === 'IDLE' && (
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
                }`}
              >
                <div className="p-3.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 mb-3">
                  <UploadCloud className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Select a document to upload
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Drag and drop your file here, or browse files from your computer.
                </p>
                <span className="mt-3 text-[11px] font-mono text-slate-500 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                  Supported formats: PDF, JPG, PNG, DOCX
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {fileError && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-start gap-2 text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          )}

          {/* STATE 2: SELECTED (File info + Metadata Form) */}
          {(uploadState === 'SELECTED' || uploadState === 'UPLOADING' || uploadState === 'PROCESSING') && selectedFile && (
            <form id="upload-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Selected File Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 rounded-lg bg-blue-950/70 text-blue-400 border border-blue-800/60 shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-200 truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {formatBytes(selectedFile.size)} • {selectedFile.type || 'Document file'}
                    </p>
                  </div>
                </div>

                {uploadState === 'SELECTED' && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-md transition-colors cursor-pointer shrink-0"
                    title="Remove selected file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* UPLOADING STATE INDICATOR */}
              {uploadState === 'UPLOADING' && (
                <div className="p-5 rounded-xl bg-blue-950/30 border border-blue-800/50 text-center space-y-2">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-mono text-blue-300 font-semibold uppercase tracking-wider">
                    Uploading document payload...
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Transmitting binary stream to secure NyayaVault repository.
                  </p>
                </div>
              )}

              {/* PROCESSING STATE INDICATOR */}
              {uploadState === 'PROCESSING' && (
                <div className="p-5 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-center space-y-2">
                  <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-mono text-emerald-300 font-semibold uppercase tracking-wider">
                    Document uploaded. Processing...
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Registering artifact and executing initial validation.
                  </p>
                </div>
              )}

              {/* METADATA FIELDS (Disabled during submission) */}
              <div
                className={`space-y-4 ${
                  uploadState === 'UPLOADING' || uploadState === 'PROCESSING'
                    ? 'opacity-50 pointer-events-none'
                    : ''
                }`}
              >
                {/* Document Title */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
                    Document Title *
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      {...register('title')}
                      placeholder="e.g. Forensic Chemical Analysis Report"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  {errors.title && (
                    <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.title.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Document Type */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
                      Document Type *
                    </label>
                    <div className="relative">
                      <Layers className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        {...register('documentType')}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                      >
                        <option value="FIR">FIR</option>
                        <option value="WITNESS_STATEMENT">Witness Statement</option>
                        <option value="FORENSIC_REPORT">Forensic Report</option>
                        <option value="EVIDENCE">Evidence</option>
                        <option value="CHARGE_SHEET">Charge Sheet</option>
                        <option value="COURT_FILING">Court Filing</option>
                        <option value="LEGAL_NOTICE">Legal Notice</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Classification */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
                      Classification *
                    </label>
                    <div className="relative">
                      <Shield className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        {...register('classification')}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                      >
                        <option value="INTERNAL">INTERNAL</option>
                        <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                        <option value="HIGHLY_RESTRICTED">HIGHLY RESTRICTED</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Description (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    {...register('description')}
                    placeholder="Specific notes regarding chain of recovery or evidentiary purpose..."
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                </div>
              </div>
            </form>
          )}

          {/* STATE 4: SUCCESS */}
          {uploadState === 'SUCCESS' && createdDoc && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/70 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-200">
                    Document Uploaded as DRAFT
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    The document has been securely uploaded in DRAFT status. Review and seal this document on the document details page to generate a SHA-256 fingerprint and anchor it to the blockchain.
                  </p>
                </div>
              </div>

              {/* Returned information card */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Document ID:</span>
                  <span className="font-bold text-blue-400">{createdDoc.id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Version:</span>
                  <span className="text-slate-200 font-semibold">v{createdDoc.version}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Status:</span>
                  <StatusBadge status={createdDoc.status} size="sm" />
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Integrity:</span>
                  <StatusBadge status={createdDoc.integrityStatus} size="sm" />
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Classification:</span>
                  <ClassificationBadge classification={createdDoc.classification} size="sm" />
                </div>
              </div>
            </div>
          )}

          {/* STATE 5: ERROR */}
          {uploadState === 'ERROR' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-200">
                    Document Upload Failed
                  </h3>
                  <p className="text-xs text-rose-300/80 mt-1">
                    {apiErrorMessage || 'An error occurred while uploading the document.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-end gap-2.5">
          {uploadState === 'IDLE' && (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {uploadState === 'SELECTED' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="upload-form"
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload Document</span>
              </button>
            </>
          )}

          {(uploadState === 'UPLOADING' || uploadState === 'PROCESSING') && (
            <button
              type="button"
              disabled
              className="px-5 py-2 text-xs font-semibold bg-blue-800/50 text-white/50 rounded-lg cursor-not-allowed border border-blue-700/30"
            >
              Processing Upload...
            </button>
          )}

          {uploadState === 'SUCCESS' && (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-emerald-900/30"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Done (View in Case List)</span>
            </button>
          )}

          {uploadState === 'ERROR' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setUploadState('SELECTED')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-rose-700 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
