#!/usr/bin/env python3.11
"""
DICOM C-MOVE Script — LAUDS Portal
Solicita estudo ao PACS via C-MOVE e recebe imagens via C-STORE.
Retorna JSON estruturado com status, contagem de arquivos e logs detalhados.
"""

import sys
import json
import os
import shutil
import time
import datetime
from pynetdicom import AE, evt, StoragePresentationContexts
from pynetdicom.sop_class import StudyRootQueryRetrieveInformationModelMove

# Logs acumulados durante a execução
_logs = []

def log(level, message):
    ts = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    entry = f"[{ts}] [{level}] {message}"
    _logs.append(entry)
    print(entry, file=sys.stderr)

def handle_store(event):
    """Recebe arquivo DICOM via C-STORE durante o C-MOVE"""
    ds = event.dataset
    ds.file_meta = event.file_meta

    cache_dir = os.environ.get('DICOM_CACHE_DIR', '/tmp/dicom-cache')
    study_uid = str(ds.StudyInstanceUID)
    study_cache_dir = os.path.join(cache_dir, study_uid)
    os.makedirs(study_cache_dir, exist_ok=True)

    filename = f"{ds.SOPInstanceUID}.dcm"
    filepath = os.path.join(study_cache_dir, filename)
    ds.save_as(filepath, write_like_original=False)

    log("STORE", f"Arquivo recebido: {filename} ({os.path.getsize(filepath)} bytes)")
    return 0x0000  # Success

def c_move_study(pacs_ip, pacs_port, pacs_ae_title, local_ae_title, study_instance_uid, cache_dir):
    """
    Executa C-MOVE para baixar estudo do PACS para cache local.

    Retorna dict com:
      success       (bool)
      file_count    (int)
      cache_dir     (str)
      study_instance_uid (str)
      duration_sec  (float)
      logs          (list[str])
      error         (str, apenas em falha)
    """
    start_time = time.time()

    log("INFO", f"=== INÍCIO C-MOVE ===")
    log("INFO", f"StudyInstanceUID : {study_instance_uid}")
    log("INFO", f"PACS remoto      : {pacs_ip}:{pacs_port} AE={pacs_ae_title}")
    log("INFO", f"AE Title local   : {local_ae_title}")
    log("INFO", f"Cache dir        : {cache_dir}")

    os.environ['DICOM_CACHE_DIR'] = cache_dir
    os.makedirs(cache_dir, exist_ok=True)

    study_cache_dir = os.path.join(cache_dir, study_instance_uid)

    # Limpa cache anterior do mesmo estudo para evitar arquivos obsoletos
    if os.path.exists(study_cache_dir):
        shutil.rmtree(study_cache_dir)
        log("INFO", f"Cache anterior removido: {study_cache_dir}")

    os.makedirs(study_cache_dir, exist_ok=True)

    # AE para enviar C-MOVE (SCU)
    ae_scu = AE(ae_title=local_ae_title)
    ae_scu.add_requested_context(StudyRootQueryRetrieveInformationModelMove)

    # AE para receber C-STORE (SCP)
    ae_scp = AE(ae_title=local_ae_title)
    for context in StoragePresentationContexts:
        ae_scp.add_supported_context(context.abstract_syntax)

    handlers = [(evt.EVT_C_STORE, handle_store)]

    # Inicia listener C-STORE em background
    try:
        scp = ae_scp.start_server(('0.0.0.0', 11113), block=False, evt_handlers=handlers)
        log("INFO", "Listener C-STORE iniciado na porta 11113")
    except Exception as e:
        log("ERROR", f"Falha ao iniciar listener C-STORE: {e}")
        return {
            "success": False,
            "error": f"Falha ao iniciar listener C-STORE na porta 11113: {e}",
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": round(time.time() - start_time, 2),
            "logs": _logs,
        }

    try:
        log("INFO", f"Conectando ao PACS {pacs_ip}:{pacs_port} ...")
        assoc = ae_scu.associate(pacs_ip, int(pacs_port), ae_title=pacs_ae_title)

        if not assoc.is_established:
            log("ERROR", "Falha ao estabelecer associação DICOM com o PACS")
            return {
                "success": False,
                "error": f"Não foi possível conectar ao PACS {pacs_ip}:{pacs_port} AE={pacs_ae_title}. Verifique IP, porta e AE Title.",
                "file_count": 0,
                "cache_dir": study_cache_dir,
                "study_instance_uid": study_instance_uid,
                "duration_sec": round(time.time() - start_time, 2),
                "logs": _logs,
            }

        log("INFO", "Associação DICOM estabelecida com sucesso")

        from pydicom.dataset import Dataset
        ds = Dataset()
        ds.QueryRetrieveLevel = 'STUDY'
        ds.StudyInstanceUID = study_instance_uid

        log("INFO", f"Enviando C-MOVE para AE destino: {local_ae_title}")
        responses = assoc.send_c_move(ds, local_ae_title, StudyRootQueryRetrieveInformationModelMove)

        pending_count = 0
        success_count = 0
        failed_count = 0

        for (status, identifier) in responses:
            if status:
                status_hex = f"0x{status.Status:04X}"
                if status.Status in (0xFF00, 0xFF01):  # Pending
                    pending_count += 1
                    log("INFO", f"C-MOVE pendente ({status_hex}): {pending_count} imagens em trânsito")
                elif status.Status == 0x0000:  # Success
                    success_count += 1
                    log("INFO", f"C-MOVE concluído com sucesso ({status_hex})")
                else:
                    failed_count += 1
                    log("WARN", f"C-MOVE status inesperado ({status_hex})")
            else:
                log("WARN", "C-MOVE retornou status None (possível timeout ou recusa)")

        assoc.release()
        log("INFO", "Associação DICOM encerrada")

        # Aguarda até 10s para arquivos chegarem via C-STORE
        wait_start = time.time()
        while time.time() - wait_start < 10:
            file_count = len([f for f in os.listdir(study_cache_dir) if f.endswith('.dcm')])
            if file_count > 0:
                break
            time.sleep(0.5)

        file_count = len([f for f in os.listdir(study_cache_dir) if f.endswith('.dcm')])
        duration = round(time.time() - start_time, 2)

        log("INFO", f"=== FIM C-MOVE === Arquivos recebidos: {file_count} | Duração: {duration}s")

        if file_count == 0:
            log("ERROR", "Nenhum arquivo .dcm recebido. Verifique se o AE Title local está cadastrado no PACS como destino autorizado.")
            return {
                "success": False,
                "error": "Nenhuma imagem recebida. O AE Title local precisa estar cadastrado no PACS como destino C-MOVE autorizado.",
                "file_count": 0,
                "cache_dir": study_cache_dir,
                "study_instance_uid": study_instance_uid,
                "duration_sec": duration,
                "logs": _logs,
            }

        return {
            "success": True,
            "file_count": file_count,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": duration,
            "logs": _logs,
        }

    except Exception as e:
        log("ERROR", f"Exceção durante C-MOVE: {e}")
        return {
            "success": False,
            "error": str(e),
            "file_count": 0,
            "cache_dir": study_cache_dir,
            "study_instance_uid": study_instance_uid,
            "duration_sec": round(time.time() - start_time, 2),
            "logs": _logs,
        }

    finally:
        try:
            scp.shutdown()
            log("INFO", "Listener C-STORE encerrado")
        except Exception:
            pass


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: dicom_move.py '<json_params>'"}))
        sys.exit(1)

    try:
        params = json.loads(sys.argv[1])
        result = c_move_study(
            pacs_ip=params['pacs_ip'],
            pacs_port=int(params['pacs_port']),
            pacs_ae_title=params['pacs_ae_title'],
            local_ae_title=params.get('local_ae_title', 'LAUDS'),
            study_instance_uid=params['study_instance_uid'],
            cache_dir=params.get('cache_dir', '/tmp/dicom-cache')
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "logs": _logs}))
        sys.exit(1)
