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

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    orthanc_base_url: "",
    orthanc_basic_user: "",
    orthanc_basic_pass: "",
    pacs_ip: "",
    pacs_port: "",
    pacs_ae_title: "",
    pacs_local_ae_title: "",
    logoUrl: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        ...formData,
        pacs_port: formData.pacs_port ? Number(formData.pacs_port) : undefined,
      });
      toast.success("Unidade criada com sucesso!");
      setIsCreateOpen(false);
      setFormData({ name: "", slug: "", orthanc_base_url: "", orthanc_basic_user: "", orthanc_basic_pass: "", pacs_ip: "", pacs_port: "", pacs_ae_title: "", pacs_local_ae_title: "", logoUrl: "" });
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
        ...formData,
        pacs_port: formData.pacs_port ? Number(formData.pacs_port) : undefined,
      });
      toast.success("Unidade atualizada com sucesso!");
      setEditingUnit(null);
      setFormData({ name: "", slug: "", orthanc_base_url: "", orthanc_basic_user: "", orthanc_basic_pass: "", pacs_ip: "", pacs_port: "", pacs_ae_title: "", pacs_local_ae_title: "", logoUrl: "" });
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
      name: unit.name,
      slug: unit.slug,
      orthanc_base_url: unit.orthanc_base_url || "",
      orthanc_basic_user: unit.orthanc_basic_user || "",
      orthanc_basic_pass: "",
      pacs_ip: unit.pacs_ip || "",
      pacs_port: unit.pacs_port?.toString() || "",
      pacs_ae_title: unit.pacs_ae_title || "",
      pacs_local_ae_title: unit.pacs_local_ae_title || "",
      logoUrl: unit.logoUrl || "",
    });
  };

  if (user?.role !== 'admin_master') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
              Gerencie as unidades médicas e suas configurações Orthanc
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Unidade
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Criar Nova Unidade</DialogTitle>
                  <DialogDescription>
                    Preencha os dados da nova unidade médica
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome da Unidade</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="slug">Slug (identificador único)</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      placeholder="ex: unidade-central"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="orthanc_base_url">Orthanc Base URL</Label>
                    <Input
                      id="orthanc_base_url"
                      value={formData.orthanc_base_url}
                      onChange={(e) => setFormData({ ...formData, orthanc_base_url: e.target.value })}
                      placeholder="http://192.168.3.250:8042"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="orthanc_basic_user">Orthanc User (opcional)</Label>
                    <Input
                      id="orthanc_basic_user"
                      value={formData.orthanc_basic_user}
                      onChange={(e) => setFormData({ ...formData, orthanc_basic_user: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="orthanc_basic_pass">Orthanc Password (opcional)</Label>
                    <Input
                      id="orthanc_basic_pass"
                      type="password"
                      value={formData.orthanc_basic_pass}
                      onChange={(e) => setFormData({ ...formData, orthanc_basic_pass: e.target.value })}
                    />
                  </div>
                  
                  <div className="border-t pt-4 mt-2">
                    <h4 className="font-semibold mb-3">Configuração PACS (DICOM)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="pacs_ip">IP do PACS</Label>
                        <Input
                          id="pacs_ip"
                          value={formData.pacs_ip}
                          onChange={(e) => setFormData({ ...formData, pacs_ip: e.target.value })}
                          placeholder="179.67.254.135"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="pacs_port">Porta PACS</Label>
                        <Input
                          id="pacs_port"
                          type="number"
                          value={formData.pacs_port}
                          onChange={(e) => setFormData({ ...formData, pacs_port: e.target.value })}
                          placeholder="11112"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="pacs_ae_title">AE Title do PACS</Label>
                        <Input
                          id="pacs_ae_title"
                          value={formData.pacs_ae_title}
                          onChange={(e) => setFormData({ ...formData, pacs_ae_title: e.target.value })}
                          placeholder="PACSML"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="pacs_local_ae_title">AE Title Local</Label>
                        <Input
                          id="pacs_local_ae_title"
                          value={formData.pacs_local_ae_title}
                          onChange={(e) => setFormData({ ...formData, pacs_local_ae_title: e.target.value })}
                          placeholder="PACSMANUS"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="logoUrl">URL do Logo</Label>
                    <Input
                      id="logoUrl"
                      type="url"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                      placeholder="https://exemplo.com/logo.png"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Unidade"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unidades Cadastradas</CardTitle>
            <CardDescription>
              {units?.length || 0} unidade(s) cadastrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {units && units.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Orthanc</TableHead>
                    <TableHead>PACS (DICOM)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">
                        {unit.logoUrl && (
                          <img src={unit.logoUrl} alt={unit.name} className="inline-block w-6 h-6 mr-2 rounded" />
                        )}
                        {unit.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{unit.slug}</TableCell>
                      <TableCell className="text-sm">
                        {unit.orthanc_base_url ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">Configurado</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700">Não configurado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {unit.pacs_ip ? (
                          <div>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                              {unit.pacs_ip}:{unit.pacs_port}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">
                              AE: {unit.pacs_ae_title}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700">Não configurado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={unit.isActive ? "default" : "secondary"}>
                          {unit.isActive ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(unit)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(unit.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma unidade cadastrada</p>
                <p className="text-sm mt-2">Clique em "Nova Unidade" para começar</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingUnit} onOpenChange={(open) => !open && setEditingUnit(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <form onSubmit={handleUpdate}>
              <DialogHeader>
                <DialogTitle>Editar Unidade</DialogTitle>
                <DialogDescription>
                  Atualize os dados da unidade médica
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Nome da Unidade</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-slug">Slug</Label>
                  <Input
                    id="edit-slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-orthanc_base_url">Orthanc Base URL</Label>
                  <Input
                    id="edit-orthanc_base_url"
                    value={formData.orthanc_base_url}
                    onChange={(e) => setFormData({ ...formData, orthanc_base_url: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-orthanc_basic_user">Orthanc User</Label>
                  <Input
                    id="edit-orthanc_basic_user"
                    value={formData.orthanc_basic_user}
                    onChange={(e) => setFormData({ ...formData, orthanc_basic_user: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-orthanc_basic_pass">Orthanc Password (deixe em branco para manter)</Label>
                  <Input
                    id="edit-orthanc_basic_pass"
                    type="password"
                    value={formData.orthanc_basic_pass}
                    onChange={(e) => setFormData({ ...formData, orthanc_basic_pass: e.target.value })}
                  />
                </div>
                
                <div className="border-t pt-4 mt-2">
                  <h4 className="font-semibold mb-3">Configuração PACS (DICOM)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-pacs_ip">IP do PACS</Label>
                      <Input
                        id="edit-pacs_ip"
                        value={formData.pacs_ip}
                        onChange={(e) => setFormData({ ...formData, pacs_ip: e.target.value })}
                        placeholder="179.67.254.135"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-pacs_port">Porta PACS</Label>
                      <Input
                        id="edit-pacs_port"
                        type="number"
                        value={formData.pacs_port}
                        onChange={(e) => setFormData({ ...formData, pacs_port: e.target.value })}
                        placeholder="11112"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-pacs_ae_title">AE Title do PACS</Label>
                      <Input
                        id="edit-pacs_ae_title"
                        value={formData.pacs_ae_title}
                        onChange={(e) => setFormData({ ...formData, pacs_ae_title: e.target.value })}
                        placeholder="PACSML"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-pacs_local_ae_title">AE Title Local</Label>
                      <Input
                        id="edit-pacs_local_ae_title"
                        value={formData.pacs_local_ae_title}
                        onChange={(e) => setFormData({ ...formData, pacs_local_ae_title: e.target.value })}
                        placeholder="PACSMANUS"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="edit-logoUrl">URL do Logo</Label>
                  <Input
                    id="edit-logoUrl"
                    type="url"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://exemplo.com/logo.png"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
