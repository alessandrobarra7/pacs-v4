import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Star, FileText, MessageSquare, Settings } from "lucide-react";

interface ReportSidebarProps {
  onInsertText: (text: string) => void;
  disabled?: boolean;
}

const GROUP_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  green: "bg-green-100 text-green-800 border-green-200",
  red: "bg-red-100 text-red-800 border-red-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
};

export default function ReportSidebar({
  onInsertText,
  disabled = false,
}: ReportSidebarProps) {
  const [newPhraseContent, setNewPhraseContent] = useState("");
  const [newPhraseGroupId, setNewPhraseGroupId] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("blue");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewPhrase, setShowNewPhrase] = useState(false);

  const { data: groups = [], refetch: refetchGroups } = trpc.phrases.listGroups.useQuery();
  const { data: phrases = [], refetch: refetchPhrases } = trpc.phrases.list.useQuery();

  const createGroup = trpc.phrases.createGroup.useMutation({
    onSuccess: () => {
      refetchGroups();
      setNewGroupName("");
      setShowNewGroup(false);
      toast.success("Grupo criado");
    },
  });

  const createPhrase = trpc.phrases.create.useMutation({
    onSuccess: () => {
      refetchPhrases();
      setNewPhraseContent("");
      setShowNewPhrase(false);
      toast.success("Frase salva");
    },
  });

  const deletePhrase = trpc.phrases.delete.useMutation({
    onSuccess: () => {
      refetchPhrases();
      toast.success("Frase removida");
    },
  });

  const toggleFavorite = trpc.phrases.toggleFavorite.useMutation({
    onSuccess: () => refetchPhrases(),
  });

  const phrasesByGroup = groups.map((g) => ({
    ...g,
    phrases: phrases.filter((p) => p.group_id === g.id),
  }));

  const favorites = phrases.filter((p) => p.is_favorite);

  return (
    <div className="h-full flex flex-col bg-gray-50 border-l border-gray-200">
      <div className="p-3 border-b border-gray-200 bg-white">
        <h3 className="font-semibold text-sm text-gray-700">Painel do Laudo</h3>
      </div>

      <Tabs defaultValue="templates" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-2 mt-2 grid grid-cols-3 h-8">
          <TabsTrigger value="templates" className="text-xs gap-1">
            <FileText className="w-3 h-3" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="phrases" className="text-xs gap-1">
            <MessageSquare className="w-3 h-3" />
            Frases
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs gap-1">
            <Settings className="w-3 h-3" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* ABA FRASES - placeholder para templates (gerenciados no header) */}
        <TabsContent value="templates" className="flex-1 overflow-hidden m-0 p-2">
          <ScrollArea className="h-full">
            <p className="text-xs text-gray-400 text-center py-4">
              Selecione o template no topo da página.
            </p>
          </ScrollArea>
        </TabsContent>

        {/* ABA FRASES */}
        <TabsContent value="phrases" className="flex-1 overflow-hidden m-0 p-2">
          <ScrollArea className="h-full">
            <div className="space-y-3">
              {/* Favoritos */}
              {favorites.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-semibold text-gray-600">Favoritos</span>
                  </div>
                  <div className="space-y-1">
                    {favorites.map((p) => (
                      <PhraseItem
                        key={p.id}
                        phrase={p}
                        onInsert={() => onInsertText(p.content)}
                        onDelete={() => deletePhrase.mutate({ phraseId: p.id })}
                        onToggleFavorite={() =>
                          toggleFavorite.mutate({ phraseId: p.id, isFavorite: !p.is_favorite })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Grupos */}
              {phrasesByGroup.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center gap-1 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 ${GROUP_COLORS[g.color ?? "gray"] ?? GROUP_COLORS.gray}`}
                    >
                      {g.name}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {g.phrases.length === 0 && (
                      <p className="text-xs text-gray-400 pl-2">Nenhuma frase</p>
                    )}
                    {g.phrases.map((p) => (
                      <PhraseItem
                        key={p.id}
                        phrase={p}
                        onInsert={() => onInsertText(p.content)}
                        onDelete={() => deletePhrase.mutate({ phraseId: p.id })}
                        onToggleFavorite={() =>
                          toggleFavorite.mutate({ phraseId: p.id, isFavorite: !p.is_favorite })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Botões de adicionar */}
              <div className="pt-2 space-y-2 border-t border-gray-200">
                {showNewGroup ? (
                  <div className="space-y-1">
                    <Input
                      placeholder="Nome do grupo"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Select value={newGroupColor} onValueChange={setNewGroupColor}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(GROUP_COLORS).map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 text-xs flex-1"
                        onClick={() =>
                          createGroup.mutate({ name: newGroupName, color: newGroupColor })
                        }
                        disabled={!newGroupName.trim()}
                      >
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => setShowNewGroup(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => setShowNewGroup(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Novo Grupo
                  </Button>
                )}

                {showNewPhrase ? (
                  <div className="space-y-1">
                    <Select value={newPhraseGroupId} onValueChange={setNewPhraseGroupId}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Selecione o grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={String(g.id)} className="text-xs">
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Texto da frase..."
                      value={newPhraseContent}
                      onChange={(e) => setNewPhraseContent(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 text-xs flex-1"
                        onClick={() =>
                          createPhrase.mutate({
                            groupId: Number(newPhraseGroupId),
                            content: newPhraseContent,
                          })
                        }
                        disabled={!newPhraseContent.trim() || !newPhraseGroupId}
                      >
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => setShowNewPhrase(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => setShowNewPhrase(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Nova Frase
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ABA CONFIG */}
        <TabsContent value="config" className="flex-1 overflow-hidden m-0 p-2">
          <ScrollArea className="h-full">
            <div className="space-y-3 text-xs text-gray-500">
              <p className="text-center pt-4">
                Configurações de assinatura, logo e CRM são gerenciadas pelo administrador do sistema.
              </p>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PhraseItem({
  phrase,
  onInsert,
  onDelete,
  onToggleFavorite,
}: {
  phrase: { id: number; content: string; is_favorite: boolean; is_global: boolean };
  onInsert: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="group flex items-start gap-1 bg-white border border-gray-200 rounded px-2 py-1.5 hover:border-blue-300 transition-colors">
      <button
        onClick={onInsert}
        className="flex-1 text-left text-xs text-gray-700 leading-snug"
      >
        {phrase.content}
      </button>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onToggleFavorite}
          className="p-0.5 rounded hover:bg-yellow-50"
          title={phrase.is_favorite ? "Remover favorito" : "Favoritar"}
        >
          <Star
            className={`w-3 h-3 ${phrase.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
          />
        </button>
        {!phrase.is_global && (
          <button
            onClick={onDelete}
            className="p-0.5 rounded hover:bg-red-50"
            title="Remover frase"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}
