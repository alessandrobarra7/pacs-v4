import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, UserMinus, Stethoscope, Loader2 } from "lucide-react";

interface UnitDoctorsTabProps {
  unitId: number;
}

/**
 * Aba de médicos no diálogo de edição de unidade.
 * Permite ao admin_master e unit_admin visualizar, adicionar e remover
 * médicos vinculados a uma unidade via user_unit_permissions.
 */
export default function UnitDoctorsTab({ unitId }: UnitDoctorsTabProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");

  const utils = trpc.useUtils();

  // Médicos já vinculados a esta unidade
  const { data: linkedDoctors = [], isLoading: loadingLinked } = trpc.units.listDoctors.useQuery(
    { unitId },
    { enabled: !!unitId },
  );

  // Todos os médicos do sistema
  const { data: allDoctors = [], isLoading: loadingAll } = trpc.units.listAllDoctors.useQuery();

  // Médicos disponíveis para adicionar (não vinculados ainda)
  const linkedIds = new Set(linkedDoctors.map(d => d.id));
  const availableDoctors = allDoctors.filter(d => !linkedIds.has(d.id));

  const addDoctor = trpc.units.addDoctor.useMutation({
    onSuccess: (result) => {
      if (result.alreadyLinked) {
        toast.info("Médico já está vinculado a esta unidade.");
      } else {
        toast.success("Médico vinculado com sucesso!");
      }
      setSelectedDoctorId("");
      utils.units.listDoctors.invalidate({ unitId });
    },
    onError: (e) => toast.error(e.message || "Erro ao vincular médico"),
  });

  const removeDoctor = trpc.units.removeDoctor.useMutation({
    onSuccess: () => {
      toast.success("Médico removido da unidade.");
      utils.units.listDoctors.invalidate({ unitId });
    },
    onError: (e) => toast.error(e.message || "Erro ao remover médico"),
  });

  const handleAdd = () => {
    if (!selectedDoctorId) {
      toast.error("Selecione um médico para adicionar.");
      return;
    }
    addDoctor.mutate({ unitId, doctorUserId: parseInt(selectedDoctorId) });
  };

  const handleRemove = (doctorUserId: number) => {
    if (!confirm("Remover este médico da unidade? O médico perderá acesso aos exames desta unidade.")) return;
    removeDoctor.mutate({ unitId, doctorUserId });
  };

  if (loadingLinked || loadingAll) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando médicos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho informativo */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
        <Stethoscope className="h-4 w-4 text-blue-500 shrink-0" />
        <span>
          Médicos vinculados têm acesso aos exames desta unidade e geram eventos financeiros ao assinar laudos.
        </span>
      </div>

      {/* Adicionar médico */}
      <div className="flex gap-2">
        <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
          <SelectTrigger className="flex-1 text-sm">
            <SelectValue placeholder={
              availableDoctors.length === 0
                ? "Todos os médicos já estão vinculados"
                : "Selecionar médico para adicionar..."
            } />
          </SelectTrigger>
          <SelectContent>
            {availableDoctors.map(doc => (
              <SelectItem key={doc.id} value={String(doc.id)}>
                <span className="font-medium">{doc.name || doc.username}</span>
                {doc.crm && (
                  <span className="ml-2 text-xs text-muted-foreground">CRM {doc.crm}</span>
                )}
                {!doc.isActive && (
                  <span className="ml-2 text-xs text-red-500">(inativo)</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedDoctorId || addDoctor.isPending}
          className="gap-1.5 shrink-0"
        >
          {addDoctor.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Adicionar
        </Button>
      </div>

      {/* Tabela de médicos vinculados */}
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
                <TableHead className="text-xs font-semibold text-gray-600">Usuário</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">CRM</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-600 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedDoctors.map(doc => (
                <TableRow key={doc.id} className="hover:bg-gray-50">
                  <TableCell className="py-2.5 font-medium text-sm">
                    {doc.name || doc.username}
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-muted-foreground">
                    {doc.username}
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-muted-foreground">
                    {doc.crm || <span className="text-gray-300">—</span>}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge
                      variant="outline"
                      className={
                        doc.isActive
                          ? "border-green-200 text-green-700 bg-green-50 text-xs"
                          : "border-red-200 text-red-700 bg-red-50 text-xs"
                      }
                    >
                      {doc.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(doc.id)}
                      disabled={removeDoctor.isPending}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 text-xs h-7 px-2"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Resumo */}
      {linkedDoctors.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {linkedDoctors.length} médico{linkedDoctors.length !== 1 ? "s" : ""} vinculado{linkedDoctors.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
