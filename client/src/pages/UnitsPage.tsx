import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Building2, Server } from 'lucide-react';

export default function UnitsPage() {
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);

  // Query units
  const { data: units = [], isLoading, refetch } = trpc.units.list.useQuery();

  // Mutations
  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => {
      toast.success('Unidade criada com sucesso!');
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao criar unidade: ${error.message}`);
    },
  });

  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => {
      toast.success('Unidade atualizada com sucesso!');
      setEditingUnit(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar unidade: ${error.message}`);
    },
  });

  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => {
      toast.success('Unidade excluída com sucesso!');
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir unidade: ${error.message}`);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createUnit.mutate({
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      orthanc_base_url: formData.get('orthanc_base_url') as string || undefined,
      orthanc_public_url: formData.get('orthanc_public_url') as string || undefined,
      orthanc_basic_user: formData.get('orthanc_basic_user') as string || undefined,
      orthanc_basic_pass: formData.get('orthanc_basic_pass') as string || undefined,
      logoUrl: formData.get('logoUrl') as string || undefined,
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUnit) return;
    
    const formData = new FormData(e.currentTarget);
    
    updateUnit.mutate({
      id: editingUnit.id,
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      orthanc_base_url: formData.get('orthanc_base_url') as string || undefined,
      orthanc_public_url: formData.get('orthanc_public_url') as string || undefined,
      orthanc_basic_user: formData.get('orthanc_basic_user') as string || undefined,
      orthanc_basic_pass: formData.get('orthanc_basic_pass') as string || undefined,
      logoUrl: formData.get('logoUrl') as string || undefined,
      isActive: formData.get('isActive') === 'on',
    });
  };

  const handleDelete = (unitId: number, unitName: string) => {
    if (confirm(`Tem certeza que deseja excluir a unidade "${unitName}"?`)) {
      deleteUnit.mutate({ id: unitId });
    }
  };

  // Only admin_master can access this page
  if (user?.role !== 'admin_master') {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Apenas administradores master podem acessar esta página.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Unidades</h1>
          <p className="text-muted-foreground mt-1">
            Cadastre e gerencie unidades (clínicas/hospitais) do sistema
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nova Unidade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Nova Unidade</DialogTitle>
              <DialogDescription>
                Preencha os dados da nova unidade. Os campos de configuração PACS/Orthanc podem ser preenchidos posteriormente.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Unidade *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ex: Clínica São Lucas"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (identificador único) *</Label>
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="Ex: clinica-sao-lucas"
                    required
                    pattern="[a-z0-9-]+"
                    title="Apenas letras minúsculas, números e hífens"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoUrl">URL do Logo</Label>
                <Input
                  id="logoUrl"
                  name="logoUrl"
                  type="url"
                  placeholder="https://exemplo.com/logo.png"
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Configuração Orthanc
                </h3>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="orthanc_base_url">URL Interna do Orthanc <span className="text-red-500">*</span></Label>
                    <Input
                      id="orthanc_base_url"
                      name="orthanc_base_url"
                      type="url"
                      placeholder="http://172.16.3.241:8042"
                    />
                    <p className="text-xs text-muted-foreground">
                      IP interno da rede local. Ex: http://172.16.3.241:8042
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orthanc_public_url">URL Pública do Orthanc (Mikrotik NAT)</Label>
                    <Input
                      id="orthanc_public_url"
                      name="orthanc_public_url"
                      type="url"
                      placeholder="http://45.189.160.17:8042"
                    />
                    <p className="text-xs text-muted-foreground">
                      IP público via NAT do Mikrotik. Usado pelo frontend para abrir o viewer. Ex: http://45.189.160.17:8042
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createUnit.isPending}>
                  {createUnit.isPending ? 'Criando...' : 'Criar Unidade'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Carregando unidades...</p>
          </CardContent>
        </Card>
      ) : units.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma unidade cadastrada</h3>
            <p className="text-muted-foreground mb-4">
              Comece criando sua primeira unidade no sistema.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Unidade
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unidades Cadastradas ({units.length})</CardTitle>
            <CardDescription>
              Lista de todas as unidades cadastradas no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Orthanc</TableHead>
                  <TableHead>PACS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {unit.logoUrl && (
                          <img
                            src={unit.logoUrl}
                            alt={unit.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        )}
                        {unit.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {unit.slug}
                      </code>
                    </TableCell>
                    <TableCell>
                      {unit.orthanc_base_url ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                            {unit.orthanc_base_url.replace('http://', '')}
                          </Badge>
                          {(unit as any).orthanc_public_url && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                              🌐 {(unit as any).orthanc_public_url.replace('http://', '')}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-700">
                          Não configurado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {unit.pacs_ip ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {unit.pacs_ip}:{unit.pacs_port}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-700">
                          Não configurado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {unit.isActive ? (
                        <Badge className="bg-green-500">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingUnit(unit)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(unit.id, unit.name)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingUnit} onOpenChange={(open) => !open && setEditingUnit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Unidade: {editingUnit?.name}</DialogTitle>
            <DialogDescription>
              Atualize as informações da unidade
            </DialogDescription>
          </DialogHeader>
          
          {editingUnit && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome da Unidade *</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={editingUnit.name}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-slug">Slug *</Label>
                  <Input
                    id="edit-slug"
                    name="slug"
                    defaultValue={editingUnit.slug}
                    required
                    pattern="[a-z0-9-]+"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-logoUrl">URL do Logo</Label>
                <Input
                  id="edit-logoUrl"
                  name="logoUrl"
                  type="url"
                  defaultValue={editingUnit.logoUrl || ''}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  name="isActive"
                  defaultChecked={editingUnit.isActive}
                />
                <Label htmlFor="edit-isActive">Unidade Ativa</Label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Configuração Orthanc
                </h3>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-orthanc_base_url">URL Interna do Orthanc</Label>
                    <Input
                      id="edit-orthanc_base_url"
                      name="orthanc_base_url"
                      type="url"
                      defaultValue={editingUnit.orthanc_base_url || ''}
                      placeholder="http://172.16.3.241:8042"
                    />
                    <p className="text-xs text-muted-foreground">
                      IP interno da rede local. Ex: http://172.16.3.241:8042
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-orthanc_public_url">URL Pública do Orthanc (Mikrotik NAT)</Label>
                    <Input
                      id="edit-orthanc_public_url"
                      name="orthanc_public_url"
                      type="url"
                      defaultValue={editingUnit.orthanc_public_url || ''}
                      placeholder="http://45.189.160.17:8042"
                    />
                    <p className="text-xs text-muted-foreground">
                      IP público via NAT do Mikrotik. Usado pelo frontend para abrir o viewer. Ex: http://45.189.160.17:8042
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUnit(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateUnit.isPending}>
                  {updateUnit.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
