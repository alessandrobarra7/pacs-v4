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
import { useLocation } from "wouter";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

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
    setLocation("/login");
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
