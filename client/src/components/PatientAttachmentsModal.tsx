import React, { useRef, useState } from "react";
import {
  Camera,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PatientAttachmentsModalProps {
  open: boolean;
  onClose: () => void;
  studyInstanceUid: string;
  unitId?: number;
  patientName?: string;
}

export function PatientAttachmentsModal({
  open,
  onClose,
  studyInstanceUid,
  unitId,
  patientName,
}: PatientAttachmentsModalProps) {
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], refetch } = trpc.annotations.list.useQuery(
    { study_instance_uid: studyInstanceUid },
    { enabled: open && !!studyInstanceUid }
  );
  const uploadMutation = trpc.annotations.upload.useMutation();
  const deleteMutation = trpc.annotations.deleteAttachment.useMutation();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
          reader.readAsDataURL(file);
        });

        await uploadMutation.mutateAsync({
          study_instance_uid: studyInstanceUid,
          unit_id: unitId || 1,
          file_data: dataUrl,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
        });
      }

      toast.success(files.length === 1 ? "Anexo adicionado" : `${files.length} anexos adicionados`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar anexo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Remover este anexo?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      await refetch();
      toast.success("Anexo removido");
    } catch {
      toast.error("Não foi possível remover o anexo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 sm:p-6">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Paperclip className="h-5 w-5 text-gray-700" aria-hidden="true" />
            Anexos e Fotos do Paciente
          </DialogTitle>
          <p className="truncate text-base font-semibold uppercase text-gray-800" title={patientName || "Paciente"}>
            {patientName || "Paciente não identificado"}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-3">
          <Button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="h-12 gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            Fotografar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-12 gap-2 rounded-xl border-gray-300 text-sm font-semibold text-gray-900"
          >
            <Upload className="h-5 w-5" />
            Anexar arquivo
          </Button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          {attachments.length === 0 ? (
            <div className="flex h-20 items-center justify-center gap-2 text-sm text-gray-500">
              <FileText className="h-5 w-5 text-gray-300" aria-hidden="true" />
              Nenhum anexo · 0 arquivos
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {attachments.slice(0, 4).map((attachment: any) => {
                const isImage = attachment.file_type?.startsWith("image/");
                return (
                  <div key={attachment.id} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {isImage ? (
                      <img
                        src={attachment.file_url}
                        alt={attachment.file_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <FileText className="h-7 w-7" aria-hidden="true" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(attachment.id)}
                      aria-label={`Remover ${attachment.file_name}`}
                      className="absolute right-1 top-1 hidden rounded-full bg-white/95 p-1 text-red-600 shadow group-hover:block"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              {attachments.length > 4 && (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-700">
                  +{attachments.length - 4}
                </span>
              )}
              <span className="ml-auto text-right text-xs font-medium text-gray-600">
                {attachments.length} {attachments.length === 1 ? "arquivo" : "arquivos"}
              </span>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          className="h-11 w-full rounded-xl text-base font-semibold"
        >
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
