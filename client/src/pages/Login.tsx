import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Headphones,
  Lock,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";

// ─── Status cards (purely decorative, no API calls) ───────────────────────────
const statusCards = [
  {
    title: "PACS Online",
    status: "Online / Conectado",
    icon: Cloud,
    iconColor: "text-sky-400",
    dotColor: "bg-emerald-400",
  },
  {
    title: "DICOM Ativo",
    status: "Ativo / Comunicação OK",
    icon: CheckCircle2,
    iconColor: "text-sky-400",
    dotColor: "bg-sky-400",
  },
  {
    title: "Suporte Online 24h",
    status: "24h / Disponível",
    icon: Headphones,
    iconColor: "text-sky-400",
    dotColor: "bg-emerald-400",
  },
  {
    title: "Sincronização OK",
    status: "100% / Última: 08:59",
    icon: RefreshCw,
    iconColor: "text-sky-400",
    dotColor: "bg-sky-400",
  },
];

// ─── Animated ECG line ─────────────────────────────────────────────────────────
function HeartbeatLine() {
  const shouldReduceMotion = useReducedMotion();
  return (
    <div className="mt-8 flex items-center gap-4">
      <svg
        viewBox="0 0 600 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-1 h-10"
        aria-hidden="true"
      >
        <motion.path
          d="M0 28 H110 L126 28 L138 10 L152 46 L166 22 L184 28 H310
             L326 28 L338 10 L352 46 L366 22 L384 28 H600"
          fill="none"
          stroke="#ff3f5e"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0.8, opacity: 0.7 }}
          animate={
            shouldReduceMotion
              ? {}
              : {
                  pathLength: [0.8, 1, 0.8],
                  opacity: [0.7, 1, 0.7],
                }
          }
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
        Uptime 99.9% — Estável
      </span>
    </div>
  );
}

export default function Login() {
  const { isAuthenticated, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const shouldReduceMotion = useReducedMotion();

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
    if (isAuthenticated) setLocation("/pacs-query");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      toast.error("Preencha usuário e senha");
      return;
    }
    loginMutation.mutate({ login: login.trim(), password });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center">
        <Activity className="h-8 w-8 text-[#ff3f5e] animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden bg-[#020817]"
    >
      {/* ── Background image ──────────────────────────────────────────────── */}
      <img
        src="/login-medical-bg.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.07] select-none"
      />

      {/* ── Gradient overlay ──────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 40%, rgba(56,189,248,0.06) 0%, transparent 60%)," +
            "radial-gradient(ellipse 60% 50% at 80% 70%, rgba(255,63,94,0.06) 0%, transparent 55%)",
        }}
      />

      {/* ── Animated glow blobs ───────────────────────────────────────────── */}
      {!shouldReduceMotion && (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl"
            animate={{ x: [0, 28, 0], y: [0, -16, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 bottom-32 h-64 w-64 rounded-full blur-3xl"
            style={{ background: "rgba(255,63,94,0.08)" }}
            animate={{ x: [0, -20, 0], y: [0, 20, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center">

          {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col"
          >
            {/* Logo */}
            <div className="mb-4">
              <h2
                className="font-black tracking-tight text-white leading-none select-none"
                style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)" }}
              >
                Lauds
                <span
                  aria-hidden="true"
                  className="inline-block ml-2 align-middle"
                  style={{ lineHeight: 0 }}
                >
                  <svg
                    viewBox="0 0 60 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ height: "0.55em", display: "inline-block", verticalAlign: "middle" }}
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M0 10 H12 L16 10 L20 2 L26 18 L30 6 L34 10 H60"
                      fill="none"
                      stroke="#ff3f5e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.4, ease: "easeOut" }}
                    />
                  </svg>
                </span>
              </h2>

              <p className="mt-2 text-xs tracking-[0.25em] text-sky-300/80 uppercase font-medium">
                Sistema de Laudos Radiológicos
              </p>
            </div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-lg font-semibold text-sky-400 mb-2"
            >
              Precisão. Agilidade. Confiabilidade.
            </motion.p>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-sm text-slate-400 mb-8 max-w-sm"
            >
              Plataforma completa para gestão de exames, laudos e imagens com tecnologia PACS de última geração.
            </motion.p>

            {/* Status cards */}
            <div className="grid grid-cols-2 gap-3">
              {statusCards.map((card, i) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.5 }}
                  whileHover={shouldReduceMotion ? {} : { y: -2, scale: 1.01 }}
                  className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
                >
                  <motion.span
                    aria-hidden="true"
                    className={`absolute right-3 top-3 h-2 w-2 rounded-full ${card.dotColor}`}
                    animate={
                      shouldReduceMotion
                        ? {}
                        : { scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }
                    }
                    transition={{ duration: 2.2, repeat: Infinity }}
                  />
                  <card.icon className={`h-5 w-5 ${card.iconColor} mb-2`} aria-hidden="true" />
                  <p className="text-sm font-semibold text-white">{card.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{card.status}</p>
                </motion.div>
              ))}
            </div>

            {/* ECG line */}
            <HeartbeatLine />
          </motion.div>

          {/* ── RIGHT PANEL — Login card ───────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative w-full max-w-md mx-auto overflow-hidden rounded-[28px] border border-sky-300/20 bg-[rgba(7,20,38,0.88)] shadow-[0_0_80px_rgba(255,63,94,0.10)] backdrop-blur-xl"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at top left, rgba(56,189,248,0.14) 0%, transparent 35%)," +
                  "radial-gradient(circle at bottom right, rgba(255,63,94,0.14) 0%, transparent 30%)",
              }}
            />

            <div className="relative z-10 p-8 md:p-10">
              {/* ECG header */}
              <div className="flex justify-center mb-6">
                <svg viewBox="0 0 120 40" fill="none" className="h-8 w-28" aria-hidden="true">
                  <motion.path
                    d="M0 20 H30 L38 20 L44 6 L52 34 L60 16 L68 20 H120"
                    fill="none"
                    stroke="#ff3f5e"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
                  />
                </svg>
              </div>

              {/* Titles */}
              <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Acesso ao Sistema
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Informe suas credenciais para continuar
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="login"
                    className="block text-xs font-medium text-slate-300 mb-2 tracking-wide"
                  >
                    Usuário
                  </label>
                  <div className="relative">
                    <User
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login"
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="seu.usuario@dominio.com"
                      autoComplete="username"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.05] pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:bg-white/[0.08] transition duration-200"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium text-slate-300 mb-2 tracking-wide"
                  >
                    Senha
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.05] pl-10 pr-12 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400/50 focus:bg-white/[0.08] transition duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="relative w-full overflow-hidden rounded-xl py-3.5 px-6 bg-[#ff3f5e] hover:bg-[#e8334e] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wide transition duration-200 focus:outline-none focus:ring-2 focus:ring-[#ff3f5e]/50 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  {!shouldReduceMotion && !loginMutation.isPending && (
                    <motion.span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-[-30%] w-1/3 bg-white/15 blur-lg"
                      animate={{ x: ["0%", "280%"] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                  <span className="relative z-10">
                    {loginMutation.isPending ? "Entrando..." : "Entrar no Sistema"}
                  </span>
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-slate-500">ou</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-sky-400/60" aria-hidden="true" />
                <span>Ambiente seguro e criptografado</span>
              </div>
            </div>
          </motion.div>

        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-slate-950/45 px-6 py-4 grid grid-cols-1 gap-3 md:grid-cols-3 items-center text-sm text-sky-200/80">
        <div className="flex items-center justify-center gap-3 md:justify-start">
          <PhoneCall className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Vendas: 98 98484-0224 WhatsApp</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <ShieldCheck className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
          <span>Ambiente seguro e criptografado</span>
        </div>
        <div className="text-center md:text-right text-sky-200/60">
          Desenvolvimento{" "}
          <span className="font-semibold text-sky-300">StudioBarra7</span>
        </div>
      </footer>
    </div>
  );
}
