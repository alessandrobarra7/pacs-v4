import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const { isAuthenticated, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

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

      {/* ── PAINEL ESQUERDO — imagem radiológica P&B ── */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-black">
        {/* Imagem em preto e branco */}
        <img
          src="https://images.unsplash.com/photo-1516549655169-df83a0774514?w=1400&q=85&auto=format&fit=crop"
          alt="Ambiente radiológico"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "grayscale(100%)", opacity: 0.72 }}
        />
        {/* Overlay escuro semitransparente */}
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.38)" }} />

        {/* Nome LAUDS no canto inferior esquerdo — igual ao de referência */}
        <div className="absolute bottom-10 left-10 z-10">
          <p className="text-white text-4xl font-bold tracking-tight leading-none select-none">
            LAUDS
          </p>
          <p className="text-white/75 text-sm mt-1.5 tracking-wide">
            Sistema de Laudos Radiológicos
          </p>
        </div>
      </div>

      {/* ── PAINEL DIREITO — formulário ── */}
      <div className="w-full lg:w-1/2 flex flex-col bg-white">

        {/* Área central com o formulário */}
        <div className="flex-1 flex items-center justify-center px-8 md:px-16 lg:px-20 xl:px-28">
          <div className="w-full max-w-sm">

            {/* Logo mobile */}
            <div className="lg:hidden mb-8">
              <p className="text-2xl font-bold text-gray-900">LAUDS</p>
              <p className="text-sm text-gray-500 mt-0.5">Sistema de Laudos Radiológicos</p>
            </div>

            {/* Título do formulário */}
            <div className="mb-7">
              <h2 className="text-2xl font-semibold text-gray-900">Entrar</h2>
              <p className="text-sm text-gray-500 mt-1">Informe suas credenciais</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Campo Usuário */}
              <div>
                <label
                  htmlFor="login"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Usuário
                </label>
                <input
                  id="login"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="seu usuário"
                  autoComplete="username"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {/* Campo Senha */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {/* Botão Entrar */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 mt-1"
              >
                {loginMutation.isPending ? "Entrando..." : "Entrar"}
              </button>

            </form>
          </div>
        </div>

        {/* Rodapé */}
        <div className="py-6 text-center">
          <p className="text-xs text-gray-400">Desenvolvimento StudioBarra7</p>
        </div>

      </div>
    </div>
  );
}
