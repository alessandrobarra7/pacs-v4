import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { UserTreeSidebar } from "./UserTreeSidebar";
import { UnitSummaryPanel } from "./UnitSummaryPanel";
import { RoleGroupPanel } from "./RoleGroupPanel";
import { UserDetailPanel } from "./UserDetailPanel";
import { type TreeNode } from "./UserTreeNode";
import { Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserExplorerLayoutProps {
  onNewUser?: (defaultUnitId?: number) => void;
  onEditUser?: (user: any) => void;
  onEditUnit?: (unitId: number) => void;
}

export function UserExplorerLayout({ onNewUser, onEditUser, onEditUnit }: UserExplorerLayoutProps) {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const { toast } = useToast();

  const { data: treeData = [], isLoading, refetch } = trpc.admin.getUnitAccessTree.useQuery();

  const toggleUserMutation = trpc.admin.toggleUserActive.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      setSelectedNode(null);
      refetch();
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeLinkMutation = trpc.admin.removeUserUnitLink.useMutation({
    onSuccess: () => {
      setSelectedNode(null);
      refetch();
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSelect = useCallback((node: TreeNode) => {
    setSelectedNode(node);
  }, []);

  const handleToggle = (userId: number) => {
    const treeUser = treeData
      .flatMap((n: any) => Object.values(n.groups as Record<string, any[]>).flat())
      .find((u: any) => u.id === userId) as any;
    toggleUserMutation.mutate({ id: userId, isActive: !(treeUser?.isActive ?? true) });
  };

  const handleDelete = (userId: number) => {
    if (!confirm("Confirma a exclusão deste usuário?")) return;
    deleteUserMutation.mutate({ id: userId });
  };

  const handleRemoveLink = (userId: number, unitId: number) => {
    if (!confirm("Confirma a remoção do vínculo deste usuário com a unidade?")) return;
    removeLinkMutation.mutate({ userId, unitId });
  };

  const renderDetailPanel = () => {
    if (!selectedNode) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">Selecione uma unidade, grupo ou usuário na árvore</p>
        </div>
      );
    }

    if (selectedNode.type === "unit") {
      return (
        <UnitSummaryPanel
          unit={selectedNode.data.unit}
          totals={selectedNode.data.totals}
          onNewUser={onNewUser}
          onEditUnit={onEditUnit}
        />
      );
    }

    if (selectedNode.type === "group") {
      return (
        <RoleGroupPanel
          groupKey={selectedNode.data.groupKey}
          users={selectedNode.data.users}
          unit={selectedNode.data.unit}
          onEditUser={onEditUser}
          onToggleUser={handleToggle}
          onDeleteUser={handleDelete}
          onRemoveLink={handleRemoveLink}
          onNewUser={onNewUser}
          onRefresh={refetch}
        />
      );
    }

    if (selectedNode.type === "user") {
      const unitNode = treeData.find((n: any) => n.unit.id === selectedNode.data.unitId);
      return (
        <UserDetailPanel
          user={selectedNode.data.user}
          unitId={selectedNode.data.unitId}
          unitName={unitNode?.unit.name ?? ""}
          onEdit={onEditUser}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onRemoveLink={handleRemoveLink}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[400px] border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Painel esquerdo — árvore */}
      <div className="w-64 flex-shrink-0">
        <UserTreeSidebar
          treeData={treeData}
          isLoading={isLoading}
          selectedId={selectedNode?.id ?? null}
          onSelect={handleSelect}
          onRefresh={refetch}
        />
      </div>

      {/* Divisor */}
      <div className="w-px bg-gray-200 flex-shrink-0" />

      {/* Painel direito — conteúdo */}
      <div className="flex-1 overflow-hidden">
        {renderDetailPanel()}
      </div>
    </div>
  );
}
