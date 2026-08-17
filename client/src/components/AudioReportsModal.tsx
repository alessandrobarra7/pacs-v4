import { useRef, useState } from "react";
import { FastForward, Gauge, Loader2, Mic, Pause, Play, Rewind, Square, Trash2, Volume2 } from "lucide-react";
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
  const [activeAudioId, setActiveAudioId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimeRef = useRef(0);

  const { data: audios = [], refetch } = trpc.audioReports.list.useQuery(
    { study_instance_uid: studyInstanceUid },
    { enabled: open && !!studyInstanceUid },
  );
  const uploadMutation = trpc.audioReports.upload.useMutation();
  const deleteMutation = trpc.audioReports.delete.useMutation();
  const activeAudio = audios.find((audio: any) => audio.id === activeAudioId) ?? null;

  const formatTime = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = Math.floor(safeSeconds % 60);
    return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
  };

  const closeAudioModal = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setActiveAudioId(null);
    setCurrentTime(0);
    onClose();
  };

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await handleUploadAudio(audioBlob, recordingTimeRef.current || 1);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
      }, 1000);
      toast.info("Gravando áudio...");
    } catch (error) {
      console.error(error);
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

  const handleUploadAudio = async (blob: Blob, recordedDuration: number) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Erro ao ler áudio"));
        reader.readAsDataURL(blob);
      });
      await uploadMutation.mutateAsync({
        study_instance_uid: studyInstanceUid,
        unit_id: unitId || 1,
        file_data: dataUrl,
        file_name: `laudo_falado_${Date.now()}.webm`,
        duration_seconds: recordedDuration,
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

  const handleDelete = async (id: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm("Remover este áudio?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      if (activeAudioId === id) {
        audioRef.current?.pause();
        setActiveAudioId(null);
        setIsPlaying(false);
        setCurrentTime(0);
      }
      await refetch();
      onUploadSuccess?.();
      toast.success("Áudio removido");
    } catch {
      toast.error("Não foi possível remover o áudio");
    }
  };

  const togglePlay = (audio: any) => {
    if (!audio.file_url) {
      toast.error("Este áudio não está disponível para reprodução.");
      return;
    }

    if (activeAudioId === audio.id && audioRef.current) {
      const player = audioRef.current;
      if (player.paused) {
        if (player.ended) player.currentTime = 0;
        player.play().then(() => setIsPlaying(true)).catch(() => toast.error("Não foi possível retomar o áudio."));
      } else {
        player.pause();
        setIsPlaying(false);
      }
      return;
    }

    audioRef.current?.pause();
    const player = new Audio(audio.file_url);
    audioRef.current = player;
    player.preload = "metadata";
    player.playbackRate = playbackRate;
    setActiveAudioId(audio.id);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(audio.duration_seconds || 0);

    player.onloadedmetadata = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) setDuration(player.duration);
    };
    player.ontimeupdate = () => setCurrentTime(player.currentTime);
    player.onended = () => {
      setIsPlaying(false);
      setCurrentTime(player.duration || duration);
    };
    player.onerror = () => {
      setIsPlaying(false);
      toast.error("Não foi possível reproduzir este áudio. Verifique a conexão e tente novamente.");
    };
    player.play().then(() => setIsPlaying(true)).catch(() => {
      setIsPlaying(false);
      toast.error("Não foi possível iniciar o áudio no navegador.");
    });
  };

  const seekBy = (seconds: number) => {
    const player = audioRef.current;
    if (!player) return;
    const targetTime = Math.max(0, Math.min(player.duration || duration || 0, player.currentTime + seconds));
    player.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  const playerDuration = audioRef.current?.duration || duration || activeAudio?.duration_seconds || 1;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeAudioModal()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-x-hidden overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl sm:p-5">
        <DialogHeader className="border-b border-gray-100 pb-3">
          <DialogTitle className="text-sm font-semibold text-gray-800">
            {patientName ? patientName.replace(/\^/g, " ").trim() : "Paciente"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4 pt-3">
          {allowRecording && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-5">
              {recording ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    Gravando... {formatTime(recordingTime)}
                  </div>
                  <Button onClick={stopRecording} variant="destructive" className="h-9 gap-1.5 rounded-full bg-red-600 px-5 text-xs text-white hover:bg-red-700">
                    <Square className="h-3.5 w-3.5 fill-white" />
                    Parar e salvar
                  </Button>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-2.5">
                  <Button onClick={startRecording} disabled={uploading} className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 p-0 text-white shadow-md hover:bg-violet-700">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-6 w-6" />}
                  </Button>
                  <span className="text-center text-[11px] text-gray-500">{uploading ? "Salvando áudio..." : "Toque no microfone para gravar"}</span>
                </div>
              )}
            </div>
          )}

          {activeAudio && (
            <section className="box-border w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3 shadow-sm sm:p-4" aria-label="Player de áudio ativo">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">{isPlaying ? "Reproduzindo agora" : "Áudio selecionado"}</p>
                    <p className="truncate text-xs font-semibold text-gray-800">{activeAudio.file_name}</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={cyclePlaybackRate} className="h-8 shrink-0 gap-1 rounded-lg border-violet-200 bg-white px-2 text-[11px] font-bold text-violet-700" aria-label={`Velocidade atual ${playbackRate}x; tocar para alterar`}>
                  <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                  {playbackRate}x
                </Button>
              </div>

              <div className="mt-4 space-y-1.5">
                <input
                  type="range"
                  min="0"
                  max={Math.max(playerDuration, 1)}
                  step="0.1"
                  value={Math.min(currentTime, Math.max(playerDuration, 1))}
                  onChange={(event) => {
                    const nextTime = Number(event.target.value);
                    if (audioRef.current) audioRef.current.currentTime = nextTime;
                    setCurrentTime(nextTime);
                  }}
                  className="h-2 w-full cursor-pointer accent-violet-600"
                  aria-label="Progresso do áudio"
                />
                <div className="flex justify-between text-[11px] font-semibold tabular-nums text-gray-500">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(playerDuration)}</span>
                </div>
              </div>

              <div className="mt-3 grid w-full grid-cols-3 items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => seekBy(-10)} className="h-10 w-full gap-1 rounded-xl px-1 text-xs font-bold text-violet-700 hover:bg-violet-100" aria-label="Voltar 10 segundos">
                  <Rewind className="h-4 w-4" aria-hidden="true" />
                  10s
                </Button>
                <Button type="button" onClick={() => togglePlay(activeAudio)} className="mx-auto h-12 w-12 rounded-full bg-violet-600 p-0 text-white shadow-md hover:bg-violet-700" aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}>
                  {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => seekBy(10)} className="h-10 w-full gap-1 rounded-xl px-1 text-xs font-bold text-violet-700 hover:bg-violet-100" aria-label="Avançar 10 segundos">
                  10s
                  <FastForward className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </section>
          )}

          <div className="space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Áudios vinculados ({audios.length})</span>
            {audios.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-4 text-center text-xs text-gray-400">Nenhum áudio gravado.</div>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {audios.filter((audio: any) => audio.id !== activeAudioId).map((audio: any) => (
                  <div key={audio.id} className="group flex items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-gray-50 p-2.5 transition-colors hover:bg-gray-100/80">
                    <Button type="button" variant="ghost" onClick={() => togglePlay(audio)} className="h-auto min-w-0 flex-1 justify-start gap-2.5 whitespace-normal p-0 text-left hover:bg-transparent" aria-label={`Reproduzir ${audio.file_name}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                        <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-800">{audio.file_name}</span>
                        <span className="block text-[10px] font-medium text-gray-500">{formatTime(audio.duration_seconds || 0)}</span>
                      </span>
                    </Button>
                    {allowRecording && (
                      <Button variant="ghost" size="icon" onClick={(event) => handleDelete(audio.id, event)} className="h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={closeAudioModal} variant="outline" className="h-10 w-full rounded-xl border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100">Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
