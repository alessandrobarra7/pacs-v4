import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import UnitUserRow, { type UnitUser } from "./UnitUserRow";

interface UnitUsersGroupProps {
  label: string;
  users: UnitUser[];
  unitId: number;
  currentUserId: number;
  currentUserRole: string;
  emptyMessage?: string;
  onEdit: (user: UnitUser) => void;
  onToggleActive: (userId: number, isActive: boolean) => void;
  onDelete: (userId: number) => void;
  onRemoveLink: (userId: number, unitId: number) => void;
}

export default function UnitUsersGroup({
  label,
  users,
  unitId,
  currentUserId,
  currentUserRole,
  emptyMessage,
  onEdit,
  onToggleActive,
  onDelete,
  onRemoveLink,
}: UnitUsersGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <span className="ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {users.length}
        </span>
      </button>

      {open && (
        <div className="ml-4 border-l border-border/50 pl-2 mt-0.5">
          {users.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-1.5 px-3">
              {emptyMessage ?? "Nenhum usuário neste grupo"}
            </p>
          ) : (
            users.map(user => (
              <UnitUserRow
                key={user.id}
                user={user}
                unitId={unitId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onEdit={onEdit}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                onRemoveLink={onRemoveLink}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
