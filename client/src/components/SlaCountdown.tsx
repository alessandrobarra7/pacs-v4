/**
 * SlaCountdown — Indicador discreto de prazo de laudo
 *
 * Layout compacto (lista de exames):
 *   • ponto colorido + tempo em texto puro, sem caixa/borda
 *
 * Layout expandido (viewer DICOM):
 *   • legenda + tempo com cor
 *
 * Estados:
 *  - sem_anamnese / sem_readiness: nada exibido
 *  - pronto (dentro do prazo): ponto verde + tempo
 *  - proximo (< 20% restante): ponto âmbar + tempo
 *  - vencido: ponto vermelho + tempo negativo
 *  - laudado no prazo: ponto azul + "✓"
 *  - laudado atrasado: ponto laranja + atraso
 *  - sem_sla configurado: ponto cinza
 */
import { useEffect, useState } from "react";

export type ReadinessData = {
  readiness_status: "pending" | "ready_for_reporting" | "reported" | "cancelled" | "invalidated";
  became_ready_at: string | Date;
  due_at: string | Date | null;
  sla_value_snapshot: number | null;
  sla_unit_snapshot: "hour" | "day" | null;
  sla_met: boolean | null;
  delay_seconds: number | null;
};

interface SlaCountdownProps {
  readiness: ReadinessData | null | undefined;
  hasAnamnesis: boolean;
  compact?: boolean;
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const s = Math.floor(abs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d${h % 24}h`;
  if (h > 0) return `${h}h${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Ponto colorido pequeno */
function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

export default function SlaCountdown({ readiness, hasAnamnesis, compact = true }: SlaCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!readiness || readiness.readiness_status === "reported") return;
    // C9: intervalo adaptativo — 30s quando urgente (<2h restantes), 5min quando tranquilo
    const deadline = readiness.due_at ? new Date(readiness.due_at).getTime() : null;
    const remaining = deadline ? deadline - Date.now() : null;
    const isUrgent = remaining !== null && remaining < 2 * 60 * 60 * 1000; // < 2 horas
    const intervalMs = isUrgent ? 30_000 : 5 * 60_000;
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [readiness]);

  // Sem anamnese e sem readiness → nada
  if (!hasAnamnesis && !readiness) return null;

  // Tem anamnese mas sem SLA configurado na unidade
  if (!readiness && hasAnamnesis) {
    if (compact) return null; // na lista não mostrar nada
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Dot color="bg-gray-300" />
        <span>Sem SLA</span>
      </span>
    );
  }

  if (!readiness) return null;

  const status = readiness.readiness_status;

  // ── Laudo entregue ────────────────────────────────────────────────────────
  if (status === "reported") {
    if (readiness.sla_met === null) {
      // Laudado sem SLA
      if (compact) return <span className="inline-flex items-center gap-1"><Dot color="bg-blue-400" /></span>;
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
          <Dot color="bg-blue-400" />
          <span>Laudado</span>
        </span>
      );
    }
    if (readiness.sla_met) {
      if (compact) return <span className="inline-flex items-center gap-1"><Dot color="bg-blue-500" /></span>;
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
          <Dot color="bg-blue-500" />
          <span>No prazo</span>
        </span>
      );
    }
    // Laudado com atraso
    const delayMs = (readiness.delay_seconds ?? 0) * 1000;
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-orange-600" title={`Atraso: ${formatDuration(delayMs)}`}>
          <Dot color="bg-orange-500" />
          <span>+{formatDuration(delayMs)}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-600">
        <Dot color="bg-orange-500" />
        <span>Atrasado +{formatDuration(delayMs)}</span>
      </span>
    );
  }

  // ── Cancelado / invalidado ─────────────────────────────────────────────────
  if (status === "cancelled" || status === "invalidated") {
    if (compact) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Dot color="bg-gray-300" />
        <span>Inválido</span>
      </span>
    );
  }

  // ── Pronto para laudo sem SLA (sem due_at) ─────────────────────────────────
  if (!readiness.due_at) {
    if (compact) return null; // sem SLA, não poluir a lista
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <Dot color="bg-emerald-500" />
        <span>Pronto</span>
      </span>
    );
  }

  // ── Com SLA — calcular tempo restante ──────────────────────────────────────
  const dueMs = new Date(readiness.due_at).getTime();
  const remaining = dueMs - now;
  const isOverdue = remaining < 0;

  let totalMs = 0;
  if (readiness.sla_value_snapshot && readiness.sla_unit_snapshot) {
    totalMs = readiness.sla_unit_snapshot === "hour"
      ? readiness.sla_value_snapshot * 3_600_000
      : readiness.sla_value_snapshot * 86_400_000;
  }
  const isNearDeadline = !isOverdue && totalMs > 0 && remaining < totalMs * 0.2;

  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
        <Dot color="bg-red-500" />
        <span>+{formatDuration(-remaining)}</span>
      </span>
    );
  }

  if (isNearDeadline) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
        <Dot color="bg-amber-400" />
        <span>{formatDuration(remaining)}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <Dot color="bg-emerald-500" />
      <span>{formatDuration(remaining)}</span>
    </span>
  );
}
