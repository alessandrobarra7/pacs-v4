#!/usr/bin/env python3.11
"""
DICOM C-GET Script — LAUDS Portal
Solicita estudo ao PACS via C-GET (pull-based, sem listener externo).
O C-GET recebe as imagens na mesma conexão TCP da requisição.

MODOS DE OPERAÇÃO:
  - Padrão (streaming=false): aguarda todos os arquivos, retorna JSON único no stdout
  - Streaming (streaming=true): emite uma linha JSON por arquivo recebido + JSON final
    Formato streaming:
      {"type": "total", "total": N}          — quando o PACS informa o total de imagens
      {"type": "file", "filename": "x.dcm", "total": N}  — a cada arquivo salvo
      {"type": "complete", ...resultado final...}          — ao finalizar

IMPORTANTE: Requer negociação de roles (ext_neg) com scp_role=True
para que o PACS possa enviar as imagens via C-STORE sub-operations.
Sem isso, o PACS retorna 0xA702 (Out of Resources).
"""

import sys
import json
import os
import shutil
import time
import datetime
from pynetdicom import AE, evt, build_role
from pynetdicom.sop_class import (
    StudyRootQueryRetrieveInformationModelGet,
    PatientRootQueryRetrieveInformationModelGet,
)
from pynetdicom import StoragePresentationContexts

_logs = []
_streaming = False  # modo streaming: emite JSON por linha a cada arquivo


def log(level, message):
    ts = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    entry = f"[{ts}] [{level}] {message}"
    _logs.append(entry)
    print(entry, file=sys.stderr)


def emit(data: dict):
    """Emite uma linha JSON no stdout (modo streaming ou final)."""
    print(json.dumps(data), flush=True)


def make_store_handler(study_cache_dir, total_ref: list):
    """
    Retorna handler C-STORE que:
    1. Salva o arquivo no diretório do estudo
    2. Em modo streaming, emite {"type": "file", "filename": "...", "total": N} no stdout
    """
    def handle_store(event):
        ds = event.dataset
        ds.file_meta = event.file_meta
        os.makedirs(study_cache_dir, exist_ok=True)
        filename = f"{ds.SOPInstanceUID}.dcm"
        filepath = os.path.join(study_cache_dir, filename)
        ds.save_as(filepath, write_like_original=False)
        size = os.path.getsize(filepath)
        log("STORE", f"Arquivo salvo: {filename} ({size} bytes)")

        if _streaming:
            # Emite evento de arquivo recebido para o SSE do servidor
            emit({"type": "file", "filename": filename, "total": total_ref[0]})

        return 0x0000  # Success
    return handle_store


def c_get_study(pacs_ip, pacs_port, pacs_ae_title, local_ae_title, study_instance_uid, cache_dir, streaming=False):
    """
    Executa C-GET para baixar estudo do PACS.

    C-GET é pull-based: as imagens chegam na mesma conexão TCP.
    Requer negociação de roles (scp_role=True) para que o PACS
    possa enviar as imagens via C-STORE sub-operations.

    Retorna dict com:
      success            (bool)
      file_count         (int)
      cache_dir          (str)
      study_instance_uid (str)
      duration_sec       (float)
      logs               (list[str])
      error              (str, apenas em falha)
    """
    global _streaming
    _streaming = streaming

    start_time = time.time()

    log("INFO", "=== INÍCIO C-GET ===")
    log("INFO", f"StudyInstanceUID : {study_instance_uid}")
    log("INFO", f"PACS remoto      : {pacs_ip}:{pacs_port} AE={pacs_ae_title}")
    log("INFO", f"AE Title local   : {local_ae_title}")
    log("INFO", f"Cache dir        : {cache_dir}")
    log("INFO", f"Modo streaming   : {streaming}")

    os.makedirs(cache_dir, exist_ok=True)
    study_cache_dir = os.path.join(cache_dir, study_instance_uid)

    # Limpa cache anterior do mesmo estudo
    if os.path.exists(study_cache_dir):
        shutil.rmtree(study_cache_dir)
        log("INFO", f"Cache anterior removido: {study_cache_dir}")
    os.makedirs(study_cache_dir, exist_ok=True)

    # Coleta todos os SOP Classes de Storage para negociação
    storage_sop_classes = [ctx.abstract_syntax for ctx in StoragePresentationContexts]

    # Configura AE com C-GET SCU + Storage SCP contexts
    ae = AE(ae_title=local_ae_title)
    ae.add_requested_context(StudyRootQueryRetrieveInformationModelGet)
    ae.add_requested_context(PatientRootQueryRetrieveInformationModelGet)
    for sop_class in storage_sop_classes:
        ae.add_requested_context(sop_class)

    # Negociação de roles: declaramos que somos SCP para Storage
    # Isso é obrigatório para que o PACS envie imagens via C-STORE sub-operations
    # Sem isso, o PACS retorna 0xA702 (Out of Resources / Unable to perform sub-operations)
    roles = [build_role(sop_class, scp_role=True) for sop_class in storage_sop_classes]

    # total_ref[0] será atualizado quando o PACS informar o total de imagens
    total_ref = [0]

    # Handler que salva cada imagem recebida
    handlers = [(evt.EVT_C_STORE, make_store_handler(study_cache_dir, total_ref))]

    log("INFO", f"Conectando ao PACS {pacs_ip}:{pacs_port} com negociação de roles...")
    try:
        assoc = ae.associate(
            pacs_ip,
            int(pacs_port),
            ae_title=pacs_ae_title,
            evt_handlers=handlers,
            ext_neg=roles,
        )
    except Exception as e:
        log("ERROR", f"Exceção ao conectar: {e}")
        result = {
            "success": False,
            "error": f"Erro de conexão: {e}",
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": round(time.time() - start_time, 2),
            "logs": _logs,
        }
        if streaming:
            emit({"type": "complete", **result})
        return result

    if not assoc.is_established:
        log("ERROR", "Falha ao estabelecer associação DICOM com o PACS")
        result = {
            "success": False,
            "error": f"Não foi possível conectar ao PACS {pacs_ip}:{pacs_port} AE={pacs_ae_title}. Verifique IP, porta e AE Title.",
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": round(time.time() - start_time, 2),
            "logs": _logs,
        }
        if streaming:
            emit({"type": "complete", **result})
        return result

    log("INFO", "Associação DICOM estabelecida com sucesso")

    try:
        from pydicom.dataset import Dataset
        ds = Dataset()
        ds.QueryRetrieveLevel = 'STUDY'
        ds.StudyInstanceUID = study_instance_uid

        log("INFO", "Enviando C-GET (Study Root)...")
        responses = assoc.send_c_get(ds, StudyRootQueryRetrieveInformationModelGet)

        for (status, identifier) in responses:
            if status:
                status_hex = f"0x{status.Status:04X}"
                if status.Status in (0xFF00, 0xFF01):  # Pending
                    # Tenta extrair o total de imagens do status (NumberOfRemainingSuboperations)
                    try:
                        remaining = getattr(status, 'NumberOfRemainingSuboperations', 0) or 0
                        completed = getattr(status, 'NumberOfCompletedSuboperations', 0) or 0
                        total = remaining + completed
                        if total > 0 and total_ref[0] == 0:
                            total_ref[0] = total
                            log("INFO", f"Total de imagens informado pelo PACS: {total}")
                            if streaming:
                                emit({"type": "total", "total": total})
                    except Exception:
                        pass

                    received_so_far = len([f for f in os.listdir(study_cache_dir) if f.endswith('.dcm')])
                    log("INFO", f"C-GET pendente ({status_hex}) — {received_so_far} imagens recebidas até agora")
                elif status.Status == 0x0000:  # Success
                    log("INFO", f"C-GET concluído com sucesso ({status_hex})")
                elif status.Status in (0xB000, 0xB007, 0xB006):  # Warning
                    log("WARN", f"C-GET warning ({status_hex})")
                else:
                    log("WARN", f"C-GET status inesperado ({status_hex})")
            else:
                log("WARN", "C-GET retornou status None")

        assoc.release()
        log("INFO", "Associação DICOM encerrada")

    except Exception as e:
        log("ERROR", f"Exceção durante C-GET: {e}")
        try:
            assoc.release()
        except Exception:
            pass
        result = {
            "success": False,
            "error": str(e),
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": round(time.time() - start_time, 2),
            "logs": _logs,
        }
        if streaming:
            emit({"type": "complete", **result})
        return result

    file_count = len([f for f in os.listdir(study_cache_dir) if f.endswith('.dcm')])
    duration = round(time.time() - start_time, 2)

    log("INFO", f"=== FIM C-GET === Arquivos recebidos: {file_count} | Duração: {duration}s")

    if file_count == 0:
        log("ERROR", "Nenhum arquivo .dcm recebido. Verifique se o PACS suporta C-GET e se o StudyInstanceUID está correto.")
        result = {
            "success": False,
            "error": "Nenhuma imagem recebida via C-GET. Verifique se o PACS suporta C-GET para este estudo.",
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": duration,
            "logs": _logs,
        }
        if streaming:
            emit({"type": "complete", **result})
        return result

    result = {
        "success": True,
        "file_count": file_count,
        "cache_dir": study_cache_dir,
        "study_instance_uid": study_instance_uid,
        "duration_sec": duration,
        "logs": _logs,
    }
    if streaming:
        emit({"type": "complete", **result})
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: dicom_move.py '<json_params>'"}))
        sys.exit(1)

    try:
        params = json.loads(sys.argv[1])
        streaming_mode = params.get('streaming', False)
        result = c_get_study(
            pacs_ip=params['pacs_ip'],
            pacs_port=int(params['pacs_port']),
            pacs_ae_title=params['pacs_ae_title'],
            local_ae_title=params.get('local_ae_title', 'LAUDS'),
            study_instance_uid=params['study_instance_uid'],
            cache_dir=params.get('cache_dir', '/tmp/dicom-cache'),
            streaming=streaming_mode,
        )
        # No modo não-streaming, emite o JSON final no stdout (comportamento original)
        if not streaming_mode:
            print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "logs": _logs}))
        sys.exit(1)
