import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

export default function Templates() {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  
  const { data: templates, refetch } = trpc.templates.list.useQuery();
  const createMutation = trpc.templates.create.useMutation();
  const updateMutation = trpc.templates.update.useMutation();
  const deleteMutation = trpc.templates.delete.useMutation();

  const [formData, setFormData] = useState({
    name: "",
    modality: "",
    bodyTemplate: "",
    isGlobal: false,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast.success("Template criado com sucesso!");
      setIsCreateOpen(false);
      setFormData({ name: "", modality: "", bodyTemplate: "", isGlobal: false });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar template");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    
    try {
      await updateMutation.mutateAsync({
        id: editingTemplate.id,
        ...formData,
      });
      toast.success("Template atualizado com sucesso!");
      setEditingTemplate(null);
      setFormData({ name: "", modality: "", bodyTemplate: "", isGlobal: false });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar template");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este template?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Template excluído com sucesso!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir template");
    }
  };

  const openEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      modality: template.modality || "",
      bodyTemplate: template.bodyTemplate,
      isGlobal: template.isGlobal,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-8 w-8" />
              Templates de Laudos
            </h1>
            <p className="text-muted-foreground mt-2">
              Gerencie templates de laudos por modalidade
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px]">
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Criar Novo Template</DialogTitle>
                  <DialogDescription>
                    Crie um template de laudo personalizado
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome do Template</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Raio-X de Tórax PA"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="modality">Modalidade (opcional)</Label>
                    <Input
                      id="modality"
                      value={formData.modality}
                      onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                      placeholder="CT, MR, US, CR, DX..."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bodyTemplate">Corpo do Template</Label>
                    <Textarea
                      id="bodyTemplate"
                      value={formData.bodyTemplate}
                      onChange={(e) => setFormData({ ...formData, bodyTemplate: e.target.value })}
                      placeholder="Digite o template do laudo aqui..."
                      className="min-h-[200px] font-mono text-sm"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Use variáveis como {"{patient_name}"}, {"{study_date}"}, etc.
                    </p>
                  </div>
                  {user?.role === 'admin_master' && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isGlobal"
                        checked={formData.isGlobal}
                        onCheckedChange={(checked) => 
                          setFormData({ ...formData, isGlobal: checked as boolean })
                        }
                      />
                      <Label htmlFor="isGlobal" className="cursor-pointer">
                        Template global (disponível para todas as unidades)
                      </Label>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Template"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Templates Cadastrados</CardTitle>
            <CardDescription>
              {templates?.length || 0} template(s) cadastrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templates && templates.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Modalidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        {template.modality ? (
                          <Badge variant="outline">{template.modality}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Todas</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {template.isGlobal ? (
                          <Badge variant="default" className="gap-1">
                            <Globe className="h-3 w-3" />
                            Global
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Unidade</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={template.isActive ? "default" : "secondary"}>
                          {template.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
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
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum template cadastrado</p>
                <p className="text-sm mt-2">Clique em "Novo Template" para começar</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="sm:max-w-[700px]">
            <form onSubmit={handleUpdate}>
              <DialogHeader>
                <DialogTitle>Editar Template</DialogTitle>
                <DialogDescription>
                  Atualize o template de laudo
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Nome do Template</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-modality">Modalidade</Label>
                  <Input
                    id="edit-modality"
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-bodyTemplate">Corpo do Template</Label>
                  <Textarea
                    id="edit-bodyTemplate"
                    value={formData.bodyTemplate}
                    onChange={(e) => setFormData({ ...formData, bodyTemplate: e.target.value })}
                    className="min-h-[200px] font-mono text-sm"
                    required
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
