import { useState } from "react";
import { ChevronRight, ChevronDown, Building2, Users, User, Stethoscope, Eye, Settings, Shield, DollarSign } from "lucide-react";

export type TreeNodeType = "unit" | "group" | "user";

export interface TreeNode {
  id: string;
  type: TreeNodeType;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  count?: number;
  isActive?: boolean;
  children?: TreeNode[];
  data?: any;
}

interface UserTreeNodeProps {
  node: TreeNode;
  depth?: number;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  defaultExpanded?: boolean;
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  responsaveisFinanceiros: <DollarSign className="h-3.5 w-3.5 text-amber-500" />,
  medicos: <Stethoscope className="h-3.5 w-3.5 text-blue-500" />,
  operadores: <Settings className="h-3.5 w-3.5 text-gray-500" />,
  visualizadores: <Eye className="h-3.5 w-3.5 text-purple-500" />,
  administradoresUnidade: <Shield className="h-3.5 w-3.5 text-orange-500" />,
  adminsMaster: <Shield className="h-3.5 w-3.5 text-red-500" />,
  outros: <Users className="h-3.5 w-3.5 text-gray-400" />,
};

function getNodeIcon(node: TreeNode) {
  if (node.type === "unit") return <Building2 className="h-4 w-4 text-blue-600 flex-shrink-0" />;
  if (node.type === "group") return GROUP_ICONS[node.id.split(":")[1]] ?? <Users className="h-3.5 w-3.5 text-gray-500" />;
  return <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />;
}

export function UserTreeNode({ node, depth = 0, selectedId, onSelect, defaultExpanded = false }: UserTreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const indent = depth * 14;

  const handleClick = () => {
    if (hasChildren) setExpanded(e => !e);
    onSelect(node);
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded transition-colors text-sm
          ${isSelected
            ? "bg-blue-600 text-white"
            : "text-gray-700 hover:bg-gray-100"
          }`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {/* Chevron */}
        <span className="w-4 flex-shrink-0">
          {hasChildren ? (
            expanded
              ? <ChevronDown className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-gray-400"}`} />
              : <ChevronRight className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-gray-400"}`} />
          ) : null}
        </span>

        {/* Ícone */}
        <span className={isSelected ? "text-white" : ""}>
          {getNodeIcon(node)}
        </span>

        {/* Label */}
        <span className={`flex-1 truncate font-${node.type === "unit" ? "medium" : "normal"} ${isSelected ? "text-white" : ""}`}>
          {node.label}
        </span>

        {/* Contador */}
        {node.type !== "user" && node.count !== undefined && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0
            ${isSelected
              ? "bg-blue-500 text-white"
              : node.count === 0
                ? "bg-gray-100 text-gray-400"
                : "bg-blue-50 text-blue-600"
            }`}>
            {node.count}
          </span>
        )}

        {/* Badge status */}
        {node.type === "user" && node.badge && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0
            ${isSelected ? "bg-blue-500 text-white" : node.badgeColor ?? "bg-gray-100 text-gray-500"}`}>
            {node.badge}
          </span>
        )}
      </button>

      {/* Filhos */}
      {expanded && hasChildren && (
        <div>
          {node.children!.map(child => (
            <UserTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
