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

  const { data: units = [], isLoading, refetch } = trpc.units.list.useQuery();

  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => {
      toast.success('Unidade criada com sucesso!');
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error(`Erro ao criar unidade: ${error.message}`),
  });

  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => {
      toast.success('Unidade atualizada com sucesso!');
      setEditingUnit(null);
      refetch();
    },
    onError: (error) => toast.error(`Erro ao atualizar unidade: ${error.message}`),
  });

  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => { toast.success('Unidade excluída com sucesso!'); refetch(); },
    onError: (error) => toast.error(`Erro ao excluir unidade: ${error.message}`),
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const port = Number(fd.get('pacs_port'));
    if (!port || isNaN(port)) { toast.error('Porta PACS inválida'); return; }
    createUnit.mutate({
      name: fd.get('name') as string,
      slug: fd.get('slug') as string,
      pacs_ip: fd.get('pacs_ip') as string,
      pacs_port: port,
      pacs_ae_title: fd.get('pacs_ae_title') as string,
      pacs_local_ae_title: (fd.get('pacs_local_ae_title') as string) || 'LAUDS',
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUnit) return;
    const fd = new FormData(e.currentTarget);
    const portStr = fd.get('pacs_port') as string;
    updateUnit.mutate({
      id: editingUnit.id,
      name: fd.get('name') as string,
      slug: fd.get('slug') as string,
      pacs_ip: (fd.get('pacs_ip') as string) || undefined,
      pacs_port: portStr ? Number(portStr) : undefined,
      pacs_ae_title: (fd.get('pacs_ae_title') as string) || undefined,
      pacs_local_ae_title: (fd.get('pacs_local_ae_title') as string) || undefined,
      isActive: fd.get('isActive') === 'on',
    });
  };

  const handleDelete = (unitId: number, unitName: string) => {
    if (confirm(`Tem certeza que deseja excluir a unidade "${unitName}"?`)) {
      deleteUnit.mutate({ id: unitId });
    }
  };

  if (user?.role !== 'admin_master') {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Apenas administradores master podem acessar esta página.</CardDescription>
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
          <p className="text-muted-foreground mt-1">Cadastre e gerencie unidades (clínicas/hospitais) do sistema</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nova Unidade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Criar Nova Unidade</DialogTitle>
              <DialogDescription>Preencha os dados de conexão PACS da unidade.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cu-name">Nome da Unidade *</Label>
                  <Input id="cu-name" name="name" placeholder="Clínica São Lucas" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cu-slug">Slug *</Label>
                  <Input id="cu-slug" name="slug" placeholder="clinica-sao-lucas" required pattern="[a-z0-9-]+" />
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" /> Configuração PACS (DICOM)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cu-ip">IP do PACS *</Label>
                    <Input id="cu-ip" name="pacs_ip" placeholder="179.67.254.135" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-port">Porta PACS *</Label>
                    <Input id="cu-port" name="pacs_port" type="number" placeholder="11112" min={1} max={65535} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-ae">AE Title do PACS *</Label>
                    <Input id="cu-ae" name="pacs_ae_title" placeholder="PACSML" maxLength={16} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-local-ae">AE Title Local</Label>
                    <Input id="cu-local-ae" name="pacs_local_ae_title" placeholder="LAUDS" maxLength={16} defaultValue="LAUDS" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createUnit.isPending}>
                  {createUnit.isPending ? 'Criando...' : 'Criar Unidade'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-8"><p className="text-center text-muted-foreground">Carregando unidades...</p></CardContent></Card>
      ) : units.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma unidade cadastrada</h3>
            <p className="text-muted-foreground mb-4">Comece criando sua primeira unidade.</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Criar Primeira Unidade</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unidades Cadastradas ({units.length})</CardTitle>
            <CardDescription>Lista de todas as unidades cadastradas no sistema</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <p className="font-semibold mb-1">ℹ️ Protocolo de Recuperação: C-GET</p>
                <p>O visualizador usa <strong>C-GET</strong> (protocolo pull-based) — o portal busca as imagens diretamente do PACS na mesma conexão TCP, sem necessidade de listener externo. Basta que o PACS suporte C-GET (como o Orthanc em modo promíscuo).</p>
              </div>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>IP PACS</TableHead>
                  <TableHead>Porta</TableHead>
                  <TableHead>AE Title PACS</TableHead>
                  <TableHead>AE Title Local</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">{unit.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{unit.slug}</code></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(unit as any).pacs_ip || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(unit as any).pacs_port || '-'}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{(unit as any).pacs_ae_title || '-'}</code></TableCell>
                    <TableCell><code className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">{(unit as any).pacs_local_ae_title || 'LAUDS'}</code></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={unit.isActive ? 'border-green-200 text-green-700 bg-green-50' : 'border-gray-200 text-gray-500'}>
                        {unit.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingUnit(unit)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(unit.id, unit.name)}>
                          <Trash2 className="h-4 w-4" />
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
      <Dialog open={!!editingUnit} onOpenChange={(o) => !o && setEditingUnit(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar Unidade</DialogTitle>
            <DialogDescription>Atualize os dados de conexão PACS da unidade.</DialogDescription>
          </DialogHeader>
          {editingUnit && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Unidade *</Label>
                  <Input name="name" defaultValue={editingUnit.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Slug *</Label>
                  <Input name="slug" defaultValue={editingUnit.slug} required />
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" /> Configuração PACS (DICOM)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>IP do PACS</Label>
                    <Input name="pacs_ip" defaultValue={editingUnit.pacs_ip || ''} placeholder="179.67.254.135" />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta PACS</Label>
                    <Input name="pacs_port" type="number" defaultValue={editingUnit.pacs_port || ''} placeholder="11112" min={1} max={65535} />
                  </div>
                  <div className="space-y-2">
                    <Label>AE Title do PACS</Label>
                    <Input name="pacs_ae_title" defaultValue={editingUnit.pacs_ae_title || ''} placeholder="PACSML" maxLength={16} />
                  </div>
                  <div className="space-y-2">
                    <Label>AE Title Local</Label>
                    <Input name="pacs_local_ae_title" defaultValue={editingUnit.pacs_local_ae_title || 'LAUDS'} placeholder="LAUDS" maxLength={16} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch name="isActive" defaultChecked={editingUnit.isActive} />
                <Label>Unidade ativa</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingUnit(null)}>Cancelar</Button>
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
