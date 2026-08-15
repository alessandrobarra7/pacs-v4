import { useState, useRef } from "react";
import { Mic, Square, Play, Trash2, X, Loader2, Volume2, Radio } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface AudioReportsModalProps {
  open: boolean;
  onClose: () => void;
  studyInstanceUid: string;
  unitId?: number;
  patientName?: string;
  onUploadSuccess?: () => void;
}

export function AudioReportsModal({
  open,
  onClose,
  studyInstanceUid,
  unitId,
  patientName,
  onUploadSuccess,
}: AudioReportsModalProps) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const { data: audios = [], refetch } = trpc.audioReports.list.useQuery(
    { study_instance_uid: studyInstanceUid },
    { enabled: open && !!studyInstanceUid }
  );

  const uploadMutation = trpc.audioReports.upload.useMutation();
  const deleteMutation = trpc.audioReports.delete.useMutation();

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());

        await handleUploadAudio(audioBlob, recordingTime);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      toast.info("Gravando áudio...");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleUploadAudio = async (blob: Blob, duration: number) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Erro ao ler áudio"));
        reader.readAsDataURL(blob);
      });

      const fileName = `laudo_falado_${Date.now()}.webm`;
      await uploadMutation.mutateAsync({
        study_instance_uid: studyInstanceUid,
        unit_id: unitId || 1,
        file_data: dataUrl,
        file_name: fileName,
        duration_seconds: duration,
      });

      toast.success("Áudio gravado e vinculado com sucesso!");
      await refetch();
      onUploadSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar áudio");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Deseja realmente excluir este áudio?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      await refetch();
      onUploadSuccess?.();
      toast.success("Áudio removido");
    } catch {
      toast.error("Não foi possível remover o áudio");
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 sm:p-6 bg-slate-900 text-white border-slate-800">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-3">
          <DialogTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Radio className="h-4 w-4 text-purple-400" />
            Laudo Falado (Áudio Vinculado)
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-5 pt-3">
          {patientName && (
            <div className="text-xs text-slate-400 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <span className="font-medium text-slate-300">Paciente:</span> {patientName.replace(/\^/g, " ").trim()}
            </div>
          )}

          {/* Seção de Gravação */}
          <div className="flex flex-col items-center justify-center p-6 bg-slate-800/40 rounded-xl border border-slate-800 gap-4">
            {recording ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-red-400 animate-pulse font-semibold">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  Gravando... {formatTime(recordingTime)}
                </div>
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  className="rounded-full px-6 gap-2 bg-red-600 hover:bg-red-700"
                >
                  <Square className="h-4 w-4 fill-white" />
                  Parar e Salvar Áudio
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <Button
                  onClick={startRecording}
                  disabled={uploading}
                  className="rounded-full w-16 h-16 bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-900/30 flex items-center justify-center p-0"
                >
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="h-7 w-7" />}
                </Button>
                <span className="text-xs text-slate-400 text-center">
                  {uploading ? "Salvando áudio..." : "Toque no microfone para gravar o laudo falado"}
                </span>
              </div>
            )}
          </div>

          {/* Lista de áudios */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Áudios Vinculados ({audios.length})
            </span>
            {audios.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-800">
                Nenhum áudio gravado para este estudo.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {audios.map((audio: any) => (
                  <div
                    key={audio.id}
                    className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                        <Volume2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">
                          {audio.file_name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(audio.createdAt).toLocaleString("pt-BR")} • {audio.duration_seconds || 0}s
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <audio controls src={audio.file_url} className="h-8 w-32 sm:w-40" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(audio.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                        title="Excluir áudio"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
