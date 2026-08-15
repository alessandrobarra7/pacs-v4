import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, Eye, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], refetch } = trpc.annotations.list.useQuery(
    { study_instance_uid: studyInstanceUid },
    { enabled: !!studyInstanceUid && open }
  );

  const uploadMutation = trpc.annotations.upload.useMutation();
  const deleteMutation = trpc.annotations.deleteAttachment.useMutation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const dataUrl = await base64Promise;

        await uploadMutation.mutateAsync({
          study_instance_uid: studyInstanceUid,
          unit_id: unitId || 1,
          file_data: dataUrl,
          file_name: file.name,
          file_type: file.type || "image/jpeg",
        });
      }

      toast.success("Anexo(s) enviado(s) com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar anexos");
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deseja realmente remover este anexo?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Anexo removido com sucesso");
      refetch();
    } catch {
      toast.error("Erro ao remover anexo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>📎 Anexos e Fotos do Paciente</span>
          </DialogTitle>
          <DialogDescription>
            Paciente: <span className="font-semibold text-gray-800 uppercase">{patientName || "Estudo DICOM"}</span>
            <br />
            Fotografe com a câmera do dispositivo ou envie múltiplos arquivos. Os anexos ficam vinculados ao estudo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 my-3">
          <Button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" />
            <span>Tirar Foto (Câmera)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4" />
            <span>Enviar Arquivos</span>
          </Button>

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
        </div>

        {uploading && (
          <div className="flex items-center justify-center py-4 gap-2 text-blue-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Enviando arquivos...</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50/50 min-h-[200px] max-h-[350px]">
          {attachments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
              <FileText className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum anexo vinculado a este paciente/estudo</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((att: any) => {
                const isImg = att.file_type?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(att.file_url || "");
                return (
                  <div key={att.id} className="relative group bg-white border border-gray-200 rounded-lg p-2 flex flex-col gap-2 shadow-xs">
                    <div className="aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center relative">
                      {isImg ? (
                        <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="h-10 w-10 text-gray-400" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-white rounded-full text-gray-700 hover:text-blue-600"
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(att.id)}
                          className="p-1.5 bg-white rounded-full text-red-600 hover:bg-red-50"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <span className="text-xs text-gray-700 truncate text-center" title={att.file_name}>
                      {att.file_name || "Anexo"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
