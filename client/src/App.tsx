import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
import { Redirect } from "wouter";
import FinanceDashboard from "./pages/finance/FinanceDashboard";
import FinanceMedicos from "./pages/finance/FinanceMedicos";
import FinanceUnidades from "./pages/finance/FinanceUnidades";
import FinanceResponsaveis from "./pages/finance/FinanceResponsaveis";
import FinanceMeuFinanceiro from "./pages/finance/FinanceMeuFinanceiro";
import FinanceAdmin from "./pages/finance/FinanceAdmin";
import FinanceMedicoDetalhe from "./pages/finance/FinanceMedicoDetalhe";
import FinanceOwnerOverview from "./pages/finance/FinanceOwnerOverview";
import FinanceContasReceber from "./pages/finance/FinanceContasReceber";
import FinanceResponsavelDivida from "./pages/finance/FinanceResponsavelDivida";
import FinanceUnidadeDetalhe from "./pages/finance/FinanceUnidadeDetalhe";
import FinanceResponsavelDetalhe from "./pages/finance/FinanceResponsavelDetalhe";
import FinanceDashboard2 from "./pages/finance2/FinanceDashboard2";
import FinancePagamentos from "./pages/finance2/FinancePagamentos";
import FinanceMeuFinanceiro2 from "./pages/finance2/FinanceMeuFinanceiro2";
import { useLocation } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={PacsQueryPage} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/units" component={() => <ProtectedRoute component={Units} />} />
      <Route path="/studies"><Redirect to="/" /></Route>
      <Route path="/templates" component={() => <ProtectedRoute component={Templates} />} />
      <Route path="/viewer/:studyId" component={() => <ProtectedRoute component={ViewerPage} />} />
      <Route path="/pacs-query" component={() => <ProtectedRoute component={PacsQueryPage} />} />
      <Route path="/reports/create/:studyInstanceUid" component={() => <ProtectedRoute component={ReportEditorPage} />} />
      <Route path="/dicom-viewer/:studyUid" component={() => <ProtectedRoute component={DicomViewerPage} />} />
      {/* Admin: admin_master e unit_admin */}
      <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} allowedRoles={['admin_master', 'unit_admin']} />} />
      <Route path="/admin/layouts/:unitId" component={() => <ProtectedRoute component={LayoutEditorPage} allowedRoles={['admin_master', 'unit_admin']} />} />
      {/* Redirects de rotas legadas /billing/* para /financeiro/* */}
      <Route path="/billing/admin"><Redirect to="/financeiro/admin" /></Route>
      <Route path="/billing/unit"><Redirect to="/financeiro/responsaveis" /></Route>
      <Route path="/billing/doctor"><Redirect to="/financeiro/meu-financeiro" /></Route>
      {/* Novo módulo financeiro */}
      {/* Dashboard financeiro: apenas admin_master, unit_admin, responsavel_financeiro */}
      <Route path="/financeiro" component={() => <ProtectedRoute component={FinanceDashboard} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      {/* Médicos: admin_master, unit_admin, responsavel_financeiro */}
      <Route path="/financeiro/medicos" component={() => <ProtectedRoute component={FinanceMedicos} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      {/* Unidades: admin_master, unit_admin, responsavel_financeiro */}
      <Route path="/financeiro/unidades" component={() => <ProtectedRoute component={FinanceUnidades} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      {/* Responsáveis: admin_master, responsavel_financeiro */}
      <Route path="/financeiro/responsaveis" component={() => <ProtectedRoute component={FinanceResponsaveis} allowedRoles={['admin_master', 'responsavel_financeiro']} />} />
      <Route path="/financeiro/responsavel" component={() => <ProtectedRoute component={FinanceResponsaveis} allowedRoles={['admin_master', 'responsavel_financeiro']} />} />
      {/* Meu Financeiro: apenas médicos */}
      <Route path="/financeiro/meu-financeiro" component={() => <ProtectedRoute component={FinanceMeuFinanceiro} allowedRoles={['medico']} />} />
      {/* Admin financeiro: apenas admin_master */}
      <Route path="/financeiro/admin" component={() => <ProtectedRoute component={FinanceAdmin} allowedRoles={['admin_master']} />} />
      {/* Visão operacional do dono do sistema por unidade */}
      <Route path="/financeiro/overview" component={() => <ProtectedRoute component={FinanceOwnerOverview} allowedRoles={['admin_master']} />} />
      {/* Contas a Receber: apenas admin_master */}
      <Route path="/financeiro/contas-receber" component={() => <ProtectedRoute component={FinanceContasReceber} allowedRoles={['admin_master']} />} />
      {/* Dívida do responsável por médico: admin_master e responsavel_financeiro */}
      <Route path="/financeiro/responsaveis/divida" component={() => <ProtectedRoute component={FinanceResponsavelDivida} allowedRoles={['admin_master', 'responsavel_financeiro']} />} />
      {/* Detalhes: admin_master, unit_admin, responsavel_financeiro */}
      <Route path="/financeiro/medicos/:id" component={() => <ProtectedRoute component={FinanceMedicoDetalhe} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      <Route path="/financeiro/unidades/:id" component={() => <ProtectedRoute component={FinanceUnidadeDetalhe} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      <Route path="/financeiro/responsaveis/:id" component={() => <ProtectedRoute component={FinanceResponsavelDetalhe} allowedRoles={['admin_master', 'responsavel_financeiro']} />} />
      {/* Módulo financeiro simplificado v2 */}
      <Route path="/financeiro2" component={() => <ProtectedRoute component={FinanceDashboard2} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      <Route path="/financeiro2/pagamentos" component={() => <ProtectedRoute component={FinancePagamentos} allowedRoles={['admin_master', 'unit_admin', 'responsavel_financeiro']} />} />
      <Route path="/financeiro2/meu-financeiro" component={() => <ProtectedRoute component={FinanceMeuFinanceiro2} allowedRoles={['medico', 'admin_master']} />} />
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
