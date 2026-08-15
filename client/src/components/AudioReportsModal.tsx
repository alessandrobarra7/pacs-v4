import { useState, useRef } from "react";
import { Mic, Square, Trash2, X, Loader2, Play, Pause, Volume2 } from "lucide-react";
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
  allowRecording?: boolean;
  onUploadSuccess?: () => void;
}

export function AudioReportsModal({
  open,
  onClose,
  studyInstanceUid,
  unitId,
  patientName,
  allowRecording = true,
  onUploadSuccess,
}: AudioReportsModalProps) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleUploadAudio = async (blob: Blob, dur: number) => {
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
        duration_seconds: dur,
      });

      toast.success("Áudio gravado e vinculado");
      await refetch();
      onUploadSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar áudio");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Remover este áudio?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      await refetch();
      onUploadSuccess?.();
      toast.success("Áudio removido");
    } catch {
      toast.error("Não foi possível remover o áudio");
    }
  };

  const togglePlay = (audio: any) => {
    if (playingId === audio.id) {
      if (audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play();
        } else {
          audioRef.current.pause();
          setPlayingId(null);
        }
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const el = new Audio(audio.file_url);
      audioRef.current = el;
      el.play();
      setPlayingId(audio.id);
      setCurrentTime(0);
      setDuration(audio.duration_seconds || 10);

      el.ontimeupdate = () => {
        setCurrentTime(el.currentTime);
      };
      el.onended = () => {
        setPlayingId(null);
        setCurrentTime(0);
      };
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>, audio: any) => {
    if (playingId !== audio.id || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newTime = percentage * (audioRef.current.duration || duration || 1);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl p-5 bg-white text-gray-900 border border-gray-200 shadow-xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-3">
          <DialogTitle className="text-sm font-semibold text-gray-800">
            {patientName ? patientName.replace(/\^/g, " ").trim() : "Paciente"}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 pt-3">
          {/* Seção de Gravação (Apenas se allowRecording for true) */}
          {allowRecording && (
            <div className="flex flex-col items-center justify-center p-5 bg-gray-50 rounded-xl border border-gray-100 gap-3">
              {recording ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-red-600 font-semibold text-xs animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    Gravando... {formatTime(recordingTime)}
                  </div>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    className="rounded-full px-5 h-9 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                    Parar e Salvar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5 w-full">
                  <Button
                    onClick={startRecording}
                    disabled={uploading}
                    className="rounded-full w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white shadow-md flex items-center justify-center p-0"
                  >
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-6 w-6" />}
                  </Button>
                  <span className="text-[11px] text-gray-500 text-center">
                    {uploading ? "Salvando áudio..." : "Toque no microfone para gravar"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lista de Áudios (Toque para reproduzir + barra de progresso interativa) */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Áudios Vinculados ({audios.length})
            </span>
            {audios.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-400 bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
                Nenhum áudio gravado.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {audios.map((audio: any) => {
                  const isPlaying = playingId === audio.id;
                  const prog = isPlaying && duration > 0 ? (currentTime / (audioRef.current?.duration || duration)) * 100 : 0;

                  return (
                    <div
                      key={audio.id}
                      onClick={() => togglePlay(audio)}
                      className={`group flex flex-col p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        isPlaying
                          ? "bg-purple-50/80 border-purple-300 shadow-sm"
                          : "bg-gray-50 hover:bg-gray-100/80 border-gray-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isPlaying ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-600"
                          }`}>
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 truncate">
                              {audio.file_name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {formatTime(isPlaying ? currentTime : (audio.duration_seconds || 0))} / {formatTime(audio.duration_seconds || 0)}
                            </p>
                          </div>
                        </div>

                        {allowRecording && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDelete(audio.id, e)}
                            className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Barra de progresso interativa */}
                      {isPlaying && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeek(e, audio);
                          }}
                          className="mt-2.5 h-2 w-full bg-purple-200 rounded-full overflow-hidden cursor-pointer relative"
                        >
                          <div
                            className="h-full bg-purple-600 transition-all duration-100"
                            style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-9 rounded-xl text-xs font-semibold border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
