import { Routes, Route, Navigate } from 'react-router-dom';
import { estaAutenticado } from './lib/api';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { WorkspacePage } from './pages/Workspace';
import { ProjetoPage } from './pages/Projeto';
import { ApiKeysPage } from './pages/ApiKeys';
import { Layout } from './components/Layout';

function RotaProtegida({ children }: { children: React.ReactNode }) {
  if (!estaAutenticado()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="workspaces/:workspaceSlug" element={<WorkspacePage />} />
        <Route path="workspaces/:workspaceSlug/projetos/:slug" element={<ProjetoPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
      </Route>
    </Routes>
  );
}
