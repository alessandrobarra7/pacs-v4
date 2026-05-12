import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Units from "./pages/Units";
import Templates from "./pages/Templates";
import Login from "./pages/Login";
import { ViewerPage } from "./pages/ViewerPage";
import { PacsQueryPage } from "./pages/PacsQueryPage";
import ReportEditorPage from "./pages/ReportEditorPage";
import { DicomViewerPage } from "./pages/DicomViewerPage";
import AdminPage from "./pages/AdminPage";
import LayoutEditorPage from "./pages/LayoutEditorPage";
import FinanceDashboard2 from "./pages/finance2/FinanceDashboard2";
import FinancePagamentos from "./pages/finance2/FinancePagamentos";
import FinanceMeuFinanceiro2 from "./pages/finance2/FinanceMeuFinanceiro2";
import FinanceMeuResponsavel from "./pages/finance2/FinanceMeuResponsavel";
import { useEffect } from "react";

// Roles definidos no schema do banco de dados
type AllowedRole = 'admin_master' | 'unit_admin' | 'medico' | 'operador' | 'viewer' | 'responsavel_financeiro';

function ProtectedRoute({ component: Component, allowedRoles, ...rest }: { component: React.ComponentType<any>; allowedRoles?: AllowedRole[] }) {
  const { isAuthenticated, loading, user } = useAuth();
  const [, setLocation] = useLocation();

  // Bug fix: nunca chamar setLocation durante o render — usar useEffect
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Verificação de role: se a rota exige roles específicos, bloquear acesso não autorizado
  if (allowedRoles && user && !allowedRoles.includes(user.role as AllowedRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h1>
          <p className="text-muted-foreground mb-6">Você não tem permissão para acessar esta página.</p>
          <button
            onClick={() => setLocation('/')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return <Component {...rest} />;
}

// Redirect inteligente por role para /financeiro
// Evita que médico caia em tela de "Acesso Restrito" ao acessar /financeiro
function FinanceRedirect() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user) return;
    if (user.role === 'medico') {
      navigate('/financeiro2/meu-financeiro', { replace: true });
    } else if (user.role === 'responsavel_financeiro') {
      navigate('/financeiro2/responsavel', { replace: true });
    } else {
      navigate('/financeiro2', { replace: true });
    }
  }, [user, navigate]);

  return null;
}

function Router() {
  return (
    <Switch>
      {/* Auth */}
      <Route path="/login" component={Login} />

      {/* Core */}
      <Route path="/" component={() => <ProtectedRoute component={PacsQueryPage} />} />
      <Route path="/pacs-query"><Redirect to="/" /></Route>
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/studies"><Redirect to="/" /></Route>

      {/* Admin */}
      {/* CRÍTICO: /units restrito a admin_master e unit_admin */}
      <Route path="/units" component={() => <ProtectedRoute component={Units} allowedRoles={['admin_master', 'unit_admin']} />} />
      {/* CRÍTICO: /templates restrito a admin_master, unit_admin e medico */}
      <Route path="/templates" component={() => <ProtectedRoute component={Templates} allowedRoles={['admin_master', 'unit_admin', 'medico']} />} />
      <Route path="/viewer/:studyId" component={() => <ProtectedRoute component={ViewerPage} />} />
      <Route path="/reports/create/:studyInstanceUid" component={() => <ProtectedRoute component={ReportEditorPage} />} />
      <Route path="/dicom-viewer/:studyUid" component={() => <ProtectedRoute component={DicomViewerPage} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} allowedRoles={['admin_master', 'unit_admin']} />} />
      <Route path="/admin/layouts/:unitId" component={() => <ProtectedRoute component={LayoutEditorPage} allowedRoles={['admin_master', 'unit_admin']} />} />

      {/* Financeiro — módulo finance2 é o ativo */}
      {/* Redirect inteligente por role: médico→meu-financeiro, responsavel→responsavel, demais→/financeiro2 */}
      <Route path="/financeiro" component={() => <FinanceRedirect />} />
      <Route path="/financeiro/admin"><Redirect to="/financeiro2" /></Route>
      <Route path="/financeiro/meu-financeiro"><Redirect to="/financeiro2/meu-financeiro" /></Route>
      <Route path="/financeiro/responsaveis"><Redirect to="/financeiro2/responsavel" /></Route>
      <Route path="/financeiro/responsavel"><Redirect to="/financeiro2/responsavel" /></Route>
      <Route path="/financeiro/medicos"><Redirect to="/financeiro2" /></Route>
      <Route path="/financeiro/unidades"><Redirect to="/financeiro2" /></Route>
      <Route path="/financeiro/overview"><Redirect to="/financeiro2" /></Route>
      <Route path="/financeiro/contas-receber"><Redirect to="/financeiro2" /></Route>

      {/* Financeiro v2 — rotas ativas */}
      <Route path="/financeiro2" component={() => <ProtectedRoute component={FinanceDashboard2} allowedRoles={['admin_master', 'unit_admin']} />} />
      <Route path="/financeiro2/pagamentos" component={() => <ProtectedRoute component={FinancePagamentos} allowedRoles={['admin_master', 'unit_admin']} />} />
      <Route path="/financeiro2/meu-financeiro" component={() => <ProtectedRoute component={FinanceMeuFinanceiro2} allowedRoles={['medico', 'admin_master']} />} />
      <Route path="/financeiro2/responsavel" component={() => <ProtectedRoute component={FinanceMeuResponsavel} allowedRoles={['responsavel_financeiro', 'admin_master']} />} />

      {/* Redirects de URLs legadas /billing/* */}
      <Route path="/billing/admin"><Redirect to="/financeiro2" /></Route>
      <Route path="/billing/unit"><Redirect to="/financeiro2/responsavel" /></Route>
      <Route path="/billing/doctor"><Redirect to="/financeiro2/meu-financeiro" /></Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
