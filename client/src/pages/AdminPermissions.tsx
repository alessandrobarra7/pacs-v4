import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AdminPermissions() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'inconsistencies' | 'cleanup'>('inconsistencies');

  // Queries
  const inconsistenciesQuery = trpc.admin.getPermissionInconsistencies.useQuery(undefined, {
    enabled: user?.role === 'admin_master' || user?.role === 'unit_admin',
  });

  // Mutations
  const updateGroupKeyMutation = trpc.admin.updateUserGroupKey.useMutation();
  const cleanupMutation = trpc.admin.cleanupOrphanedFinancialRecords.useMutation();

  if (!user) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Carregando...</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  if (user.role !== 'admin_master' && user.role !== 'unit_admin') {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Acesso negado. Apenas admin_master e unit_admin podem acessar esta página.</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const handleUpdateGroupKey = async (userId: number, unitId: number, newGroupKey: string) => {
    try {
      await updateGroupKeyMutation.mutateAsync({
        userId,
        unitId,
        groupKey: newGroupKey as any,
      });
      await inconsistenciesQuery.refetch();
    } catch (error) {
      console.error('Erro ao atualizar group_key:', error);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Tem certeza que deseja deletar os registros órfãos?')) return;
    try {
      await cleanupMutation.mutateAsync();
      await inconsistenciesQuery.refetch();
    } catch (error) {
      console.error('Erro ao limpar registros:', error);
    }
  };

  const data = inconsistenciesQuery.data;
  const groupKeyMismatches = data?.groupKeyMismatches ?? [];
  const orphanedRecords = data?.orphanedFinancialRecords ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Permissões</h1>
          <p className="text-muted-foreground mt-2">Corrija inconsistências de permissões e limpe dados órfãos</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setSelectedTab('inconsistencies')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'inconsistencies'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Inconsistências de group_key
            {groupKeyMismatches.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full">
                {groupKeyMismatches.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSelectedTab('cleanup')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'cleanup'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Limpeza de Dados
            {orphanedRecords.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full">
                {orphanedRecords.length}
              </span>
            )}
          </button>
        </div>

        {/* Inconsistencies Tab */}
        {selectedTab === 'inconsistencies' && (
          <div className="space-y-4">
            {inconsistenciesQuery.isLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : groupKeyMismatches.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhuma inconsistência encontrada!</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Usuários com group_key incorreto</CardTitle>
                  <CardDescription>
                    {groupKeyMismatches.length} usuário(s) com group_key não correspondente ao role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead>group_key Atual</TableHead>
                          <TableHead>group_key Esperado</TableHead>
                          <TableHead>Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupKeyMismatches.map((mismatch) => (
                          <TableRow key={`${mismatch.user_id}-${mismatch.unit_id}`}>
                            <TableCell className="font-medium">
                              {mismatch.name}
                              <br />
                              <span className="text-xs text-muted-foreground">@{mismatch.username}</span>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {mismatch.role}
                              </span>
                            </TableCell>
                            <TableCell>{mismatch.unit_name}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {mismatch.current_group_key}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {mismatch.expected_group_key}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleUpdateGroupKey(
                                    mismatch.user_id,
                                    mismatch.unit_id,
                                    mismatch.expected_group_key || 'outros'
                                  )
                                }
                                disabled={updateGroupKeyMutation.isPending}
                              >
                                {updateGroupKeyMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Corrigir'
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Cleanup Tab */}
        {selectedTab === 'cleanup' && (
          <div className="space-y-4">
            {inconsistenciesQuery.isLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : orphanedRecords.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhum registro órfão encontrado!</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {orphanedRecords.length} registro(s) órfão(s) encontrado(s) em financial_responsible_units.
                    Estes registros apontam para unidades que foram deletadas.
                  </AlertDescription>
                </Alert>
                <Card>
                  <CardHeader>
                    <CardTitle>Registros Órfãos</CardTitle>
                    <CardDescription>
                      Registros em financial_responsible_units que apontam para unidades inexistentes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>unit_id (inexistente)</TableHead>
                            <TableHead>financial_responsible_id</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orphanedRecords.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>{record.id}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  {record.unit_id}
                                </span>
                              </TableCell>
                              <TableCell>{record.financial_responsible_id}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="pt-4 border-t">
                      <Button
                        variant="destructive"
                        onClick={handleCleanup}
                        disabled={cleanupMutation.isPending}
                        className="gap-2"
                      >
                        {cleanupMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Deletar Registros Órfãos
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
