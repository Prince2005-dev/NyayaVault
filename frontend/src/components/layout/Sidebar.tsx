import type { FC } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  FolderLock,
  History,
  LogOut,
  UserCheck,
  Radio,
} from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { cn } from '../../utils/cn';
import { api } from '../../services/api-client';

export const Sidebar: FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    {
      label: 'Dashboard',
      to: '/dashboard',
      icon: LayoutDashboard,
      roles: ['INSPECTOR', 'FORENSIC_OFFICER', 'AUDITOR'],
    },
    {
      label: 'Cases',
      to: '/cases',
      icon: FolderLock,
      roles: ['INSPECTOR', 'FORENSIC_OFFICER', 'AUDITOR'],
    },
    {
      label: 'Audit & Integrity',
      to: '/audit',
      icon: History,
      roles: ['AUDITOR', 'INSPECTOR'],
    },
  ];

  return (
    <aside className="w-64 bg-[#0d1322] border-r border-slate-800/80 flex flex-col justify-between select-none shrink-0 h-screen sticky top-0">
      {/* Brand & Organization */}
      <div>
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wider text-slate-100 uppercase">
              NyayaVault
            </h1>
            <p className="text-[10px] tracking-wider text-slate-500 font-mono uppercase">
              Legal & Forensics DMS
            </p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer / User Session */}
      <div className="p-3 border-t border-slate-800/80 space-y-3">
        {/* Mock/Live Status Pill */}
        <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>{api.isUsingMocks() ? 'MOCK API' : 'LIVE API'}</span>
          </span>
          <span className="text-[10px] text-slate-500">v0.1.0</span>
        </div>

        {user && (
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
                <p className="text-[10px] font-mono text-blue-400 tracking-wider uppercase truncate">
                  {user.role}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-md border border-slate-800 hover:border-rose-900/40 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
