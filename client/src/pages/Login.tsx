import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Eye, EyeOff, Cloud, CheckCircle2, Headphones, RefreshCw, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/* ── ECG SVG path ─────────────────────────────────────────────────────────── */
const ECG_PATH =
  "M0,30 L60,30 L70,30 L80,10 L90,50 L100,5 L110,55 L120,30 L140,30 L150,30 L160,20 L170,40 L180,30 L240,30 L250,30 L260,15 L270,45 L280,5 L290,55 L300,30 L340,30 L350,30 L360,22 L370,38 L380,30 L440,30 L450,30";

/* ── Status cards data ────────────────────────────────────────────────────── */
const STATUS_CARDS = [
  {
    icon: Cloud,
    label: "PACS Online",
    sub: "Online / Conectado",
    dotColor: "bg-emerald-400",
    iconColor: "text-sky-400",
  },
  {
    icon: CheckCircle2,
    label: "DICOM Ativo",
    sub: "Ativo / Comunicação OK",
    dotColor: "bg-sky-400",
    iconColor: "text-sky-400",
  },
  {
    icon: Headphones,
    label: "Suporte Online 24h",
    sub: "24h / Disponível",
    dotColor: "bg-emerald-400",
    iconColor: "text-sky-400",
  },
  {
    icon: RefreshCw,
    label: "Sincronização OK",
    sub: "100% / Última: 08:59",
    dotColor: "bg-sky-400",
    iconColor: "text-sky-400",
  },
];

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();

  // [BUG1-FIX] desestruturar isAuthenticated e loading para redirect automático
  const { isAuthenticated, loading, refresh } = useAuth();

  // [M6-FIX] respeitar prefers-reduced-motion
  const shouldReduceMotion = useReducedMotion();

  // [BUG1-FIX] redirecionar usuário já autenticado
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/pacs-query");
    }
  }, [isAuthenticated, navigate]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await refresh();
      navigate("/pacs-query");
    },
    onError: (err) => {
      toast.error(err.message || "Usuário ou senha inválidos");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Preencha usuário e senha");
      return;
    }
    loginMutation.mutate({ login: username.trim(), password });
  };

  // [BUG2-FIX] exibir loading enquanto verifica sessão
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#020817" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400" />
          <p style={{ color: "rgba(56,189,248,0.6)", fontSize: "0.85rem" }}>
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: "linear-gradient(135deg, #020b12 0%, #0a1628 50%, #020b12 100%)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* [M10] Glows de fundo animados */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute rounded-full"
          style={{
            width: "600px",
            height: "600px",
            top: "-200px",
            left: "-100px",
            background: "radial-gradient(circle, rgba(56,189,248,0.06) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
          animate={shouldReduceMotion ? {} : {
            x: [0, 30, 0],
            y: [0, 20, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: "500px",
            height: "500px",
            bottom: "-100px",
            right: "200px",
            background: "radial-gradient(circle, rgba(225,29,72,0.05) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
          animate={shouldReduceMotion ? {} : {
            x: [0, -20, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* [M1-FIX] Imagem de fundo com <img aria-hidden> */}
      <img
        src="/login-medical-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        style={{ opacity: 0.12, mixBlendMode: "screen" }}
      />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col lg:flex-row items-stretch">

        {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center px-10 py-12 lg:px-16 xl:px-20">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            {/* Big wordmark */}
            <div className="relative inline-block">
              <span
                style={{
                  fontSize: "clamp(5rem, 12vw, 9rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                  lineHeight: 1,
                  display: "block",
                  textShadow: "0 0 60px rgba(255,255,255,0.08)",
                }}
              >
                Lauds
              </span>
              {/* [M7-FIX] ECG animado com motion.path + pathLength */}
              <svg
                viewBox="0 0 450 60"
                preserveAspectRatio="none"
                className="absolute w-full"
                style={{ top: "52%", left: 0, height: "28px", transform: "translateY(-50%)" }}
                aria-hidden="true"
              >
                <motion.path
                  d={ECG_PATH}
                  fill="none"
                  stroke="#e11d48"
                  strokeWidth="2.5"
                  initial={{ pathLength: 0.8, opacity: 0.75 }}
                  animate={shouldReduceMotion ? {} : {
                    pathLength: [0.8, 1, 0.8],
                    opacity: [0.75, 1, 0.75],
                  }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                />
              </svg>
            </div>

            {/* Subtitle */}
            <p
              className="mt-2 tracking-[0.25em] uppercase"
              style={{ fontSize: "0.78rem", color: "#38bdf8", letterSpacing: "0.22em" }}
            >
              Sistema de Laudos Radiológicos
            </p>
          </motion.div>

          {/* Tagline */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <p className="text-xl font-bold mb-2" style={{ color: "#38bdf8" }}>
              Precisão. Agilidade. Confiabilidade.
            </p>
            <p className="text-sm mb-8" style={{ color: "#94a3b8", maxWidth: "480px" }}>
              Plataforma completa para gestão de exames, laudos e imagens com tecnologia PACS de última geração.
            </p>
          </motion.div>

          {/* Status cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="grid grid-cols-2 gap-3 mb-8"
            style={{ maxWidth: "520px" }}
          >
            {STATUS_CARDS.map((card) => (
              <div
                key={card.label}
                className="flex items-center gap-3 rounded-xl px-4 py-3 relative"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* [M8-FIX] Dot pulsante com motion.span */}
                <motion.span
                  aria-hidden="true"
                  className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full ${card.dotColor}`}
                  animate={shouldReduceMotion ? {} : {
                    scale: [1, 1.35, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
                <card.icon className={`h-8 w-8 shrink-0 ${card.iconColor}`} aria-hidden="true" />
                <div>
                  <p className="font-bold text-sm text-white">{card.label}</p>
                  <p className="text-xs" style={{ color: "#38bdf8" }}>{card.sub}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* [M7-FIX] ECG bar animada */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="flex items-center gap-4"
            style={{ maxWidth: "520px" }}
          >
            <svg viewBox="0 0 450 60" className="flex-1 h-10" preserveAspectRatio="none" aria-hidden="true">
              <motion.path
                d={ECG_PATH}
                fill="none"
                stroke="#e11d48"
                strokeWidth="2"
                initial={{ pathLength: 0.8, opacity: 0.75 }}
                animate={shouldReduceMotion ? {} : {
                  pathLength: [0.8, 1, 0.8],
                  opacity: [0.75, 1, 0.75],
                }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              />
            </svg>
            <span className="text-sm whitespace-nowrap" style={{ color: "#94a3b8" }}>
              Uptime 99.9% — Estável
            </span>
          </motion.div>
        </div>

        {/* ── RIGHT PANEL — Login card ─────────────────────────────────── */}
        <div className="flex items-center justify-center px-6 py-12 lg:px-12 lg:w-[520px] xl:w-[560px]">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="w-full rounded-2xl p-8 md:p-10"
            style={{
              background: "rgba(10, 22, 40, 0.85)",
              border: "1.5px solid rgba(56, 189, 248, 0.25)",
              boxShadow: "0 0 60px rgba(56,189,248,0.06), 0 0 0 1px rgba(225,29,72,0.08)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* ECG icon no card */}
            <div className="flex justify-center mb-6">
              <svg viewBox="0 0 120 50" className="w-28 h-12" aria-hidden="true">
                <motion.path
                  d="M0,25 L25,25 L35,25 L45,5 L55,45 L65,2 L75,48 L85,25 L100,25 L110,25 L115,18 L120,25"
                  fill="none"
                  stroke="#e11d48"
                  strokeWidth="2.5"
                  initial={{ pathLength: 0.8, opacity: 0.75 }}
                  animate={shouldReduceMotion ? {} : {
                    pathLength: [0.8, 1, 0.8],
                    opacity: [0.75, 1, 0.75],
                  }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                />
              </svg>
            </div>

            <h1 className="text-center text-2xl font-bold text-white mb-1">
              Acesso ao Sistema
            </h1>
            <p className="text-center text-sm mb-8" style={{ color: "#94a3b8" }}>
              Informe suas credenciais para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* [M2-FIX] Campo Usuário com label visualmente oculto mas acessível */}
              <div>
                <label
                  htmlFor="login-input"
                  className="sr-only"
                >
                  Usuário
                </label>
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <svg className="h-5 w-5 shrink-0" style={{ color: "#64748b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <input
                    id="login-input"
                    type="text"
                    placeholder="Usuário"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="flex-1 bg-transparent outline-none text-white placeholder-slate-500 text-sm"
                  />
                </div>
              </div>

              {/* [M2-FIX] Campo Senha com label visualmente oculto mas acessível */}
              <div>
                <label
                  htmlFor="password-input"
                  className="sr-only"
                >
                  Senha
                </label>
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <svg className="h-5 w-5 shrink-0" style={{ color: "#64748b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="flex-1 bg-transparent outline-none text-white placeholder-slate-500 text-sm"
                  />
                  {/* [M3-FIX] aria-label no botão de toggle de senha */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />
                    }
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full rounded-xl py-3.5 font-bold text-white text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: "linear-gradient(90deg, #be123c 0%, #e11d48 50%, #be123c 100%)",
                  boxShadow: "0 4px 20px rgba(225,29,72,0.35)",
                }}
              >
                {loginMutation.isPending ? "Entrando..." : "Entrar no Sistema"}
              </button>
            </form>

            {/* Divisor */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-xs" style={{ color: "#475569" }}>ou</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Badge de segurança no card */}
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "#475569" }} aria-hidden="true" />
              <span className="text-xs" style={{ color: "#475569" }}>Ambiente seguro e criptografado</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* [M4-FIX + M5-FIX] Rodapé com 3 colunas responsivas */}
      <footer
        className="relative z-10 grid grid-cols-1 gap-3 md:grid-cols-3 items-center px-8 py-4 text-sm"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(2,11,18,0.7)",
        }}
      >
        {/* Coluna esquerda — contato */}
        <div
          className="flex items-center justify-center gap-2 md:justify-start"
          style={{ color: "#94a3b8" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0"
            style={{ color: "#22c55e" }}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span>Vendas: 98 98484-0224 WhatsApp</span>
        </div>

        {/* Coluna central — segurança */}
        <div
          className="flex items-center justify-center gap-2"
          style={{ color: "#64748b" }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "rgba(56,189,248,0.6)" }} aria-hidden="true" />
          <span>Ambiente seguro e criptografado</span>
        </div>

        {/* Coluna direita — créditos */}
        <div
          className="text-center md:text-right"
          style={{ color: "#475569" }}
        >
          Desenvolvimento{" "}
          <span className="font-semibold" style={{ color: "#94a3b8" }}>
            StudioBarra7
          </span>
        </div>
      </footer>
    </div>
  );
}
