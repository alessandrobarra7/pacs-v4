import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Units from "./pages/Units";
import Studies from "./pages/Studies";
import Templates from "./pages/Templates";
import Login from "./pages/Login";
import { ViewerPage } from "./pages/ViewerPage";
import { PacsQueryPage } from "./pages/PacsQueryPage";
import ReportEditorPage from "./pages/ReportEditorPage";
import { DicomViewerPage } from "./pages/DicomViewerPage";
import AdminPage from "./pages/AdminPage";
import BillingAdminPage from "./pages/BillingAdminPage";
import BillingUnitPage from "./pages/BillingUnitPage";
import BillingDoctorPage from "./pages/BillingDoctorPage";
import FinanceDashboard from "./pages/finance/FinanceDashboard";
import FinanceMedicos from "./pages/finance/FinanceMedicos";
import FinanceUnidades from "./pages/finance/FinanceUnidades";
import FinanceResponsaveis from "./pages/finance/FinanceResponsaveis";
import FinanceMeuFinanceiro from "./pages/finance/FinanceMeuFinanceiro";
import FinanceAdmin from "./pages/finance/FinanceAdmin";
import FinanceMedicoDetalhe from "./pages/finance/FinanceMedicoDetalhe";
import { useLocation } from "wouter";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, loading } = useAuth();
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
    // Retorna null enquanto o useEffect acima executa o redirect
    return null;
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
      <Route path="/studies" component={() => <ProtectedRoute component={Studies} />} />
      <Route path="/templates" component={() => <ProtectedRoute component={Templates} />} />
      <Route path="/viewer/:studyId" component={() => <ProtectedRoute component={ViewerPage} />} />
      <Route path="/pacs-query" component={() => <ProtectedRoute component={PacsQueryPage} />} />
      <Route path="/reports/create/:studyInstanceUid" component={() => <ProtectedRoute component={ReportEditorPage} />} />
      <Route path="/dicom-viewer/:studyUid" component={() => <ProtectedRoute component={DicomViewerPage} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} />} />
      <Route path="/billing/admin" component={() => <ProtectedRoute component={BillingAdminPage} />} />
      <Route path="/billing/unit" component={() => <ProtectedRoute component={BillingUnitPage} />} />
      <Route path="/billing/doctor" component={() => <ProtectedRoute component={BillingDoctorPage} />} />
      {/* Novo módulo financeiro */}
      <Route path="/financeiro" component={() => <ProtectedRoute component={FinanceDashboard} />} />
      <Route path="/financeiro/medicos" component={() => <ProtectedRoute component={FinanceMedicos} />} />
      <Route path="/financeiro/unidades" component={() => <ProtectedRoute component={FinanceUnidades} />} />
      <Route path="/financeiro/responsaveis" component={() => <ProtectedRoute component={FinanceResponsaveis} />} />
      <Route path="/financeiro/meu-financeiro" component={() => <ProtectedRoute component={FinanceMeuFinanceiro} />} />
      <Route path="/financeiro/admin" component={() => <ProtectedRoute component={FinanceAdmin} />} />
      <Route path="/financeiro/medicos/:id" component={() => <ProtectedRoute component={FinanceMedicoDetalhe} />} />
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
