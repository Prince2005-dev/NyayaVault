import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../../features/auth/pages/LoginPage';
import { DashboardPage } from '../../features/dashboard/pages/DashboardPage';
import { CasesListPage } from '../../features/cases/pages/CasesListPage';
import { CreateCasePage } from '../../features/cases/pages/CreateCasePage';
import { CaseDetailPage } from '../../features/cases/pages/CaseDetailPage';
import { DocumentDetailPage } from '../../features/documents/pages/DocumentDetailPage';
import { DocumentAuditPage } from '../../features/documents/pages/DocumentAuditPage';
import { AuditPage } from '../../features/audit/pages/AuditPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <DashboardPage />,
          },
          {
            path: 'cases',
            element: <CasesListPage />,
          },
          {
            path: 'cases/new',
            element: <CreateCasePage />,
          },
          {
            path: 'cases/:id',
            element: <CaseDetailPage />,
          },
          {
            path: 'documents/:id',
            element: <DocumentDetailPage />,
          },
          {
            path: 'documents/:id/audit',
            element: <DocumentAuditPage />,
          },
          {
            path: 'audit',
            element: <AuditPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
