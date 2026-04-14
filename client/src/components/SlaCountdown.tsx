/**
 * SlaCountdown — Badge discreto de prazo de laudo
 *
 * Estados visuais:
 *  - sem_anamnese: cinza (sem anamnese)
 *  - pronto: verde (dentro do prazo)
 *  - proximo: amarelo (< 20% do tempo restante)
 *  - vencido: vermelho (prazo estourado)
 *  - laudado_no_prazo: azul (laudo entregue no prazo)
 *  - laudado_atrasado: laranja (laudo entregue com atraso)
 *  - sem_sla: verde claro (anamnese existe mas sem SLA configurado)
 */
import { useEffect, useState } from "react";
import { Timer, CheckCircle2, AlertCircle, Clock } from "lucide-react";

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
  compact?: boolean; // modo compacto para lista de exames
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const s = Math.floor(abs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function SlaCountdown({ readiness, hasAnamnesis, compact = true }: SlaCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Atualizar a cada 30 segundos para exames em prazo
    if (!readiness || readiness.readiness_status === "reported") return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [readiness]);

  // Sem anamnese
  if (!hasAnamnesis && !readiness) {
    return null; // não mostrar nada se não há anamnese
  }

  // Sem readiness mas tem anamnese (SLA não configurado na unidade)
  if (!readiness && hasAnamnesis) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-1.5 py-0.5 rounded-full border border-border/50 bg-muted/30">
        <Clock className="h-3 w-3" />
        {!compact && <span>Sem SLA</span>}
      </span>
    );
  }

  if (!readiness) return null;

  const status = readiness.readiness_status;

  // Laudo entregue
  if (status === "reported") {
    const slaMet = readiness.sla_met;
    if (slaMet === null) {
      // Sem SLA configurado — apenas indicar que foi laudado
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200 bg-blue-50">
          <CheckCircle2 className="h-3 w-3" />
          {!compact && <span>Laudado</span>}
        </span>
      );
    }
    if (slaMet) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-3 w-3" />
          {!compact && <span>No prazo</span>}
        </span>
      );
    }
    const delay = readiness.delay_seconds ?? 0;
    const delayMs = delay * 1000;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-700 px-1.5 py-0.5 rounded-full border border-orange-200 bg-orange-50">
        <AlertCircle className="h-3 w-3" />
        {!compact && <span>+{formatDuration(delayMs)}</span>}
        {compact && <span title={`Atraso: ${formatDuration(delayMs)}`}>Atrasado</span>}
      </span>
    );
  }

  // Cancelado / invalidado
  if (status === "cancelled" || status === "invalidated") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-1.5 py-0.5 rounded-full border border-border bg-muted/30">
        <Timer className="h-3 w-3" />
        {!compact && <span>Inválido</span>}
      </span>
    );
  }

  // Pronto para laudo — com ou sem SLA
  if (!readiness.due_at) {
    // Sem SLA configurado — apenas indicar que está pronto
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">
        <Timer className="h-3 w-3" />
        {!compact && <span>Pronto</span>}
      </span>
    );
  }

  // Com SLA — calcular tempo restante
  const dueMs = new Date(readiness.due_at).getTime();
  const remaining = dueMs - now;
  const isOverdue = remaining < 0;

  // Calcular total do SLA para determinar "próximo do vencimento" (< 20%)
  let totalMs = 0;
  if (readiness.sla_value_snapshot && readiness.sla_unit_snapshot) {
    totalMs = readiness.sla_unit_snapshot === "hour"
      ? readiness.sla_value_snapshot * 3_600_000
      : readiness.sla_value_snapshot * 86_400_000;
  }
  const isNearDeadline = !isOverdue && totalMs > 0 && remaining < totalMs * 0.2;

  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-700 px-1.5 py-0.5 rounded-full border border-red-200 bg-red-50 font-medium">
        <AlertCircle className="h-3 w-3" />
        <span>+{formatDuration(-remaining)}</span>
      </span>
    );
  }

  if (isNearDeadline) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 font-medium">
        <Timer className="h-3 w-3" />
        <span>{formatDuration(remaining)}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">
      <Timer className="h-3 w-3" />
      <span>{formatDuration(remaining)}</span>
    </span>
  );
}
