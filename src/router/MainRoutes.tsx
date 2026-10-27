import { Navigate, useRoutes } from 'react-router-dom';
import { ProvidersWorkbenchPage } from '@/features/providers/ProvidersWorkbenchPage';
import { AuthFilesPage } from '@/features/authFiles/AuthFilesPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { OAuthPage } from '@/features/oauth/OAuthPage';
import { QuotaPage } from '@/features/quota/QuotaPage';
import { LogsPage } from '@/features/logs/LogsPage';
import { SystemPage } from '@/pages/SystemPage';

const MAIN_ROUTES = [
  { path: '/', element: <Navigate to="/quota" replace /> },
  { path: '/quota', element: <QuotaPage /> },
  { path: '/auth-files', element: <AuthFilesPage /> },
  { path: '/auth-files/oauth-excluded', element: <AuthFilesOAuthExcludedEditPage /> },
  { path: '/auth-files/oauth-model-alias', element: <AuthFilesOAuthModelAliasEditPage /> },
  { path: '/oauth', element: <OAuthPage /> },
  { path: '/ai-providers', element: <ProvidersWorkbenchPage /> },
  { path: '/logs', element: <LogsPage /> },
  { path: '/system', element: <SystemPage /> },
  { path: '*', element: <Navigate to="/quota" replace /> },
];

export function MainRoutes() {
  return useRoutes(MAIN_ROUTES);
}
