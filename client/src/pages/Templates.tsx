import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit2, Trash2, Eye, Globe, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Modalidades DICOM comuns
const MODALITIES = [
  { value: "CR", label: "CR - Radiografia Computadorizada" },
  { value: "CT", label: "CT - Tomografia Computadorizada" },
  { value: "MR", label: "MR - Ressonância Magnética" },
  { value: "US", label: "US - Ultrassom" },
  { value: "DX", label: "DX - Radiografia Digital" },
  { value: "MG", label: "MG - Mamografia" },
  { value: "NM", label: "NM - Medicina Nuclear" },
  { value: "PT", label: "PT - PET" },
  { value: "XA", label: "XA - Angiografia" },
  { value: "RF", label: "RF - Fluoroscopia" },
  { value: "OTHER", label: "Outro / Geral" },
];

// Variáveis disponíveis para templates
const TEMPLATE_VARIABLES = [
  { var: "{{patientName}}", desc: "Nome do paciente" },
  { var: "{{patientId}}", desc: "ID do paciente" },
  { var: "{{studyDate}}", desc: "Data do estudo" },
  { var: "{{studyTime}}", desc: "Hora do estudo" },
  { var: "{{modality}}", desc: "Modalidade" },
  { var: "{{studyDescription}}", desc: "Descrição do estudo" },
  { var: "{{accessionNumber}}", desc: "Número de acesso" },
  { var: "{{referringPhysician}}", desc: "Médico solicitante" },
  { var: "{{radiologist}}", desc: "Radiologista" },
  { var: "{{currentDate}}", desc: "Data atual" },
  { var: "{{currentTime}}", desc: "Hora atual" },
];

export default function TemplatesPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    modality: "",
    bodyTemplate: "",
    isGlobal: false,
  });

  // Queries
  const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();

  // Mutations
  const createTemplate = trpc.templates.create.useMutation({
    onSuccess: () => {
      toast({ title: "Template criado com sucesso!" });
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast({ title: "Erro ao criar template", description: error.message, variant: "destructive" });
    },
  });

  const updateTemplate = trpc.templates.update.useMutation({
    onSuccess: () => {
      toast({ title: "Template atualizado com sucesso!" });
      setIsEditOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar template", description: error.message, variant: "destructive" });
    },
  });

  const deleteTemplate = trpc.templates.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Template excluído com sucesso!" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir template", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      modality: "",
      bodyTemplate: "",
      isGlobal: false,
    });
    setSelectedTemplate(null);
  };

  const handleCreate = () => {
    createTemplate.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedTemplate) return;
    updateTemplate.mutate({
      id: selectedTemplate.id,
      ...formData,
    });
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      modality: template.modality || "",
      bodyTemplate: template.bodyTemplate,
      isGlobal: template.isGlobal,
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este template?")) {
      deleteTemplate.mutate({ id });
    }
  };

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setIsPreviewOpen(true);
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      bodyTemplate: prev.bodyTemplate + variable,
    }));
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates de Laudos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie templates reutilizáveis para laudos radiológicos
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Template</DialogTitle>
              <DialogDescription>
                Crie um template reutilizável com variáveis dinâmicas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Template</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Laudo de RX Tórax"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modality">Modalidade</Label>
                  <Select
                    value={formData.modality}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, modality: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODALITIES.map((mod) => (
                        <SelectItem key={mod.value} value={mod.value}>
                          {mod.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isGlobal"
                  checked={formData.isGlobal}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isGlobal: checked }))}
                />
                <Label htmlFor="isGlobal" className="cursor-pointer">
                  Template Global (disponível para todas as unidades)
                </Label>
              </div>

              <div className="space-y-2">
                <Label>Variáveis Disponíveis</Label>
                <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-md">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Button
                      key={v.var}
                      variant="outline"
                      size="sm"
                      onClick={() => insertVariable(v.var)}
                      title={v.desc}
                    >
                      {v.var}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Clique em uma variável para inseri-la no template
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bodyTemplate">Corpo do Template</Label>
                <Textarea
                  id="bodyTemplate"
                  value={formData.bodyTemplate}
                  onChange={(e) => setFormData(prev => ({ ...prev, bodyTemplate: e.target.value }))}
                  placeholder="Digite o texto do template usando as variáveis acima..."
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={!formData.name || !formData.bodyTemplate}>
                  Criar Template
                </Button>
              </div>
            </div>
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
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : templates && templates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
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
                        <span className="text-muted-foreground text-sm">Não especificado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.isGlobal ? (
                        <Badge variant="default" className="bg-purple-100 text-purple-700">
                          <Globe className="mr-1 h-3 w-3" />
                          Global
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          <Building2 className="mr-1 h-3 w-3" />
                          Unidade
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(template.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(template)}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template)}
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Nenhum template cadastrado</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Template
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Template</DialogTitle>
            <DialogDescription>
              Atualize as informações do template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Template</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-modality">Modalidade</Label>
                <Select
                  value={formData.modality}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, modality: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODALITIES.map((mod) => (
                      <SelectItem key={mod.value} value={mod.value}>
                        {mod.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isGlobal"
                checked={formData.isGlobal}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isGlobal: checked }))}
              />
              <Label htmlFor="edit-isGlobal" className="cursor-pointer">
                Template Global (disponível para todas as unidades)
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Variáveis Disponíveis</Label>
              <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-md">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Button
                    key={v.var}
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(v.var)}
                    title={v.desc}
                  >
                    {v.var}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-bodyTemplate">Corpo do Template</Label>
              <Textarea
                id="edit-bodyTemplate"
                value={formData.bodyTemplate}
                onChange={(e) => setFormData(prev => ({ ...prev, bodyTemplate: e.target.value }))}
                rows={15}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate}>
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview do Template</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name} - {selectedTemplate?.modality || "Sem modalidade"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-muted rounded-md">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {selectedTemplate?.bodyTemplate}
              </pre>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <p className="font-semibold mb-2">Variáveis que serão substituídas:</p>
              <ul className="list-disc list-inside space-y-1">
                {TEMPLATE_VARIABLES.filter(v => 
                  selectedTemplate?.bodyTemplate?.includes(v.var)
                ).map(v => (
                  <li key={v.var}>
                    <code className="bg-background px-1 rounded">{v.var}</code> → {v.desc}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
