/**
 * DoctorPriceManager
 *
 * Componente para configurar preços por laudo de cada médico em cada unidade.
 * Integrado no AdminPage — visível apenas para admin_master.
 *
 * Fluxo:
 *  1. Selecionar unidade
 *  2. Ver médicos vinculados à unidade
 *  3. Para cada médico: ver preço vigente + histórico + botão para definir novo preço
 *  4. (M5A) Seção de preços por modalidade: tabela de preços específicos por modalidade
 *
 * Hierarquia de preços (M2B):
 *   billing_doctor_modality_prices (modalidade) → billing_doctor_unit_prices (padrão) → null
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  DollarSign,
  UserCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  History,
  Layers,
  X,
} from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────
const MODALITIES = [
  { value: "CR", label: "CR — Radiografia Computadorizada" },
  { value: "CT", label: "CT — Tomografia Computadorizada" },
  { value: "MR", label: "MR — Ressonância Magnética" },
  { value: "US", label: "US — Ultrassom" },
  { value: "DX", label: "DX — Radiografia Digital" },
  { value: "MG", label: "MG — Mamografia" },
  { value: "NM", label: "NM — Medicina Nuclear" },
  { value: "PT", label: "PT — PET" },
  { value: "XA", label: "XA — Angiografia" },
  { value: "RF", label: "RF — Fluoroscopia" },
  { value: "OTHER", label: "OTHER — Outro / Geral" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Unit {
  id: number;
  name: string;
}

interface Doctor {
  id: number;
  name: string;
  crm: string | null;
}

interface PriceRecord {
  id: number;
  doctor_user_id: number;
  price_per_report: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
}

interface ModalityPriceRecord {
  id: number;
  modality: string;
  price_per_report: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
}

// ─── Sub-componente: Seção de Preços por Modalidade ───────────────────────────
export function ModalityPricesSection({
  doctor,
  financialResponsibleId,
  unitId,
}: {
  doctor: Doctor;
  financialResponsibleId: number;
  unitId: number;
}) {
  const [showSection, setShowSection] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalityForm, setModalityForm] = useState({
    modality: "",
    pricePerReport: "",
    startsAt: new Date().toISOString().slice(0, 10),
  });

  const { data: modalityPrices, refetch: refetchModalityPrices } =
    trpc.financeSimple.listDoctorModalityPrices.useQuery(
      { financialResponsibleId, unitId, doctorUserId: doctor.id },
      { enabled: showSection }
    );

  const setModalityPrice = trpc.financeSimple.setDoctorModalityPrice.useMutation({
    onSuccess: () => {
      toast.success("Preço por modalidade salvo!");
      setShowAddModal(false);
      setModalityForm({ modality: "", pricePerReport: "", startsAt: new Date().toISOString().slice(0, 10) });
      refetchModalityPrices();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const endModalityPrice = trpc.financeSimple.endDoctorModalityPrice.useMutation({
    onSuccess: () => {
      toast.success("Vigência encerrada.");
      refetchModalityPrices();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const now = new Date();
  const active = (modalityPrices ?? []).filter((p) => {
    const starts = new Date(p.starts_at);
    const ends = p.ends_at ? new Date(p.ends_at) : null;
    return starts <= now && (!ends || ends >= now);
  });

  return (
    <div className="mt-2 border-t pt-2">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowSection(!showSection)}
      >
        <Layers className="h-3 w-3" />
        Preços por Modalidade {active.length > 0 && <Badge variant="outline" className="text-xs h-4 px-1">{active.length} ativa{active.length !== 1 ? "s" : ""}</Badge>}
        {showSection ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showSection && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Preços específicos por modalidade sobrepõem o preço padrão do médico.
          </p>

          {/* Tabela de preços por modalidade */}
          {(modalityPrices ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum preço por modalidade cadastrado.</p>
          ) : (
            <div className="space-y-1">
              {(modalityPrices as ModalityPriceRecord[] ?? [])
                .slice()
                .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
                .map((p) => {
                  const isActive = new Date(p.starts_at) <= now && (!p.ends_at || new Date(p.ends_at) >= now);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between text-xs rounded px-3 py-1.5 ${isActive ? "bg-emerald-50 border border-emerald-200" : "bg-muted/30"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs h-4 px-1 font-mono">{p.modality}</Badge>
                        <span className="font-medium">{fmtCurrency(p.price_per_report)}</span>
                        {isActive && <Badge className="text-xs h-4 px-1 bg-emerald-600 hover:bg-emerald-700">ativa</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {fmtDate(p.starts_at)} → {p.ends_at ? fmtDate(p.ends_at) : "atual"}
                        </span>
                        {isActive && (
                          <button
                            title="Encerrar vigência hoje"
                            className="text-destructive hover:text-destructive/80 transition-colors"
                            onClick={() =>
                              endModalityPrice.mutate({
                                id: p.id,
                                endsAt: new Date().toISOString(),
                              })
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar Preço por Modalidade
          </Button>
        </div>
      )}

      {/* Modal: Adicionar Preço por Modalidade */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Preço por Modalidade — {doctor.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              Este preço será aplicado apenas para laudos desta modalidade específica, sobrepondo o preço padrão do médico.
            </div>
            <div>
              <Label className="text-xs">Modalidade</Label>
              <Select value={modalityForm.modality} onValueChange={(v) => setModalityForm({ ...modalityForm, modality: v })}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Selecione a modalidade..." />
                </SelectTrigger>
                <SelectContent>
                  {MODALITIES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Preço por laudo (R$)</Label>
              <Input
                className="h-9 mt-1"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 80.00"
                value={modalityForm.pricePerReport}
                onChange={(e) => setModalityForm({ ...modalityForm, pricePerReport: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência a partir de</Label>
              <Input
                className="h-9 mt-1"
                type="date"
                value={modalityForm.startsAt}
                onChange={(e) => setModalityForm({ ...modalityForm, startsAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancelar</Button>
            <Button
              disabled={!modalityForm.modality || !modalityForm.pricePerReport || !modalityForm.startsAt || setModalityPrice.isPending}
              onClick={() =>
                setModalityPrice.mutate({
                  financialResponsibleId,
                  unitId,
                  doctorUserId: doctor.id,
                  modality: modalityForm.modality,
                  pricePerReport: modalityForm.pricePerReport,
                  startsAt: modalityForm.startsAt,
                })
              }
            >
              {setModalityPrice.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-componente: Card de médico com preço ─────────────────────────────────
function DoctorPriceCard({
  doctor,
  prices,
  financialResponsibleId,
  unitId,
  onPriceSet,
}: {
  doctor: Doctor;
  prices: PriceRecord[];
  financialResponsibleId: number;
  unitId: number;
  onPriceSet: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [showSetPrice, setShowSetPrice] = useState(false);
  const [priceForm, setPriceForm] = useState({
    pricePerReport: "",
    startsAt: new Date().toISOString().slice(0, 10),
  });

  const now = new Date();
  const doctorPrices = prices.filter((p) => p.doctor_user_id === doctor.id);
  const activePrice = doctorPrices.find((p) => {
    const starts = new Date(p.starts_at);
    const ends = p.ends_at ? new Date(p.ends_at) : null;
    return starts <= now && (!ends || ends >= now);
  });

  const setDoctorPrice = trpc.financeSimple.setDoctorPrice.useMutation({
    onSuccess: () => {
      toast.success(`Preço de ${doctor.name} configurado com sucesso!`);
      setShowSetPrice(false);
      setPriceForm({ pricePerReport: "", startsAt: new Date().toISOString().slice(0, 10) });
      onPriceSet();
    },
    onError: (err) => {
      toast.error(`Erro ao configurar preço: ${err.message}`);
    },
  });

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-card">
        {/* Cabeçalho do médico */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{doctor.name}</p>
              {doctor.crm && (
                <p className="text-xs text-muted-foreground">CRM {doctor.crm}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activePrice ? (
              <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">
                {fmtCurrency(activePrice.price_per_report)} / laudo
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Sem preço
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowSetPrice(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {activePrice ? "Alterar" : "Definir Preço"}
            </Button>
          </div>
        </div>

        {/* Vigência do preço ativo */}
        {activePrice && (
          <p className="text-xs text-muted-foreground">
            Vigente desde {fmtDate(activePrice.starts_at)}
            {activePrice.ends_at ? ` até ${fmtDate(activePrice.ends_at)}` : " (sem data de encerramento)"}
          </p>
        )}

        {/* Histórico */}
        {doctorPrices.length > 1 && (
          <div>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3 w-3" />
              {showHistory ? "Ocultar" : "Ver"} histórico ({doctorPrices.length} registros)
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1">
                {doctorPrices
                  .slice()
                  .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5"
                    >
                      <span className="font-medium">{fmtCurrency(p.price_per_report)}</span>
                      <span className="text-muted-foreground">
                        {fmtDate(p.starts_at)} → {p.ends_at ? fmtDate(p.ends_at) : "atual"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* M5A: Seção de preços por modalidade */}
        <ModalityPricesSection
          doctor={doctor}
          financialResponsibleId={financialResponsibleId}
          unitId={unitId}
        />
      </div>

      {/* Modal: Definir/Alterar Preço */}
      <Dialog open={showSetPrice} onOpenChange={setShowSetPrice}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Preço por Laudo — {doctor.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {activePrice && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Preço atual: <strong>{fmtCurrency(activePrice.price_per_report)}/laudo</strong> (vigente desde {fmtDate(activePrice.starts_at)}).
                Ao salvar, o preço atual será encerrado automaticamente na data de início do novo.
              </div>
            )}
            <div>
              <Label className="text-xs">Novo preço por laudo (R$)</Label>
              <Input
                className="h-9 mt-1"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 50.00"
                value={priceForm.pricePerReport}
                onChange={(e) => setPriceForm({ ...priceForm, pricePerReport: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência a partir de</Label>
              <Input
                className="h-9 mt-1"
                type="date"
                value={priceForm.startsAt}
                onChange={(e) => setPriceForm({ ...priceForm, startsAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetPrice(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!priceForm.pricePerReport || !priceForm.startsAt || setDoctorPrice.isPending}
              onClick={() =>
                setDoctorPrice.mutate({
                  financialResponsibleId,
                  unitId,
                  doctorUserId: doctor.id,
                  pricePerReport: priceForm.pricePerReport,
                  startsAt: priceForm.startsAt,
                })
              }
            >
              {setDoctorPrice.isPending ? "Salvando..." : "Salvar Preço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function DoctorPriceManager({
  financialResponsibleId,
  units,
}: {
  financialResponsibleId: number;
  units: Unit[];
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const unitId = selectedUnitId ? parseInt(selectedUnitId) : undefined;

  // Médicos vinculados à unidade selecionada
  const {
    data: doctors,
    isLoading: loadingDoctors,
    refetch: refetchDoctors,
  } = trpc.units.listDoctors.useQuery(
    { unitId: unitId! },
    { enabled: !!unitId }
  );

  // Preços cadastrados para a unidade selecionada
  const {
    data: prices,
    isLoading: loadingPrices,
    refetch: refetchPrices,
  } = trpc.financeSimple.listDoctorPrices.useQuery(
    { financialResponsibleId, unitId: unitId! },
    { enabled: !!unitId }
  );

  const handlePriceSet = () => {
    refetchPrices();
    refetchDoctors();
  };

  const isLoading = loadingDoctors || loadingPrices;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          Preços por Médico
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Configure o valor pago por laudo para cada médico em cada unidade. Preços por modalidade sobrepõem o preço padrão.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Seletor de unidade */}
        <div>
          <Label className="text-xs">Selecionar Unidade</Label>
          <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
            <SelectTrigger className="h-9 mt-1">
              <SelectValue placeholder="Escolha uma unidade..." />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conteúdo dependente da unidade selecionada */}
        {!unitId && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Selecione uma unidade para ver e configurar os preços dos médicos.
          </div>
        )}
        {unitId && isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {unitId && !isLoading && doctors && prices && (
          <>
            {doctors.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <UserCheck className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Nenhum médico vinculado a esta unidade.
                </p>
                <p className="text-xs text-muted-foreground">
                  Acesse <strong>Administração → Unidades</strong> e use a aba{" "}
                  <strong>Médicos</strong> para vincular médicos.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {doctors.length} médico{doctors.length !== 1 ? "s" : ""} vinculado{doctors.length !== 1 ? "s" : ""}
                  </p>
                  {doctors.some((d) => {
                    const now = new Date();
                    return !prices.some(
                      (p) =>
                        p.doctor_user_id === d.id &&
                        new Date(p.starts_at) <= now &&
                        (!p.ends_at || new Date(p.ends_at) >= now)
                    );
                  }) && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Médicos sem preço configurado
                    </Badge>
                  )}
                </div>
                {doctors.map((doctor) => (
                  <DoctorPriceCard
                    key={doctor.id}
                    doctor={doctor as Doctor}
                    prices={prices as PriceRecord[]}
                    financialResponsibleId={financialResponsibleId}
                    unitId={unitId}
                    onPriceSet={handlePriceSet}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
