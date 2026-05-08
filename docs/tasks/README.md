# Tarefas Pendentes — PACS Portal v4

Este diretório contém documentos de análise e orientações de correção a serem executadas no projeto.

## Índice

| Arquivo | Setor | Problemas | Estimativa | Status |
|---|---|---|---|---|
| [CORRECOES_SETOR_AUTH_RBAC.txt](./CORRECOES_SETOR_AUTH_RBAC.txt) | Autenticação & RBAC | 7 (2 médios · 5 baixos) | ~65 min | ⏳ Pendente |
| [CORRECOES_VIEWER_DICOM_V2.txt](./CORRECOES_VIEWER_DICOM_V2.txt) | Visualizador DICOM (2ª auditoria) | 5 (2 médios · 3 baixos) | ~45 min | ⏳ Pendente |

---

## CORRECOES_SETOR_AUTH_RBAC.txt

**Ordem de execução recomendada:**

- [ ] **P1** — `shared/permissions.ts` → Renomear `canAccessUnit` duplicado para `canAccessUnitByRole` *(10 min)*
- [ ] **P2** — `server/auth.service.ts` → Remover código morto JWT (`verifySession`, `JWT_SECRET`, `getJwtSecret`, `SessionPayload`) *(10 min)*
- [ ] **P3A** — `server/routers/auth.ts` → Audit log em `createLocalUser` *(5 min)*
- [ ] **P3B** — `server/routers/auth.ts` → Audit log em `changePassword` + migration enum `CHANGE_PASSWORD` *(10 min)*
- [ ] **P4** — `server/auth.service.ts` → Corrigir timezone em `expiration_date` (usar `Intl.DateTimeFormat` com `TZ`) *(5 min)*
- [ ] **P5A** — `shared/permissions.ts` → Corrigir `PERMISSIONS_MATRIX.medico.queryPACS = true` + `canQueryPACS`/`canConfigurePACS` *(5 min)*
- [ ] **P5B** — `shared/permissions.ts` → Corrigir `PERMISSIONS_MATRIX.operador.fillAnamnesis = true` *(5 min)*
- [ ] **P6** — `server/routers/auth.ts` → Política de senha mínima (8+ chars, letra + número) *(5 min)*
- [ ] **P7** — Nginx ou `server/_core/index.ts` → Rate limiting no endpoint de login *(20 min)*

---

## CORRECOES_VIEWER_DICOM_V2.txt

**Ordem de execução recomendada:**

- [ ] **P1** — `DicomViewerPage.tsx` → `toolGroupIdRef` + `ToolGroupManager.destroyToolGroup()` no cleanup — memory leak *(15 min)*
- [ ] **P2** — `DicomViewerPage.tsx` → SSE error handler: `phase` → `phaseRef.current` (closure stale) *(5 min)*
- [ ] **P3** — `DicomViewerPage.tsx` → `imageIdsSet` (Set) para checagem O(1) de duplicatas em vez de `includes()` O(n) *(10 min)*
- [ ] **P4** — `DicomViewerPage.tsx` → `seriesLoadedRef` guard no `useEffect` de `loadSeries` *(5 min)*
- [ ] **P5** — `DicomViewerPage.tsx` → Listener `webglcontextlost` + botão "Recarregar visualizador" *(10 min)*
