import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { isAuthenticated, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    if (!login.trim() || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    loginMutation.mutate({ login: login.trim(), password });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Lado Esquerdo — Imagem com overlay e nome LAUDS */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col">
        {/* Imagem de fundo em preto e branco */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(/login-medical-bg.jpg)',
            filter: 'grayscale(100%)',
          }}
        />
        {/* Overlay escuro */}
        <div className="absolute inset-0 bg-black/55" />
        {/* Nome LAUDS no canto inferior esquerdo */}
        <div className="relative mt-auto p-10">
          <h1 className="text-5xl font-bold text-white tracking-tight">LAUDS</h1>
          <p className="text-white/70 text-base mt-2">Sistema de Laudos Radiológicos</p>
        </div>
      </div>

      {/* Lado Direito — Formulário */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-20 xl:px-28 bg-[#F9FAFB]">
        <div className="max-w-sm w-full mx-auto">
          {/* Título */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900">Entrar</h2>
            <p className="text-gray-500 text-sm mt-1">Informe suas credenciais</p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Campo Usuário */}
            <div className="space-y-1.5">
              <Label htmlFor="login" className="text-sm font-medium text-gray-700">
                Usuário
              </Label>
              <Input
                id="login"
                type="text"
                placeholder="Digite seu usuário"
                value={login}
                autoComplete="username"
                onChange={(e) => setLogin(e.target.value)}
                className="h-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Botão Entrar */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-10 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md mt-2"
            >
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
