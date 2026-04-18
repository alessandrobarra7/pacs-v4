import { useState, useMemo } from "react";
import { Search, RefreshCw } from "lucide-react";
import { UserTreeNode, type TreeNode } from "./UserTreeNode";

const GROUP_LABELS: Record<string, string> = {
  responsaveisFinanceiros: "Resp. Financeiro",
  medicos: "Médicos",
  operadores: "Operadores",
  visualizadores: "Visualizadores",
  administradoresUnidade: "Adm. de Unidade",
  adminsMaster: "Admin Master",
  outros: "Outros",
};

function buildTree(nodes: any[]): TreeNode[] {
  return nodes.map(node => {
    const unitId = node.unit.id;
    const groupChildren: TreeNode[] = Object.entries(node.groups as Record<string, any[]>).map(([key, users]) => {
      const userChildren: TreeNode[] = (users as any[]).map(u => {
        const isExpired = u.expiration_date && new Date(u.expiration_date) < new Date();
        const isActive = u.isActive && !isExpired;
        return {
          id: `user:${u.id}:${unitId}`,
          type: "user" as const,
          label: u.name || u.username,
          sublabel: u.username,
          badge: isExpired ? "Expirado" : isActive ? "Ativo" : "Inativo",
          badgeColor: isExpired
            ? "bg-red-50 text-red-500"
            : isActive
              ? "bg-green-50 text-green-600"
              : "bg-gray-100 text-gray-400",
          data: { user: u, unitId },
        };
      });
      return {
        id: `group:${key}:${unitId}`,
        type: "group" as const,
        label: GROUP_LABELS[key] ?? key,
        count: users.length,
        children: userChildren,
        data: { groupKey: key, users, unitId, unit: node.unit },
      };
    });

    return {
      id: `unit:${unitId}`,
      type: "unit" as const,
      label: node.unit.name,
      isActive: node.unit.isActive,
      count: node.totals.totalUsers,
      children: groupChildren,
      data: { unit: node.unit, totals: node.totals, groups: node.groups },
    };
  });
}

interface UserTreeSidebarProps {
  treeData: any[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  onRefresh: () => void;
}

export function UserTreeSidebar({ treeData, isLoading, selectedId, onSelect, onRefresh }: UserTreeSidebarProps) {
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(treeData), [treeData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    return tree.filter(unitNode => {
      const unitMatch = unitNode.label.toLowerCase().includes(q);
      const userMatch = unitNode.children?.some(groupNode =>
        groupNode.children?.some(userNode =>
          userNode.label.toLowerCase().includes(q) ||
          (userNode.data?.user?.username ?? "").toLowerCase().includes(q)
        )
      );
      return unitMatch || userMatch;
    });
  }, [tree, search]);

  return (
    <div className="flex flex-col h-full border-r border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Árvore */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-xs">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-xs">Nenhuma unidade encontrada</div>
        ) : (
          filtered.map(node => (
            <UserTreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
              defaultExpanded={filtered.length === 1}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-400">
          {treeData.length} unidade{treeData.length !== 1 ? "s" : ""} ·{" "}
          {treeData.reduce((acc, n) => acc + n.totals.totalUsers, 0)} usuários
        </p>
      </div>
    </div>
  );
}
