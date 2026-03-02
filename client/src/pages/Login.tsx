import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { isAuthenticated, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await refresh();
      setLocation("/pacs-query");
    },
    onError: (err) => {
      toast.error(err.message || "Credenciais inválidas");
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/pacs-query");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    if (!login.trim()) {
      setLoginError(true);
      hasError = true;
    }
    if (!password) {
      setPasswordError(true);
      hasError = true;
    }
    if (hasError) return;

    loginMutation.mutate({ login: login.trim(), password });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Lado Esquerdo - Formulário */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-20 xl:px-32 bg-white">
        <div className="max-w-md w-full">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center relative overflow-hidden shadow-lg">
              <div className="absolute inset-0 flex flex-col justify-center">
                <div className="h-1 bg-white/30 mb-1 transform -skew-y-12"></div>
                <div className="h-1.5 bg-white/50 mb-1 transform -skew-y-12"></div>
                <div className="h-2 bg-white/70 mb-1 transform -skew-y-12"></div>
                <div className="h-1.5 bg-white/50 mb-1 transform -skew-y-12"></div>
                <div className="h-1 bg-white/30 transform -skew-y-12"></div>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-0.02em' }}>
                SETE ME
              </h1>
              <span className="text-xl font-medium text-blue-500">
                CLOUD
              </span>
            </div>
          </div>

          {/* Título */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-1">
              Bem Vindo(a),
            </h2>
            <p className="text-gray-500 text-sm">
              Acesse a sua conta abaixo
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Campo Login */}
            <div className="space-y-2">
              <Label htmlFor="login" className="text-sm text-gray-700">
                * E-mail ou Username :
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="login"
                  type="text"
                  placeholder="E-mail ou Username"
                  value={login}
                  autoComplete="username"
                  onChange={(e) => {
                    setLogin(e.target.value);
                    setLoginError(false);
                  }}
                  className={`pl-10 h-11 border-gray-300 ${loginError ? 'border-red-500' : ''}`}
                />
                {loginError && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-red-500" />
                )}
              </div>
              {loginError && (
                <p className="text-sm text-red-500">Entre com o seu E-mail ou Username.</p>
              )}
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-gray-700">
                * Senha :
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(false);
                  }}
                  className={`pl-10 pr-10 h-11 border-gray-300 ${passwordError ? 'border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {passwordError && (
                <p className="text-sm text-red-500">Entre com a sua senha.</p>
              )}
            </div>

            {/* Botão Acessar */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-12 text-base font-medium bg-blue-600 hover:bg-blue-700 rounded-lg mt-6"
            >
              {loginMutation.isPending ? "Entrando..." : "Acessar"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-gray-400 text-center">
            SETE ME CLOUD — Portal de Laudos Radiológicos
          </p>
        </div>
      </div>

      {/* Lado Direito - Imagem */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(/login-medical-bg.jpg)',
            backgroundPosition: 'center center',
          }}
        >
          <div className="absolute inset-0 bg-blue-600/20" />
        </div>
      </div>
    </div>
  );
}
