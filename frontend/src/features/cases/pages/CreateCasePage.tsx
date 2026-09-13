import { useState, type FC } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderPlus,
  ArrowLeft,
  Shield,
  Building,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../../services/api-client';
import { useAuth } from '../../../app/providers/AuthProvider';
import { formatErrorMessage } from '../../../services/errors';


const createCaseSchema = z.object({
  title: z
    .string()
    .min(3, 'Case title must be at least 3 characters')
    .max(150, 'Case title is too long'),
  firNumber: z
    .string()
    .min(3, 'FIR Number is required')
    .regex(/^FIR\/\d{4}\/\d+|[A-Z0-9\-\/]+$/i, 'Please enter a valid FIR reference (e.g. FIR/2026/102)'),
  department: z.string().min(2, 'Department division is required'),
  policeStation: z.string().min(2, 'Police station jurisdiction is required'),
  description: z.string().optional(),
  classification: z.enum(['INTERNAL', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED']),
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']),
});

type CreateCaseFormValues = z.infer<typeof createCaseSchema>;

export const CreateCasePage: FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const canCreate =
    user?.role === 'INSPECTOR' ||
    user?.role === 'FORENSIC_OFFICER' ||
    (user?.role as string) === 'ADMIN';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateCaseFormValues>({
    resolver: zodResolver(createCaseSchema),
    defaultValues: {
      title: '',
      firNumber: `FIR/2026/${Math.floor(100 + Math.random() * 900)}`,
      department: 'Central Crime Branch',
      policeStation: 'Central Station',
      description: '',
      classification: 'CONFIDENTIAL',
      status: 'ACTIVE',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCaseFormValues) => api.cases.create(data),
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      navigate(`/cases/${newCase.id}`);
    },
    onError: (err) => {
      setFormError(formatErrorMessage(err));
    },
  });

  const onSubmit = async (values: CreateCaseFormValues) => {
    setFormError(null);
    await createMutation.mutateAsync(values);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link & Header */}
      <div>
        <Link
          to="/cases"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Cases Directory</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400">
            <FolderPlus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Register New Case Matter
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Create an immutable case folder to attach and seal evidentiary documents.
            </p>
          </div>
        </div>
      </div>

      {!canCreate && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold uppercase tracking-wider font-mono">
              Role Access Advisory
            </p>
            <p className="mt-1 text-slate-300">
              Only officers with <span className="font-mono text-amber-300 font-bold">INSPECTOR</span>, <span className="font-mono text-amber-300 font-bold">FORENSIC_OFFICER</span>, or <span className="font-mono text-amber-300 font-bold">ADMIN</span> roles possess permission to register new case files. As a {user?.role || 'visitor'}, this operation is restricted.
            </p>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-7 shadow-sm">
        {formError && (
          <div className="mb-6 p-3.5 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Section 1: Core Identifiers */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-blue-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <FileText className="w-4 h-4" />
              <span>1. Case Identification</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FIR Number */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  FIR Number / Official Reference *
                </label>
                <input
                  type="text"
                  {...register('firNumber')}
                  placeholder="FIR/2026/042"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                />
                {errors.firNumber && (
                  <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.firNumber.message}</p>
                )}
              </div>

              {/* Case Title */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  Case Title *
                </label>
                <input
                  type="text"
                  {...register('title')}
                  placeholder="e.g. State vs. Evidence Tampering Inquiry"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {errors.title && (
                  <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.title.message}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                Case Description / Narrative Summary
              </label>
              <textarea
                rows={3}
                {...register('description')}
                placeholder="Provide factual summary, primary charges, and evidentiary context..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Section 2: Department Jurisdiction */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-blue-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Building className="w-4 h-4" />
              <span>2. Department Jurisdiction & Custody</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  Investigating Department *
                </label>
                <input
                  type="text"
                  {...register('department')}
                  placeholder="e.g. Women Safety Division, Cyber Crime Branch"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {errors.department && (
                  <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.department.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  Police Station / Court Jurisdiction *
                </label>
                <input
                  type="text"
                  {...register('policeStation')}
                  placeholder="e.g. Central Station, Tis Hazari Court"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {errors.policeStation && (
                  <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.policeStation.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Classification & Status */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-blue-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Shield className="w-4 h-4" />
              <span>3. Legal Classification & Lifecycle Status</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  Classification Tier *
                </label>
                <select
                  {...register('classification')}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                >
                  <option value="INTERNAL">INTERNAL (Standard Official Use)</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL (Restricted Investigation)</option>
                  <option value="HIGHLY_RESTRICTED">HIGHLY RESTRICTED (Strict Chain of Custody)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Governs evidentiary access and clearance levels.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                  Initial Status *
                </label>
                <select
                  {...register('status')}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                >
                  <option value="ACTIVE">ACTIVE (Open for Evidence Intake)</option>
                  <option value="CLOSED">CLOSED (Completed Investigation)</option>
                  <option value="ARCHIVED">ARCHIVED (Locked Permanent Record)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
            <Link
              to="/cases"
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !canCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer shadow-md shadow-blue-900/30"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Registering Case...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Register Case Matter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
