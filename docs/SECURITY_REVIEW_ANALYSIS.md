# Análise de Segurança — PACS V4

**Data:** 11/04/2026  
**Baseado em:** REVIEW_PACS_V4_REVISADO.txt  
**Status:** Verificado contra o código real do repositório

---

## Resumo Executivo

O review de segurança é **substancialmente correto e bem fundamentado**. Todos os problemas críticos listados foram confirmados por leitura direta do código. O projeto tem uma base sólida (helmet.js, CORS restrito, rate limiting, bcrypt, audit log), mas possui vulnerabilidades cirúrgicas que precisam ser corrigidas antes de qualquer expansão funcional.

---

## Análise Item a Item

### ✅ CONFIRMADOS E PRECISOS

#### 1. Endpoints DICOM sem autenticação — `server/_core/index.ts`

As seguintes rotas **não têm nenhuma verificação de sessão**:

| Rota | Risco |
|---|---|
| `GET /api/dicom-cache-status/:studyUid` | Enumeração de estudos em cache |
| `GET /api/dicom-files/:studyUid/:filename` | Download de arquivo DICOM sem auth |
| `GET /api/dicom-files/:studyUid` | Listagem de arquivos sem auth |
| `GET /api/dicom-series/:studyUid` | Listagem de séries sem auth |
| `GET /api/dicom-thumbnail/:studyUid/:filename` | Thumbnail sem auth |
| `GET /api/dicom-export/:studyUid` | Exportação ZIP sem auth |
| `GET /api/dicom-cache-info` | Listagem global do cache sem auth |
| `DELETE /api/dicom-cache-clear` | Limpeza total do cache sem auth |

`/api/dicom-stream` já tem autenticação — correto conforme o review.

**Correção planejada:** Criar middleware `requireAuth` e aplicar em todas as rotas acima. `dicom-cache-clear` e `dicom-cache-info` devem ser restritos a `admin_master`.

---

#### 2. Proxy DICOMweb: resolução de unidade pela primeira ativa — `server/_core/index.ts` linha ~385

```typescript
const [unit] = await db.select().from(units)
  .where(eq(units.isActive, true))
  .limit(1); // ← primeira unidade ativa, não a do usuário
```

Cache global de 1 minuto (`cachedOrthancUrl`) compartilhado entre todos os usuários.  
CORS `Access-Control-Allow-Origin: '*'` no handler OPTIONS do DICOMweb (linhas 422 e 459).

**Correção planejada:** Autenticar usuário antes de proxiar; resolver Orthanc pela unidade do usuário; corrigir CORS do OPTIONS.

---

#### 3. XSS armazenado no editor de laudos

Nenhum uso de `DOMPurify` ou `sanitize-html` encontrado. O campo `body` é persistido diretamente e atribuído via `innerHTML` em:

- `ReportEditorPage.tsx` linhas 223, 237, 243, 247, 729
- `ReportDocument.tsx` linhas 86, 91, 96

**Correção planejada:**
- Backend (`reports.create`, `reports.update`): instalar `sanitize-html` e sanitizar `body` antes de persistir
- Frontend (`ReportDocument.tsx`): instalar `dompurify` e sanitizar antes de atribuir ao `innerHTML`

---

#### 4b. `admin.updateUser` sem validação de escopo de unidade — `server/routers.ts` linha ~1633

A procedure verifica apenas `role`, mas não verifica se o usuário-alvo pertence à unidade do `unit_admin`. Um `unit_admin` pode atualizar qualquer usuário do sistema se souber o ID.

#### 4c. `admin.toggleUserActive` sem validação de escopo — linha ~1687

Mesma ausência. `unit_admin` pode ativar/desativar qualquer usuário.

**Correção planejada:** Criar helper `assertUserInScope` e aplicar em `updateUser`, `toggleUserActive` e `setUserPermissions`.

---

#### 5. `anamnesis.getByStudyId` sem filtro de unidade — `server/routers.ts` linha ~1515

```typescript
const results = await db.select().from(anamnesis)
  .where(eq(anamnesis.study_instance_uid, input.study_instance_uid))
  .limit(1);
// ← sem filtro de unit_id, sem verificação de permissão view_anamnesis
```

**Correção planejada:** Filtrar por `unit_id` do usuário e verificar permissão `view_anamnesis`.

---

#### 6. Inconsistência de tipo em `expiration_date` — AGRAVADO

- Schema (`drizzle/schema.ts` linha 47): `date("expiration_date")` → string `YYYY-MM-DD`
- `updateUser` (linha ~1665): salva `d.getTime()` → BIGINT em milissegundos

**Problema adicional não mencionado no review:** O `AuthService.validateCredentials` **não verifica a expiração de conta em nenhum ponto**. Um usuário com `expiration_date` no passado consegue fazer login normalmente. Isso é um bug funcional independente da inconsistência de tipo.

**Correção planejada:**
- Padronizar `expiration_date` como string `YYYY-MM-DD` (Opção A do review)
- Adicionar verificação de expiração no `AuthService.validateCredentials`

---

#### 7. Credenciais hardcoded no `minio.ts` — `server/minio.ts`

```typescript
accessKey: process.env.MINIO_ACCESS_KEY || "lauds_admin",
secretKey: process.env.MINIO_SECRET_KEY || "Lauds@2026!Secure",
const endpoint = process.env.MINIO_ENDPOINT || "http://172.16.3.101:9000";
```

**Correção planejada:** Remover fallbacks com valores reais; lançar erro no boot se variáveis não estiverem configuradas; rotacionar credenciais imediatamente.

---

#### 11. IP interno exposto na resposta de erro do DICOMweb — `server/_core/index.ts` linha 485

```typescript
res.status(502).json({ 
  error: 'DICOMweb Proxy Error', 
  message: error.message,
  orthanc: 'http://172.16.3.241:8042' // ← IP interno exposto ao cliente
});
```

**Correção planejada:** Remover o campo `orthanc` da resposta; logar apenas no servidor.

---

### ⚠️ CONFIRMADOS COM CONTEXTO ADICIONAL

#### 4a. `admin.listUsers` sem filtro para multi-unidade

O filtro `if (ctx.user.role === 'unit_admin' && ctx.user.unit_id)` falha quando `unit_id` legado é null. Menos frequente para `unit_admin` (que normalmente tem `unit_id` preenchido), mas o risco existe.

#### 8. Permissões granulares com lacunas

`manage_templates` não é verificada em `templates.create`, `templates.update` e `templates.delete` — usam apenas verificação de `role`.

---

### ❓ NÃO CONFIRMADO (requer verificação adicional)

#### 4d. `admin.setUserPermissions` sem escopo de unidade

Não inspecionado em detalhe. Verificar antes de implementar a correção.

---

## Plano de Implementação

### Fase 1 — Segurança Imediata (implementar agora)

- [ ] **F1-1** Criar middleware `requireAuth` para rotas Express e aplicar nas 9 rotas DICOM sem autenticação
- [ ] **F1-2** Restringir `dicom-cache-clear` e `dicom-cache-info` a `admin_master`
- [ ] **F1-3** Instalar `sanitize-html` no backend e sanitizar `body` em `reports.create` e `reports.update`
- [ ] **F1-4** Instalar `dompurify` no frontend e sanitizar `innerHTML` em `ReportDocument.tsx` e `ReportEditorPage.tsx`
- [ ] **F1-5** Criar helper `assertUserInScope` e aplicar em `updateUser`, `toggleUserActive` e `setUserPermissions`
- [ ] **F1-6** Filtrar `anamnesis.getByStudyId` por `unit_id` e verificar permissão `view_anamnesis`
- [ ] **F1-7** Corrigir CORS do handler OPTIONS do DICOMweb (remover `Access-Control-Allow-Origin: *`)
- [ ] **F1-8** Remover IP interno da resposta de erro do DICOMweb proxy

### Fase 2 — Consistência (após Fase 1)

- [ ] **F2-1** Corrigir `getOrthancUrl` para resolver pela unidade do usuário autenticado
- [ ] **F2-2** Padronizar `expiration_date` como string `YYYY-MM-DD` em todo o stack
- [ ] **F2-3** Adicionar verificação de expiração de conta no `AuthService.validateCredentials`
- [ ] **F2-4** Remover credenciais hardcoded do `minio.ts` e adicionar validação no boot
- [ ] **F2-5** Filtrar `listAuditLog` e `listUsersWithPermissions` por unidade para `unit_admin`
- [ ] **F2-6** Verificar e aplicar `manage_templates` nas procedures de templates
- [ ] **F2-7** Verificar escopo em `setUserPermissions` (item 4d — pendente confirmação)

### Fase 3 — Sustentação (semanas seguintes)

- [ ] **F3-1** Refatorar `routers.ts` (2532 linhas) em módulos por domínio (`server/routers/`)
- [ ] **F3-2** Criar suíte de testes de autorização negativa (cross-unit, XSS, endpoints sem auth)
- [ ] **F3-3** Reduzir uso de `any` progressivamente ao refatorar módulos
- [ ] **F3-4** Padronizar tratamento de erro e remover detalhes internos das respostas

---

## Testes de Segurança a Criar (Fase 3)

```
- unit_admin tenta updateUser de usuário de outra unidade → deve falhar com 403
- unit_admin tenta toggleUserActive de usuário de outra unidade → deve falhar
- Usuário sem view_anamnesis tenta getByStudyId → deve falhar com 403
- Usuário de unidade A tenta acessar anamnese de estudo da unidade B → 403
- Payload XSS em report.body → deve ser sanitizado antes de persistir
- /api/dicom-export sem cookie de sessão → deve retornar 401
- /api/dicom-cache-clear sem autenticação → deve retornar 401
- unit_admin tenta setUserPermissions para unidade que não é a sua → 403
- Login com usuário com expiration_date no passado → deve falhar
```

---

## Referência de Permissões por Rota

| Rota | Permissão mínima | Status |
|---|---|---|
| `anamnesis.getByStudyId` | `view_anamnesis` | ❌ Não verificada |
| `/api/dicom-export/:studyUid` | `print_reports` + auth | ❌ Sem auth |
| `reports.create/update` | `edit_reports` | ✅ Verificada via role |
| `templates.create/update/delete` | `manage_templates` | ❌ Não verificada |
| `/api/dicom-stream/:studyUid` | `view_studies` + auth | ✅ Tem auth |
| `/api/dicom-cache-clear` | `admin_master` | ❌ Sem auth |
| `/api/dicom-cache-info` | `admin_master` | ❌ Sem auth |
