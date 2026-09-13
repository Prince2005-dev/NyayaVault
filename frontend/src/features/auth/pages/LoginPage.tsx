import { useState, type FC } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Lock, Mail, AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth } from '../../../app/providers/AuthProvider';
import { formatErrorMessage } from '../../../services/errors';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid official email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  {
    role: 'INSPECTOR',
    name: 'Inspector Sharma',
    email: 'inspector@nyayavault.local',
    desc: 'Case Management, Document Sealing & Upload',
  },
  {
    role: 'FORENSIC_OFFICER',
    name: 'Dr. A. Verma',
    email: 'forensic@nyayavault.local',
    desc: 'Evidence Examination & Document Verification',
  },
  {
    role: 'AUDITOR',
    name: 'Auditor K. Patel',
    email: 'auditor@nyayavault.local',
    desc: 'Chain of Custody, Audit Log & Integrity Inspection',
  },
];

export const LoginPage: FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'inspector@nyayavault.local',
      password: 'Password@123',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setAuthError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      setAuthError(formatErrorMessage(err));
    }
  };

  const handleSelectDemoUser = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'Password@123', { shouldValidate: true });
    setAuthError(null);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#0b0f19] px-4 py-8 select-none">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 mb-3 shadow-lg shadow-blue-950/40">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            NYAYAVAULT
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mt-1">
            Secure Digital Evidence & DMS
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-2xl p-7 shadow-2xl shadow-black/60">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-slate-200">
              Authorized Personnel Login
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your official credentials or select a seeded role profile.
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                Official Identifier / Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  {...register('email')}
                  placeholder="officer@nyayavault.local"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono transition-colors"
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-mono">
                Access Passphrase / Key
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  {...register('password')}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono transition-colors"
                />
              </div>
              {errors.password && (
                <p className="text-[11px] text-rose-400 mt-1 font-mono">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 disabled:cursor-not-allowed text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer shadow-md shadow-blue-900/30"
            >
              <span>{isSubmitting ? 'Authenticating...' : 'Authenticate & Enter'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Seeded Role Switcher Hints */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Demo Role Presets (Click to autofill)</span>
            </p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => handleSelectDemoUser(acc.email)}
                  className="w-full text-left p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/40 transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="overflow-hidden pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-semibold">
                        {acc.role}
                      </span>
                      <span className="text-xs font-medium text-slate-200 group-hover:text-blue-300">
                        {acc.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{acc.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300 shrink-0">
                    Use &rarr;
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <p className="text-[11px] text-center text-slate-500 font-mono mt-6">
          Authorized legal & investigative personnel only. All access attempts are recorded in the audit log.
        </p>
      </div>
    </div>
  );
};
