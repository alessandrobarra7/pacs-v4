import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getStudyMetadata, getStudyMetadataBatch, createAuditLog } from "../db";
import { cFind } from "../dicom.service";
import type { CFindResult } from "../dicom.service";
import { MAX_UPLOAD_BYTES } from "../../shared/const";
import { getDicomWebUrl } from "../orthanc";
import { inferExtension, isValidImageBuffer } from "../routerUtils";
import { units } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const pacsRouter = router({
    query: protectedProcedure
      .input(z.object({
        patientName: z.string().optional(),
        patientId: z.string().optional(),
        modality: z.string().optional(),
        studyDate: z.string().optional(),
        accessionNumber: z.string().optional(),
        studyDescription: z.string().optional(),
        unit_id: z.number().optional(), // admin_master pode passar unit_id explícito
      }))
      .mutation(async ({ input, ctx }) => {
        // Get user's unit to retrieve PACS connection parameters
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database not available',
          });
        }

        // Determinar a unidade alvo:
        // - admin_master pode passar qualquer unit_id
        // - demais usuários podem passar unit_id se tiverem permissão via user_unit_permissions
        // - fallback: unit_id legado do campo users.unit_id
        let targetUnitId: number | null | undefined = ctx.user.unit_id;
        if (input.unit_id) {
          if (ctx.user.role === 'admin_master') {
            targetUnitId = input.unit_id;
          } else {
            // Verificar se o usuário tem permissão nessa unidade
            const { getUserUnitPermission } = await import('../db');
            const perm = await getUserUnitPermission(ctx.user.id, input.unit_id);
            if (perm) {
              targetUnitId = input.unit_id;
            }
          }
        }

        // Busca unidade do usuário
        if (!targetUnitId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade. Entre em contato com o administrador.',
          });
        }
        
        const [unitData] = await db.select().from(units).where(eq(units.id, targetUnitId)).limit(1);
        const unit = unitData;
        
        if (!unit) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Nenhuma unidade configurada. Acesse Administração > Unidades para configurar.',
          });
        }
        
        // MODO ÚNICO: DICOM DIRETO via C-FIND
        const hasDicomDirect = !!(unit.pacs_ip && unit.pacs_port && unit.pacs_ae_title);
        
        if (!hasDicomDirect) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'A unidade não está configurada corretamente. Verifique o IP, Porta e AE Title nas configurações.',
          });
        }
        
        // BUG-2 FIX: Helper formata Date para YYYYMMDD respeitando TZ do processo (America/Sao_Paulo via PM2)
        const toDiscom = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}${m}${day}`;
        };

        // Handle special date values
        let studyDate = input.studyDate;

        if (studyDate === 'TODAY') {
          studyDate = toDiscom(new Date());
          console.log('[PACS Query] TODAY resolved to:', studyDate);

        } else if (studyDate === 'YESTERDAY') {
          // BUG-2 FIX: token YESTERDAY resolvido no servidor com TZ correto
          const d = new Date();
          d.setDate(d.getDate() - 1);
          studyDate = toDiscom(d);
          console.log('[PACS Query] YESTERDAY resolved to:', studyDate);

        } else if (studyDate === 'LAST_7_DAYS') {
          // BUG-2 FIX: range fechado (YYYYMMDD-YYYYMMDD) em vez de aberto (YYYYMMDD-)
          const now = new Date();
          const from = new Date(now);
          from.setDate(from.getDate() - 7);
          studyDate = `${toDiscom(from)}-${toDiscom(now)}`;
          console.log('[PACS Query] LAST_7_DAYS resolved to:', studyDate);

        } else if (studyDate === 'LAST_30_DAYS') {
          // BUG-2 FIX: range fechado (YYYYMMDD-YYYYMMDD) em vez de aberto (YYYYMMDD-)
          const now = new Date();
          const from = new Date(now);
          from.setDate(from.getDate() - 30);
          studyDate = `${toDiscom(from)}-${toDiscom(now)}`;
          console.log('[PACS Query] LAST_30_DAYS resolved to:', studyDate);
        }
        
        const filters = {
          patientName: input.patientName,
          patientId: input.patientId,
          modality: input.modality,
          studyDate,
          accessionNumber: input.accessionNumber,
        };
        
        try {
          let studies: any[] = [];
          let truncated = false;
          let timedOut = false;

          // MODO ÚNCO: C-FIND DICOM DIRETO
          console.log(`[PACS Query] C-FIND → ${unit.pacs_ip}:${unit.pacs_port} AE=${unit.pacs_ae_title}`);
          const cFindResult: CFindResult = await cFind(
            {
              ip: unit.pacs_ip!,
              port: unit.pacs_port!,
              remoteAeTitle: unit.pacs_ae_title!,
              localAeTitle: unit.pacs_local_ae_title || 'LAUDS',
            },
            {
              // Bug fix A4: wildcard DICOM adicionado apenas em dicom.service.ts.
              // Adicionar aqui também resultava em '**JOSE**' enviado ao PACS, causando zero resultados.
              patientName: filters.patientName || undefined,
              patientID: filters.patientId,
              studyDate: filters.studyDate,
              // Não enviar modality se for vazio ou 'ALL' — C-FIND retorna todos quando omitido
              modality: (filters.modality && filters.modality !== 'ALL') ? filters.modality : undefined,
              accessionNumber: filters.accessionNumber,
            }
          );
          // Bug fix A3/A5: extrair flags de truncamento e timeout do resultado
          studies = cFindResult.studies;
          truncated = cFindResult.truncated;
          timedOut = cFindResult.timedOut;
          console.log(`[PACS Query] C-FIND retornou ${studies.length} estudos${truncated ? ' (TRUNCADO)' : ''}${timedOut ? ' (TIMEOUT)' : ''}`);
          // Normaliza campos para o frontend
          studies = studies.map((s: any) => ({
            studyInstanceUid: s.studyInstanceUID || s.studyInstanceUid || '',
            patientName: (s.patientName || '').replace(/\^+/g, ' ').trim(),
            patientID: s.patientID || s.patientId || '',
            patientBirthDate: s.patientBirthDate || '',
            patientSex: s.patientSex || '',
            studyDate: s.studyDate || '',
            studyTime: s.studyTime || '',
            modality: s.modality || '',
            studyDescription: s.studyDescription || '',
            accessionNumber: s.accessionNumber || '',
            numberOfSeries: s.numberOfSeries || 0,
            numberOfInstances: s.numberOfInstances || 0,
            retrieveAeTitle: s.retrieveAeTitle || unit.pacs_ae_title || '',
            unitId: unit.id,
            unitName: unit.name,
            source: 'dicom_direct',
          }));
          
          // Log audit
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || 'unknown',
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              ...input,
              results_count: studies.length,
            },
          });
          
          return {
            success: true,
            studies,
            count: studies.length,
            // Bug fix A3/A5: propagar flags de truncamento e timeout ao frontend
            truncated,
            timedOut,
          };
          
        } catch (error: any) {
          console.error('[PACS Query] Erro:', error);
          
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: ctx.user.unit_id,
            action: 'PACS_QUERY',
            target_type: 'PACS',
            target_id: unit.pacs_ae_title || 'unknown',
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: { ...input, error: error.message },
          });
          
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha na consulta DICOM: ${error.message}`,
          });
        }
      }),
    
    startViewer: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        unit_id: z.number().optional(), // admin_master pode especificar a unidade
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database não disponível',
          });
        }

        // V12-3 FIX: Qualquer usuário pode passar unit_id se tiver permissão view_studies naquela unidade
        let targetUnitId: number | null | undefined;
        if (ctx.user.role === 'admin_master') {
          targetUnitId = input.unit_id ?? ctx.user.unit_id;
        } else if (input.unit_id) {
          // Validar que o usuário tem view_studies na unidade solicitada
          const { assertUnitPermission } = await import('../db');
          const allowed = await assertUnitPermission(ctx.user, input.unit_id, 'view_studies');
          if (!allowed) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Você não tem permissão para visualizar estudos nesta unidade.',
            });
          }
          targetUnitId = input.unit_id;
        } else {
          targetUnitId = ctx.user.unit_id;
        }

        if (!targetUnitId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade.',
          });
        }

        // Get user's unit to access PACS configuration
        const [unit] = await db.select().from(units).where(eq(units.id, targetUnitId)).limit(1);
        
        if (!unit) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unidade não encontrada',
          });
        }
        
        // Check if PACS connection is configured
        if (!unit.pacs_ip || !unit.pacs_port || !unit.pacs_ae_title) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'PACS não configurado para esta unidade.',
          });
        }
        
        const localAeTitle = unit.pacs_local_ae_title || 'LAUDS';
        
        // Verificar cache existente — evita re-download se imagens já estão no disco
        const { existsSync, readdirSync } = await import('fs');
        const studyCacheDir = `/tmp/dicom-cache/${input.studyInstanceUid}`;
        if (existsSync(studyCacheDir)) {
          const cachedFiles = readdirSync(studyCacheDir).filter((f: string) => f.endsWith('.dcm'));
          if (cachedFiles.length > 0) {
            console.log(`[C-GET] Cache HIT: ${cachedFiles.length} arquivos para ${input.studyInstanceUid}`);
            await createAuditLog({
              user_id: ctx.user.id,
              unit_id: targetUnitId,
              action: 'OPEN_VIEWER',
              target_type: 'STUDY',
              target_id: input.studyInstanceUid,
              ip_address: ctx.req.ip,
              user_agent: ctx.req.headers['user-agent'],
              metadata: { cache_hit: true, file_count: cachedFiles.length },
            });
            return {
              success: true,
              studyInstanceUid: input.studyInstanceUid,
              fileCount: cachedFiles.length,
              cacheDir: studyCacheDir,
              durationSec: 0,
              fromCache: true,
            };
          }
        }
        
        const moveInput = {
          pacs_ip: unit.pacs_ip,
          pacs_port: unit.pacs_port,
          pacs_ae_title: unit.pacs_ae_title,
          local_ae_title: localAeTitle,
          study_instance_uid: input.studyInstanceUid,
          cache_dir: '/tmp/dicom-cache',
        };

        console.log(`[C-GET] Iniciando: StudyUID=${input.studyInstanceUid} PACS=${unit.pacs_ip}:${unit.pacs_port} AE=${unit.pacs_ae_title} LocalAE=${localAeTitle} User=${ctx.user.username}`);

        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        try {
          // Executa dicom_move.py diretamente (sem wrapper .sh)
          // Em dev: import.meta.url aponta para server/routers.ts → mesmo nível
          // Em prod: dist/routers.js → dicom_move.py está em dist/ (copiado pelo build)
          const { existsSync: _existsSync } = await import('fs');
          const _scriptPathSameLevel = new URL('./dicom_move.py', import.meta.url).pathname;
          const _scriptPathParent = new URL('../dicom_move.py', import.meta.url).pathname;
          const scriptPath = _existsSync(_scriptPathSameLevel) ? _scriptPathSameLevel : _scriptPathParent;
          // Usar caminho absoluto do Python 3.11 e limpar PYTHONHOME/PYTHONPATH
          // para evitar conflito com o ambiente uv Python 3.13 do servidor
          const pythonBin = '/usr/bin/python3.11';
          const cleanEnv = { ...process.env };
          delete cleanEnv.PYTHONHOME;
          delete cleanEnv.PYTHONPATH;
          const { stdout, stderr } = await execFileAsync(
            pythonBin,
            [scriptPath, JSON.stringify(moveInput)],
            { timeout: 600000, env: cleanEnv } // 10 minutos para estudos grandes (CT com 200+ imagens)
          );

          if (stderr) {
            // stderr contém os logs detalhados do script — registrar no console do servidor
            console.log(`[C-GET] Logs do script:\n${stderr}`);
          }

          let result: any;
          try {
            result = JSON.parse(stdout);
          } catch {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Resposta inválida do script C-GET. Verifique os logs do servidor.',
            });
          }

          console.log(`[C-GET] Resultado: success=${result.success} files=${result.file_count} duration=${result.duration_sec}s`);
          if (result.logs) {
            result.logs.forEach((l: string) => console.log(`[C-GET] ${l}`));
          }

          // Registrar auditoria independente do resultado
          await createAuditLog({
            user_id: ctx.user.id,
            unit_id: targetUnitId,
            action: 'OPEN_VIEWER',
            target_type: 'STUDY',
            target_id: input.studyInstanceUid,
            ip_address: ctx.req.ip,
            user_agent: ctx.req.headers['user-agent'],
            metadata: {
              pacs_ip: unit.pacs_ip,
              pacs_ae_title: unit.pacs_ae_title,
              local_ae_title: localAeTitle,
              file_count: result.file_count || 0,
              duration_sec: result.duration_sec || 0,
              success: result.success,
            },
          });

          if (!result.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: result.error || 'Erro desconhecido no C-GET.',
            });
          }

          if (!result.file_count || result.file_count === 0) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Nenhuma imagem recebida do PACS via C-GET. Verifique se o PACS suporta C-GET para este estudo.',
            });
          }

          return {
            success: true,
            studyInstanceUid: input.studyInstanceUid,
            fileCount: result.file_count,
            cacheDir: result.cache_dir,
            durationSec: result.duration_sec,
            pacsAeTitle: unit.pacs_ae_title || 'DPACS',
          };

        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          console.error('[C-GET] Erro inesperado:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao executar C-GET: ${error.message}`,
          });
        }
      }),
    
    getViewerUrl: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
        unit_id: z.number().optional(), // V12-4 FIX: aceitar unit_id para usuários multiunidade
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database não disponível' });
        
        // V12-4 FIX: Resolver unidade alvo com suporte a multiunidade
        let targetUnitIdForViewer: number | null | undefined;
        if (ctx.user.role === 'admin_master') {
          targetUnitIdForViewer = input.unit_id ?? ctx.user.unit_id;
        } else if (input.unit_id) {
          // Validar que o usuário tem view_studies na unidade solicitada
          const { assertUnitPermission } = await import('../db');
          const allowed = await assertUnitPermission(ctx.user, input.unit_id, 'view_studies');
          if (!allowed) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Você não tem permissão para visualizar estudos nesta unidade.',
            });
          }
          targetUnitIdForViewer = input.unit_id;
        } else {
          targetUnitIdForViewer = ctx.user.unit_id;
        }

        if (!targetUnitIdForViewer) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário não está associado a nenhuma unidade.',
          });
        }
        
        const [unitData] = await db.select().from(units).where(eq(units.id, targetUnitIdForViewer)).limit(1);
        if (!unitData) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidade não encontrada' });
        
        const orthancInternalUrl = unitData.orthanc_base_url;
        // URL pública via Mikrotik NAT (para o frontend abrir o viewer diretamente)
        const orthancPublicUrl = unitData.orthanc_public_url || orthancInternalUrl;
        
        if (!orthancInternalUrl) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'URL do Orthanc não configurada para esta unidade.',
          });
        }
        
        // URL interna para proxy DICOMweb do backend
        const viewerUrl = getDicomWebUrl(orthancInternalUrl, input.studyInstanceUid);
        // URL pública para o Orthanc Web Viewer (abre no browser do usuário)
        const orthancWebViewerUrl = orthancPublicUrl
          ? `${orthancPublicUrl.replace(/\/$/, '')}/app/explorer.html#study?uuid=`
          : null;
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'OPEN_VIEWER',
          target_type: 'STUDY',
          target_id: input.studyInstanceUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
          metadata: { orthanc_url: orthancInternalUrl, viewer_url: viewerUrl },
        });
        
        return {
          success: true,
          viewerUrl,
          studyInstanceUid: input.studyInstanceUid,
          orthancUrl: orthancInternalUrl,
          orthancPublicUrl,
          orthancWebViewerUrl,
        };
      }),

    download: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // TODO: Implement C-MOVE to download study from remote PACS to local Orthanc
        
        await createAuditLog({
          user_id: ctx.user.id,
          unit_id: ctx.user.unit_id,
          action: 'PACS_DOWNLOAD',
          target_type: 'STUDY',
          target_id: input.studyInstanceUid,
          ip_address: ctx.req.ip,
          user_agent: ctx.req.headers['user-agent'],
        });
        
        return {
          success: true,
          message: 'Download não implementado ainda',
        };
      }),

});
