# Tarefas Pendentes — PACS Portal v4

Índice de documentos de tarefas e especificações pendentes de implementação.

---

## 1. CORRECOES_ADMIN_PENDENTES.txt
**Setor:** Admin & Usuários | **Estimativa:** ~28 min | **Status:** ✅ Concluído (commit ebf0826)

- [x] C1 — URGENTE: `deleteUser` captura dados antes do DELETE + audit log `DELETE_USER`
- [x] C2 — `toggleUserActive`: audit log `ACTIVATE_USER` / `DEACTIVATE_USER`
- [x] C3 — `GROUP_PERMISSIONS` extraído para constante única no topo do arquivo
- [x] C4 — `createUserScoped`: validação de formato do username com regex

---

## 2. CORRECOES_VIEWER_DICOM_V2.txt
**Setor:** Visualizador DICOM | **Estimativa:** ~45 min | **Status:** ✅ Concluído (commit 7a5dbb2)

- [x] P1 — Memory leak: `toolGroupIdRef` + `destroyToolGroup` no cleanup
- [x] P2 — Closure stale SSE: `phase` → `phaseRef.current` no error handler
- [x] P3 — Duplicatas O(n): `imageIdsSetRef` (Set) para checagem O(1) + `clear()` no reset
- [x] P4 — Guard `seriesLoadedRef` no `loadSeries` + reset no `startStreamingViewer`
- [x] P5 — Listener `webglcontextlost` / `webglcontextrestored` após `enableElement`

---

## 3. CORRECOES_SETOR_AUTH_RBAC.txt
**Setor:** Autenticação & RBAC | **Estimativa:** ~65 min | **Status:** ⏳ Pendente

- [ ] P1 — Renomear `canAccessUnit` duplicado (versão sem banco)
- [ ] P2 — Corrigir `PERMISSIONS_MATRIX` inconsistente
- [ ] P3 — Audit log em `updateUserRole`
- [ ] P4 — Guard de `unit_admin` em procedures de unidade
- [ ] P5 — Corrigir `PERMISSIONS_MATRIX` para `unit_admin`
- [ ] P6 — Remover código morto do `AuthService`
- [ ] P7 — `sameSite: 'Lax'` em produção

---

## 4. ESPECIFICACAO_FUNCIONALIDADE_LAUDAR.txt
**Setor:** Editor de Laudos | **Estimativa:** 2-3 dias | **Status:** ⏳ Pendente

### Prioridade 1 — Seeds de Templates (maior impacto)
- [ ] Criar `drizzle/0037_seed_templates_completos.sql` com 60 templates globais
  - 14 templates RX (Tórax, Coluna, Joelho, Ombro, Pé, Mão, Pelve, Crânio, Seios da Face, Abdome)
  - 14 templates TC (Crânio, Tórax, Abdome/Pelve, Coluna, Seios da Face)
  - 16 templates US (Abdome, Pelve, Obstétrico, Tireoide, Rins, Testículos, Mama, Ombro, Doppler)
  - 16 templates RM (Crânio, Coluna, Joelho, Ombro, Quadril, Tornozelo, Pelve)

### Prioridade 2 — Campo `category` na tabela `templates`
- [ ] Criar `drizzle/0038_templates_add_category.sql` com `ALTER TABLE`
- [ ] Atualizar `drizzle/schema.ts` com campo `category`
- [ ] Atualizar `server/routers/templates.ts` (input + listGlobal ordenado)
- [ ] Atualizar seeds com `category` preenchido

### Prioridade 3 — Auto-sugestão de template pelo exame
- [ ] Passar `currentModality` e `currentExamTitle` como props para `ConteudoTab`
- [ ] Implementar `MODALITY_MAP` (CT→TC, MR→RM, CR/DX→RX, US→US)
- [ ] Filtrar e destacar templates sugeridos no topo da `TemplatesTab`

### Prioridade 4 — Simplificar criação de template pessoal
- [ ] Adicionar botão "Salvar como template" na barra de ações do editor
- [ ] Implementar dialog simples (apenas nome) + `handleSaveAsTemplate`
- [ ] Remover formulário de 4 campos de dentro da `TemplatesTab`

### Prioridade 5 — CSS de seções h3 no editor
- [ ] Adicionar CSS `[contenteditable] h3` com cor azul, borda inferior e uppercase

### Prioridade 6 — Tela administrativa de templates
- [ ] Criar `client/src/pages/TemplateManagerPage.tsx`
- [ ] Rota `/admin/templates` em `App.tsx`
- [ ] Link em `AdminPage.tsx`

---

*Última atualização: 09/05/2026*
