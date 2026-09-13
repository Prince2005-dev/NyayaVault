import type { FC } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Lock } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { api } from '../../services/api-client';

export const Topbar: FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  const getPageTitle = (pathname: string) => {
    if (pathname.startsWith('/cases/new')) return 'New Case Registration';
    if (pathname.startsWith('/cases/') && pathname.includes('/documents/')) return 'Document Details';
    if (pathname.startsWith('/cases/')) return 'Case Details';
    if (pathname.startsWith('/documents/')) return 'Document Details';
    if (pathname.startsWith('/cases')) return 'Case Ledger & Records';
    if (pathname.startsWith('/audit')) return 'Audit Trail & Integrity Log';
    return 'DMS Executive Dashboard';
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0d1322]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Title / Context */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
          {getPageTitle(location.pathname)}
        </h2>
      </div>

      {/* Security Status Badges & Officer */}
      <div className="flex items-center gap-4 text-xs">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[11px]">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Ledger: <strong className="text-slate-200">IMMUTABLE / SHA-256</strong></span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>Endpoint: <span className="text-slate-300 truncate max-w-[150px] inline-block align-bottom">{api.getBaseUrl()}</span></span>
        </div>

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-medium text-slate-200">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
};
