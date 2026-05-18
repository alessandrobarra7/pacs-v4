import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getStudyMetadata, getStudyMetadataBatch, createAuditLog, assertUnitPermission, getUserUnitPermission, upsertStudyCache } from "../db";
import { cFind } from "../dicom.service";
import type { CFindResult } from "../dicom.service";
import { MAX_UPLOAD_BYTES } from "../../shared/const";
import { getDicomWebUrl } from "../orthanc";
import { inferExtension, isValidImageBuffer } from "../routerUtils";
import { units } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
// BUG-6 FIX: imports estáticos em vez de dinâmicos dentro dos procedures
import { existsSync, readdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ENV } from '../_core/env';

const execFileAsync = promisify(execFile);

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
        
        // FIX: helper usa Intl.DateTimeFormat com timezone explícito — independe do TZ da VM
        const APP_TZ = process.env.APP_TIME_ZONE || 'America/Fortaleza';
        const toDicomDateInTimeZone = (d: Date): string => {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: APP_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).formatToParts(d);
          const y = parts.find(p => p.type === 'year')!.value;
          const m = parts.find(p => p.type === 'month')!.value;
          const day = parts.find(p => p.type === 'day')!.value;
          return `${y}${m}${day}`;
        };

        // Handle special date tokens
        let studyDate = input.studyDate;

        if (studyDate === 'TODAY') {
          studyDate = toDicomDateInTimeZone(new Date());
          console.log('[PACS Query] TODAY resolved to:', studyDate);

        } else if (studyDate === 'YESTERDAY') {
          // FIX: subtração em ms evita edge cases de meia-noite com DST
          const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
          studyDate = toDicomDateInTimeZone(d);
          console.log('[PACS Query] YESTERDAY resolved to:', studyDate);

        } else if (studyDate === 'LAST_7_DAYS') {
          const now = new Date();
          const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          studyDate = `${toDicomDateInTimeZone(from)}-${toDicomDateInTimeZone(now)}`;
          console.log('[PACS Query] LAST_7_DAYS resolved to:', studyDate);

        } else if (studyDate === 'LAST_30_DAYS') {
          const now = new Date();
          const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          studyDate = `${toDicomDateInTimeZone(from)}-${toDicomDateInTimeZone(now)}`;
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
          
          // Persiste estudos no cache local para que modality_snapshot fique disponível na assinatura
          if (studies.length > 0) {
            const upsertPromises = studies.map((s: any) => {
              if (!s.studyInstanceUid) return Promise.resolve();
              let studyDate: Date | null = null;
              if (s.studyDate && /^\d{8}$/.test(s.studyDate)) {
                const y = s.studyDate.slice(0, 4);
                const m = s.studyDate.slice(4, 6);
                const d = s.studyDate.slice(6, 8);
                studyDate = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
              }
              return upsertStudyCache({
                unit_id: unit.id,
                study_instance_uid: s.studyInstanceUid,
                patient_name: s.patientName || null,
                patient_id: s.patientID || null,
                accession_number: s.accessionNumber || null,
                study_date: studyDate,
                modality: s.modality || null,
                description: s.studyDescription || null,
              });
            });
            // Fire-and-forget: não bloqueia resposta ao frontend
            Promise.all(upsertPromises).catch(err =>
              console.warn('[PACS Query] upsertStudyCache batch falhou:', err)
            );
          }

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

         try {
          // Executa dicom_move.py diretamente (sem wrapper .sh)
          // Em dev: import.meta.url aponta para server/routers.ts → mesmo nível
          // Em prod: dist/routers.js → dicom_move.py está em dist/ (copiado pelo build)
          const _scriptPathSameLevel = new URL('./dicom_move.py', import.meta.url).pathname;
          const _scriptPathParent = new URL('../dicom_move.py', import.meta.url).pathname;
          const scriptPath = existsSync(_scriptPathSameLevel) ? _scriptPathSameLevel : _scriptPathParent;
          // Usar caminho absoluto do Python 3.11 e limpar PYTHONHOME/PYTHONPATH
          // para evitar conflito com o ambiente uv Python 3.13 do servidor
          const pythonBin = '/usr/bin/python3.11';
          const cleanEnv = { ...process.env };
          delete cleanEnv.PYTHONHOME;
          delete cleanEnv.PYTHONPATH;
          const { stdout, stderr } = await execFileAsync(
            pythonBin,
            [scriptPath, JSON.stringify(moveInput)],
            // BUG-5 FIX: timeout via ENV.dicomGetTimeoutMs (padrão 600000ms = 10min)
            { timeout: ENV.dicomGetTimeoutMs, env: cleanEnv }
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
        
        // BUG-3 FIX: orthanc_base_url é opcional — unidades novas usam apenas PACS direto via C-GET
        const orthancInternalUrl = unitData.orthanc_base_url ?? null;
        const orthancPublicUrl = unitData.orthanc_public_url || orthancInternalUrl;

        // URL do viewer: usa DICOMweb do Orthanc se disponível, senão proxy interno via C-GET
        const viewerUrl = orthancInternalUrl
          ? getDicomWebUrl(orthancInternalUrl, input.studyInstanceUid)
          : `/api/dicomweb?studyUid=${encodeURIComponent(input.studyInstanceUid)}&unitId=${targetUnitIdForViewer}`;

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
          orthancUrl: orthancInternalUrl,           // null se não configurado
          orthancPublicUrl: orthancPublicUrl ?? null,
          orthancWebViewerUrl,                      // null se não configurado
          hasOrthanc: !!orthancInternalUrl,         // BUG-3 FIX: flag para o frontend
        };
      }),

    download: protectedProcedure
      .input(z.object({
        studyInstanceUid: z.string(),
      }))
      // BUG-1 FIX: stub removido — não gravar audit log de operação que não ocorreu
      .mutation(async () => {
        throw new TRPCError({
          code: 'METHOD_NOT_SUPPORTED',
          message: 'Download via C-MOVE ainda não implementado. Use o botão "Visualizar" para acessar as imagens.',
        });
      }),

});
