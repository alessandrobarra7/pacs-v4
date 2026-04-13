import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, UserMinus, Stethoscope, Loader2, Pencil, Check, X, DollarSign } from "lucide-react";

interface UnitDoctorsTabProps {
  unitId: number;
}

export default function UnitDoctorsTab({ unitId }: UnitDoctorsTabProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");
  const utils = trpc.useUtils();

  const { data: linkedDoctors = [], isLoading: loadingLinked } = trpc.units.listDoctors.useQuery(
    { unitId }, { enabled: !!unitId },
  );
  const { data: unitCtx, isLoading: loadingCtx } = trpc.billing.getUnitFullContext.useQuery(
    { unitId }, { enabled: !!unitId },
  );
  const { data: allDoctors = [], isLoading: loadingAll } = trpc.units.listAllDoctors.useQuery();

  const linkedIds = new Set(linkedDoctors.map(d => d.id));
  const availableDoctors = allDoctors.filter(d => !linkedIds.has(d.id));

  const addDoctor = trpc.units.addDoctor.useMutation({
    onSuccess: (result) => {
      if (result.alreadyLinked) { toast.info("Médico já está vinculado a esta unidade."); }
      else { toast.success("Médico vinculado com sucesso!"); }
      setSelectedDoctorId("");
      utils.units.listDoctors.invalidate({ unitId });
      utils.billing.getUnitFullContext.invalidate({ unitId });
    },
    onError: (e) => toast.error(e.message || "Erro ao vincular médico"),
  });

  const removeDoctor = trpc.units.removeDoctor.useMutation({
    onSuccess: () => {
      toast.success("Médico removido da unidade.");
      utils.units.listDoctors.invalidate({ unitId });
      utils.billing.getUnitFullContext.invalidate({ unitId });
    },
    onError: (e) => toast.error(e.message || "Erro ao remover médico"),
  });

  const setDoctorPriceDirect = trpc.billing.setDoctorPriceDirect.useMutation({
    onSuccess: () => {
      toast.success("Preço atualizado com sucesso!");
      setEditingDoctorId(null);
      setEditingPriceValue("");
      utils.billing.getUnitFullContext.invalidate({ unitId });
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar preço"),
  });

  const handleAdd = () => {
    if (!selectedDoctorId) { toast.error("Selecione um médico para adicionar."); return; }
    addDoctor.mutate({ unitId, doctorUserId: parseInt(selectedDoctorId) });
  };

  const handleRemove = (doctorUserId: number) => {
    if (!confirm("Remover este médico da unidade?")) return;
    removeDoctor.mutate({ unitId, doctorUserId });
  };

  const handleSavePrice = (doctorUserId: number) => {
    const price = parseFloat(editingPriceValue.replace(",", "."));
    if (isNaN(price) || price <= 0) { toast.error("Digite um valor válido maior que zero."); return; }
    setDoctorPriceDirect.mutate({
      doctorUserId, unitId,
      pricePerReport: price.toFixed(2),
      startsAt: new Date().toISOString(),
    });
  };

  const priceMap = new Map<number, string>();
  if (unitCtx?.doctorPrices) {
    for (const dp of unitCtx.doctorPrices) {
      if (dp.doctor_user_id) priceMap.set(dp.doctor_user_id, dp.price_per_report);
    }
  }

  if (loadingLinked || loadingAll) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando médicos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
        <Stethoscope className="h-4 w-4 text-blue-500 shrink-0" />
        <span>Médicos vinculados têm acesso aos exames desta unidade. Configure o valor por laudo diretamente na tabela.</span>
      </div>

      <div className="flex gap-2">
        <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
          <SelectTrigger className="flex-1 text-sm">
            <SelectValue placeholder={availableDoctors.length === 0 ? "Todos os médicos já estão vinculados" : "Selecionar médico para adicionar..."} />
          </SelectTrigger>
          <SelectContent>
            {availableDoctors.map(doc => (
              <SelectItem key={doc.id} value={String(doc.id)}>
                <span className="font-medium">{doc.name || doc.username}</span>
                {doc.crm && <span className="ml-2 text-xs text-muted-foreground">CRM {doc.crm}</span>}
                {!doc.isActive && <span className="ml-2 text-xs text-red-500">(inativo)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={!selectedDoctorId || addDoctor.isPending} className="gap-1.5 shrink-0">
          {addDoctor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Adicionar
        </Button>
      </div>

      {linkedDoctors.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-md">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Nenhum médico vinculado a esta unidade.</p>
          <p className="text-xs mt-1">Use o seletor acima para adicionar médicos.</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-600">Nome</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">CRM</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />Valor/Laudo
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedDoctors.map(doc => {
                const activePrice = priceMap.get(doc.id);
                const isEditingThis = editingDoctorId === doc.id;
                return (
                  <TableRow key={doc.id} className="hover:bg-gray-50">
                    <TableCell className="py-2.5 font-medium text-sm">{doc.name || doc.username}</TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">{doc.crm || <span className="text-gray-300">—</span>}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className={doc.isActive ? "border-green-200 text-green-700 bg-green-50 text-xs" : "border-red-200 text-red-700 bg-red-50 text-xs"}>
                        {doc.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5 text-center">
                      {isEditingThis ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-muted-foreground">R$</span>
                          <Input value={editingPriceValue} onChange={e => setEditingPriceValue(e.target.value)}
                            className="h-7 w-20 text-sm text-right" placeholder="0.00" autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") handleSavePrice(doc.id);
                              if (e.key === "Escape") { setEditingDoctorId(null); setEditingPriceValue(""); }
                            }} />
                          <button type="button" onClick={() => handleSavePrice(doc.id)} disabled={setDoctorPriceDirect.isPending}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                            <Check className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => { setEditingDoctorId(null); setEditingPriceValue(""); }}
                            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          {activePrice ? (
                            <span className="text-sm font-semibold text-emerald-600">R$ {parseFloat(activePrice).toFixed(2)}</span>
                          ) : loadingCtx ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <span className="text-xs text-amber-500 font-medium">Sem preço</span>
                          )}
                          <button type="button"
                            onClick={() => { setEditingDoctorId(doc.id); setEditingPriceValue(activePrice ? parseFloat(activePrice).toFixed(2) : ""); }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar preço">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(doc.id)} disabled={removeDoctor.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 text-xs h-7 px-2">
                        <UserMinus className="h-3.5 w-3.5" />Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {linkedDoctors.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {linkedDoctors.length} médico{linkedDoctors.length !== 1 ? "s" : ""} vinculado{linkedDoctors.length !== 1 ? "s" : ""}
          {unitCtx?.doctorPrices && unitCtx.doctorPrices.length > 0 && (
            <> · {unitCtx.doctorPrices.length} com preço configurado</>
          )}
        </p>
      )}
    </div>
  );
}
