import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function Units() {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);

  const { data: units, refetch } = trpc.units.list.useQuery();
  const createMutation = trpc.units.create.useMutation();
  const updateMutation = trpc.units.update.useMutation();
  const deleteMutation = trpc.units.delete.useMutation();

  const emptyForm = {
    name: "",
    slug: "",
    pacs_ip: "",
    pacs_port: "",
    pacs_ae_title: "",
    pacs_local_ae_title: "LAUDS",
  };

  const [formData, setFormData] = useState(emptyForm);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.pacs_port || isNaN(Number(formData.pacs_port))) {
      toast.error("Porta PACS inválida");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: formData.name,
        slug: formData.slug,
        pacs_ip: formData.pacs_ip,
        pacs_port: Number(formData.pacs_port),
        pacs_ae_title: formData.pacs_ae_title,
        pacs_local_ae_title: formData.pacs_local_ae_title || "LAUDS",
      });
      toast.success("Unidade criada com sucesso!");
      setIsCreateOpen(false);
      setFormData(emptyForm);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar unidade");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    try {
      await updateMutation.mutateAsync({
        id: editingUnit.id,
        name: formData.name,
        slug: formData.slug,
        pacs_ip: formData.pacs_ip || undefined,
        pacs_port: formData.pacs_port ? Number(formData.pacs_port) : undefined,
        pacs_ae_title: formData.pacs_ae_title || undefined,
        pacs_local_ae_title: formData.pacs_local_ae_title || undefined,
      });
      toast.success("Unidade atualizada com sucesso!");
      setEditingUnit(null);
      setFormData(emptyForm);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar unidade");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta unidade?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Unidade excluída com sucesso!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir unidade");
    }
  };

  const openEdit = (unit: any) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name || "",
      slug: unit.slug || "",
      pacs_ip: unit.pacs_ip || "",
      pacs_port: unit.pacs_port?.toString() || "",
      pacs_ae_title: unit.pacs_ae_title || "",
      pacs_local_ae_title: unit.pacs_local_ae_title || "LAUDS",
    });
  };

  if (user?.role !== "admin_master") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const UnitForm = ({ onSubmit, isPending, submitLabel }: { onSubmit: (e: React.FormEvent) => void; isPending: boolean; submitLabel: string }) => (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome da Unidade *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Clínica Central"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              placeholder="clinica-central"
              required
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Configuração PACS (DICOM)</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pacs_ip">IP do PACS *</Label>
              <Input
                id="pacs_ip"
                value={formData.pacs_ip}
                onChange={(e) => setFormData({ ...formData, pacs_ip: e.target.value })}
                placeholder="179.67.254.135"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pacs_port">Porta PACS *</Label>
              <Input
                id="pacs_port"
                type="number"
                value={formData.pacs_port}
                onChange={(e) => setFormData({ ...formData, pacs_port: e.target.value })}
                placeholder="11112"
                min={1}
                max={65535}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pacs_ae_title">AE Title do PACS *</Label>
              <Input
                id="pacs_ae_title"
                value={formData.pacs_ae_title}
                onChange={(e) => setFormData({ ...formData, pacs_ae_title: e.target.value.toUpperCase() })}
                placeholder="PACSML"
                maxLength={16}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pacs_local_ae_title">AE Title Local</Label>
              <Input
                id="pacs_local_ae_title"
                value={formData.pacs_local_ae_title}
                onChange={(e) => setFormData({ ...formData, pacs_local_ae_title: e.target.value.toUpperCase() })}
                placeholder="LAUDS"
                maxLength={16}
              />
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              Unidades Médicas
            </h1>
            <p className="text-muted-foreground mt-2">
              Gerencie as unidades e suas configurações PACS DICOM
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData(emptyForm)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Unidade
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Criar Nova Unidade</DialogTitle>
                <DialogDescription>Preencha os dados da nova unidade médica</DialogDescription>
              </DialogHeader>
              <UnitForm onSubmit={handleCreate} isPending={createMutation.isPending} submitLabel="Criar Unidade" />
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unidades Cadastradas</CardTitle>
            <CardDescription>{units?.length || 0} unidade(s) cadastrada(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>IP PACS</TableHead>
                  <TableHead>Porta</TableHead>
                  <TableHead>AE Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!units || units.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma unidade cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{unit.slug}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(unit as any).pacs_ip || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(unit as any).pacs_port || "-"}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{(unit as any).pacs_ae_title || "-"}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={unit.isActive ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-500"}
                        >
                          {unit.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(unit)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(unit.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingUnit} onOpenChange={(o) => !o && setEditingUnit(null)}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Editar Unidade</DialogTitle>
              <DialogDescription>Atualize os dados da unidade médica</DialogDescription>
            </DialogHeader>
            {editingUnit && (
              <UnitForm onSubmit={handleUpdate} isPending={updateMutation.isPending} submitLabel="Salvar Alterações" />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
