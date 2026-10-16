# Achado — Criação de usuários: bug funcional (unit_admin) e proposta de aparência

**Data:** 2026-10-15
**Branch:** `claude/achado-criacao-usuarios-funcao-e-aparencia`
**Autor:** Claude (auditoria de código a pedido do Alessandro)
**Status:** 🟢 CORRIGIDO (função) — ver ADENDO (2026-10-15) ao final. Aparência permanece deliberadamente fora deste branch, conforme parecer da Manus.

Contexto: ao homologar em produção a correção do achado `removeDoctor` (branch `claude/achado-removedoctor-sem-escopo-unidade`), o Alessandro criou manualmente um usuário `unit_admin` de teste pela tela "Novo Usuário" do admin. Isso levantou a suspeita de que essa tela tem problemas — confirmados abaixo.

---

## 1. Achado de função — `unit_admin` não consegue criar usuário pela interface

### 1.1 O que acontece

A aba "Usuários" do painel de administração é acessível tanto para `admin_master` quanto para `unit_admin` (`client/src/pages/AdminPage.tsx`, linha ~943: `canManageUsers = isAdminMaster || isUnitAdmin`). Um `unit_admin` consegue abrir normalmente o modal "Novo Usuário" (`UserFormDialog.tsx`), preencher todos os campos e clicar em "Criar Usuário".

A submissão aciona `handleSaveUser` → `createUser.mutate(...)`, que chama a procedure `trpc.auth.createLocalUser` (definida em `server/routers.ts`, linha ~87):

```ts
createLocalUser: adminProcedure
  .input(z.object({
    username: z.string().min(3).max(64),
    email: z.string().email().optional(),
    name: z.string().min(1),
    password: z.string().min(6),
    role: z.enum(['admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'atendente', 'responsavel_financeiro']),
    unit_id: z.number().optional(),
  }))
  .mutation(async ({ input }) => { ... })
```

`adminProcedure` (em `server/_core/trpc.ts`) libera **exclusivamente** `role === 'admin_master'`:

```ts
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    if (!ctx.user || ctx.user.role !== 'admin_master') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    ...
  }),
);
```

Resultado: todo `unit_admin` que tenta criar um usuário recebe `403 FORBIDDEN` sem explicação clara — só um toast genérico de erro — mesmo tendo acesso visual completo à função.

### 1.2 Por que a tela parece ter sido pensada para `unit_admin` também

`UserFormDialog.tsx` tem lógica condicional específica para diferenciar `admin_master` de outros perfis — por exemplo, o campo "Carimbo do Médico" só aparece se `currentUserRole === "admin_master"` (linha ~445), o que sugere que o resto do formulário foi desenhado para também ser usado por `unit_admin`, só que sem nunca ter funcionado de ponta a ponta para esse perfil.

### 1.3 A causa raiz: existe a procedure certa, mas ela é código morto

O backend já tem uma procedure corretamente desenhada para isso — `admin.createUserScoped` (`server/routers/admin.ts`, linha ~774) — que:

- Aceita `unitId` e, quando o chamador é `unit_admin`, valida escopo (`getUserUnitPermission`) antes de criar;
- Usa `groupKey` para aplicar as permissões corretas por grupo (buscadas do banco, com fallback para a constante `GROUP_PERMISSIONS`);
- Insere a vinculação em `user_unit_permissions` na mesma operação;
- Configura automaticamente a cadeia financeira (`financial_responsibles` / vínculos) quando o grupo é `responsaveisFinanceiros`, evitando o tipo de bug já visto antes nesta auditoria (tela vazia para responsável financeiro recém-criado);
- Grava o audit log.

**Essa procedure nunca é chamada por nenhum componente do frontend** (`grep -rln "createUserScoped" client/src` não retorna nenhum resultado). A tela usa `auth.createLocalUser`, que é mais simples, não tem checagem de escopo por unidade, não aplica permissões nem configura a cadeia financeira — depende de chamadas adicionais e separadas do frontend para isso (ver 1.4).

### 1.4 Problema adicional: criação não é atômica, mesmo para `admin_master`

Mesmo quando funciona (`admin_master`), `handleSaveUser` dispara até 4 mutations tRPC separadas e independentes, sem transação nem tratamento de falha parcial:

```ts
createUser.mutate({...}, {
  onSuccess: (result) => {
    if (newUserId && data.permissions?.length > 0) setPermissions.mutate({...});
    if (newUserId && anyData._stampFile) updateStamp.mutate({...});
    if (newUserId && anyData._signatureFile) updateMedical.mutate({...});
    else if (newUserId && anyData.crm) updateMedical.mutate({...});
  },
});
```

Se `createUser` tiver sucesso mas `setPermissions` falhar (rede, validação, etc.), o usuário fica criado **sem nenhuma permissão em nenhuma unidade** — e o único sinal disso é um toast de erro que passa despercebido, sem retry nem qualquer forma de recuperação. O mesmo vale para carimbo/assinatura/CRM perdidos silenciosamente numa falha pontual.

### 1.5 Impacto

- Função quebrada: `unit_admin` não consegue criar usuário nenhum pela interface, para nenhuma unidade, mesmo tendo acesso à tela.
- Mesmo o caminho que funciona (`admin_master`) tem risco de criar usuários com dados parcialmente salvos, sem aviso persistente.
- Não é uma falha de segurança (o bloqueio do `unit_admin` é, por acidente, "seguro" — ele simplesmente não consegue fazer nada), mas é um bug funcional relevante: a função mais básica de administração de uma unidade está indisponível para quem deveria administrá-la.

---

## 2. Relato de aparência — modal "Novo Usuário" / "Editar Usuário"

Observação visual sobre `UserFormDialog.tsx`, a partir do uso real (print enviado pelo Alessandro durante a criação do usuário de teste):

- O modal usa um `<select>` HTML nativo, sem estilo, para o campo "Perfil" — destoa do resto da interface, que já usa componentes com ícone/cor por tipo em outras telas (como o padrão visual já aplicado ao módulo Financeiro).
- Não há nenhuma indicação visual do que cada perfil pode fazer no momento da escolha (o usuário só descobre depois, ou nem descobre).
- Duas abas (`Dados` / `Unidades`) para um formulário relativamente curto — pode estar fragmentando desnecessariamente um fluxo que caberia em uma tela só, especialmente para o caso mais comum (criar um usuário simples para uma unidade).
- Área de espaço vazio considerável entre o cabeçalho do modal e o início dos campos "Nome"/"Email" no estado inicial (percebido no print do Alessandro).
- As cores por perfil já existem (`ROLE_COLORS`), mas só aparecem como badge pequeno ao lado do título quando em edição — não aparecem associadas a cada opção no dropdown do seletor de perfil.

### 2.1 O que ainda não foi decidido

Nenhuma direção de redesign foi escolhida ainda. As opções discutidas com o Alessandro:

1. Manter as duas abas, só refinar o visual (substituir o `<select>` nativo por um componente com cor/ícone por perfil, reduzir espaços vazios, aproximar do padrão visual já usado no Financeiro).
2. Consolidar em uma tela única, sem abas, reorganizando os campos por prioridade de uso.

---

## 3. O que ainda NÃO foi feito (intencionalmente)

Nenhuma alteração de código foi feita neste branch — nem no bug funcional, nem na aparência. Este documento existe para registrar os dois achados juntos, como pedido, antes de qualquer implementação. Pontos em aberto para decidir antes de codificar:

1. **Caminho da correção funcional** — ligar a tela diretamente a `admin.createUserScoped` (adaptando o payload do frontend ao contrato dela: `unitId` obrigatório + `groupKey` em vez de lista de permissões granular), ou abrir uma nova procedure `unitAdminProcedure`-compatível que replique o comportamento de `createLocalUser` com a checagem de escopo e o resto do fluxo (permissões, cadeia financeira) — e então decidir o que fazer com `createUserScoped`, hoje código morto (reaproveitar, ou remover se a decisão for outra).
2. **Atomicidade** — se a correção deve também resolver a cadeia de mutations não-atômica (ex.: mover a lógica de permissões/stamp/signature para dentro da própria procedure de criação, numa transação).
3. **Direção de aparência** — qual das duas opções do item 2.1 (ou outra) o Alessandro prefere, antes de qualquer mudança visual.
4. **Prioridade** — se o bug funcional deve ser tratado com urgência (já que `unit_admin` está sem essa função desde sempre, aparentemente) ou se pode esperar outros itens pendentes.

---

## ADENDO (2026-10-15) — Implementação conforme o parecer técnico da Manus

A Manus revisou este achado em `Parecer técnico — correção da criação de usuários.md` e reprovou explicitamente a correção simples ("trocar a mutation do frontend para `admin.createUserScoped`"), por 6 incompatibilidades de contrato (unidade única, papéis incompletos, `role`/`groupKey` sem validação cruzada, campos faltando, não-atomicidade, grupo `administradoresUnidade` sem papel correspondente). Em vez disso, prescreveu uma procedure canônica nova. Esta seção documenta a implementação ponta a ponta, autorizada por Alessandro ("faça").

### A1. Nova função transacional — `server/db.ts` → `createUserTransactional`

Substitui, para este fluxo, a composição de `createLocalUser` + `setUserPermissions` + cadeia financeira solta. Uma única `db.transaction(...)` grava, na ordem: `users` → `user_unit_permissions` (uma linha por unidade) → `audit_log` (`CREATE_USER` com `metadata: {role, groupKey, unitIds}`) → quando `groupKey === 'responsaveisFinanceiros'`, para cada unidade: reaproveita o `financial_responsible_units` já ativo da unidade (mesma janela de vigência de `getActiveResponsibleForUnit`) ou cria `financial_responsibles` + `financial_responsible_units` novos, sempre seguido de `financial_responsible_users` + um segundo `audit_log` (`GRANT_FINANCIAL_RESPONSIBLE_ACCESS`). Qualquer falha em qualquer uma dessas etapas reverte TUDO — inclusive o `INSERT` em `users` já feito antes dela.

```ts
export class UsernameTakenError extends Error { /* ... */ }

export async function createUserTransactional(
  input: CreateUserTransactionalInput,
): Promise<{ id: number }> {
  const db = await getDb();
  try {
    const newUserId = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users)
        .where(eq(users.username, input.username)).limit(1);
      if (existing.length > 0) throw new UsernameTakenError();
      const insertUserResult = await tx.insert(users).values({ /* ... */ });
      const userId = Number(insertUserResult[0].insertId);
      if (input.unitIds.length > 0) await tx.insert(user_unit_permissions).values(/* ... */);
      await tx.insert(audit_log).values({ action: 'CREATE_USER', /* ... */ });
      if (input.groupKey === 'responsaveisFinanceiros') { /* cadeia financeira, ver acima */ }
      return userId;
    });
    return { id: newUserId };
  } catch (err: any) {
    if (err instanceof UsernameTakenError) throw err;
    if (err?.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(String(err?.message ?? ''))) {
      throw new UsernameTakenError();
    }
    throw err;
  }
}
```

Não existe valor de `audit_log.action` para "vincular unidade a responsável financeiro" (enum fechado do MySQL — ver `drizzle/schema.ts`), então essa informação vai como `metadata` JSON de um `GRANT_FINANCIAL_RESPONSIBLE_ACCESS`, em vez de inventar um valor de enum não suportado pelo banco.

### A2. Nova procedure — `server/routers/admin.ts` → `admin.createUser`

Substitui `auth.createLocalUser` como mutation usada pela tela. Valida, nesta ordem: (1) chamador é `admin_master` ou `unit_admin`; (2) coerência `role ↔ groupKey` via mapa fixo (`medico→medicos`, `unit_admin→administradoresUnidade`, `admin_master→adminsMaster`, etc.) — rejeita combinação incoerente com `BAD_REQUEST`; (3) todo papel exceto `admin_master` exige pelo menos 1 unidade; (4) se o chamador é `unit_admin`: não pode criar `unit_admin`/`admin_master` (`FORBIDDEN`), deve informar exatamente 1 unidade, e essa unidade precisa estar no seu escopo (`unit_id` legado OU `getUserUnitPermission`) — senão `FORBIDDEN`. `admin_master` não tem nenhuma dessas restrições (papel livre, 0+ unidades). As permissões do grupo vêm de `getGroupPermissions()` (banco), com fallback para a constante `GROUP_PERMISSIONS` só se o banco estiver vazio — nunca dos booleans que o cliente mandar. Por fim chama `createUserTransactional`, traduzindo `UsernameTakenError` em `TRPCError({code:'CONFLICT', ...})` com mensagem legível.

`auth.createLocalUser` foi deliberadamente **mantida intacta** (migração gradual, conforme pedido pela Manus) — não é mais chamada pela tela, mas segue disponível.

### A3. Frontend

- **`client/src/pages/AdminPage.tsx`**: `createUser` agora usa `trpc.admin.createUser.useMutation`. O payload de criação passou a ser `{username, name, email, password, role, groupKey, unitIds, isActive, expiration_date}` — `unitIds` vem de `data.permissions.map(p => p.unit_id)` (suporta multiunidade para `admin_master`). O antigo segundo `setPermissions.mutate(...)` na criação foi **removido**: as permissões já são gravadas pela própria transação, de acordo com o grupo — o cliente não tem mais como sobrescrevê-las com booleans livres. Upload de carimbo/assinatura continua como etapa explícita pós-criação (depende de storage de arquivo, fora da transação SQL), exatamente como recomendado.
  `handleNewUserForUnit(unitId, ...)` — antes descartava `unitId` (parâmetro prefixado `_unitId`, nunca lido) — agora grava num novo estado `forcedUnitId` e o repassa ao modal.
  `UsersPermissionsTab` e `UserFormDialog` passam a receber `currentUserRole={currentUser?.role}`.
- **`client/src/components/UserFormDialog.tsx`**: lista de papéis (`visibleRoles`) filtra `admin_master`/`unit_admin` quando `currentUserRole === "unit_admin"`. Seleção de unidade (`toggleUnit`) vira single-select quando o chamador é `unit_admin` (marcar outra unidade substitui a anterior, não acumula). Nova prop `forcedUnitId` pré-seleciona a unidade de contexto ao abrir "Novo usuário" a partir de uma unidade específica. `handleSave` agora inclui `groupKey` (derivado de `role` por um mapa fixo local) no payload enviado a `onSave`.
- **`client/src/components/UsersPermissionsTab.tsx`**: nova prop `currentUserRole`; o botão "Excluir" (desktop e mobile) só renderiza quando `currentUserRole === "admin_master"` — `admin.deleteUser` já era exclusiva de `admin_master` no backend, a UI é que mostrava um botão inoperante para `unit_admin`. "Remover vínculo da unidade" (`removeUserUnitLink`) continua disponível para ambos, sem alteração.

Aparência (cores/ícones no seletor de perfil, consolidação de abas) permanece **fora deste branch**, conforme recomendação explícita da Manus — fica para uma branch visual separada e opcional.

### A4. Testes de regressão (17 do parecer, em 3 arquivos, 21 casos)

- `server/admin-create-user-authorization.test.ts` (9 casos) — nível procedure, `./db` mockado, `appRouter.createCaller`: cobre autorização/escopo 1-6 (unit_admin na unidade legada, unit_admin em unidade concedida via `user_unit_permissions`, unidade externa → FORBIDDEN sem escrita, criar admin/unit_admin → FORBIDDEN sem escrita, admin_master livre e multiunidade, papel/grupo incoerente → BAD_REQUEST sem escrita) + não-admin rejeitado + permissões vindas do banco (item 7 parcial) + CONFLICT legível na checagem prévia (item 9 parcial).
- `server/create-user-transactional.test.ts` (6 casos) — nível `db.ts`, função REAL contra fake de `drizzle-orm/mysql2` com transação de verdade (mesma técnica de `audit-fixes-gestao-usuarios-responsavel.test.ts`): rollback real quando audit log falha (item 8), rollback real quando a cadeia financeira falha, violação REAL de índice único no INSERT de `users` — não só a checagem prévia (item 9), cadeia de responsável financeiro consistente de ponta a ponta + reaproveitamento do responsável já ativo da unidade (item 10), `isActive`/`expiration_date` persistidos exatamente como enviados (item 11).
- `server/create-user-interface-wiring.test.ts` (6 casos) — checagem de source dos arquivos `.tsx" (mesmo padrão do teste "H" em `units-doctor-scope.test.ts`, já que o projeto não tem testing-library configurado): unitId repassado ao modal (item 12), papéis filtrados + unidade travada para unit_admin (item 13), tela não chama mais `auth.createLocalUser` (item 14), lista de usuários é refeita após sucesso (item 15), botão Excluir oculto + remoção de vínculo preservada (item 16), regressão admin_master multiunidade + upload pós-criação preservado (item 17).

Prova de que são testes reais: `git stash` das 5 mudanças de implementação (mantendo só os 3 arquivos de teste) e rodar os 3 arquivos — **as 21 asserções falharam** (`createUserTransactional is not a function`, `trpc.auth.createLocalUser` ainda presente, `FORBIDDEN` esperado nunca lançado, etc.); `git stash pop` restaurou a implementação e todos os 21 voltaram a passar.

### A5. Validação completa

- `pnpm check` — sem erros em nenhum momento desta implementação.
- `pnpm test` (suíte completa, `TZ=UTC`): **869 passed / 11 failed / 1 skipped** (881 total) — os mesmos 11 pré-existentes, nos mesmos 7 arquivos já documentados nesta auditoria (`exam-catalog-security.test.ts`, `finance-v2-dashboard.test.tsx` ×2, `mediaProxy.test.ts`, `pacs-desktop-download-progress.test.ts`, `pacs.mobile-ui.test.ts`, `security.auth.test.ts`, `study-priority-ui.test.ts` ×4). 848 (baseline anterior desta branch) + 21 novos testes = 869 — bate exato.
- `pnpm build` — build de produção concluído sem erros (client + server).
- `git diff --check origin/main...HEAD` — limpo, sem resíduos de whitespace.

### A6. Pendente / decisão operacional

- Esta branch (`claude/achado-criacao-usuarios-funcao-e-aparencia`) está pronta para revisão da Manus antes de qualquer merge/deploy — nenhuma dessas ações foi executada por mim.
- `auth.createLocalUser` segue viva, intencionalmente, até a Manus confirmar que não há consumidor externo que dependa dela.
- O item "aparência" deste achado (seção 2 acima) permanece em aberto, para uma branch futura e opcional.

---

## ADENDO — resposta ao parecer corretivo de 2026-10-15 ("não aprovada para merge ou implantação")

A Manus revisou o commit `f23540a94646a82b1412a5146af0eeb3c3fbd6b2` e apontou 3 bloqueios e 2 reforços complementares. Todos os 5 pontos foram confirmados no código real antes de qualquer alteração, e todos foram corrigidos e testados nesta branch — sem tocar `main`, sem atualizar VM1, sem criar usuário real.

### B1. Bloqueio 1 — `view_financial` descartado na criação canônica

Confirmado: `admin.createUser` montava `perms` sem o campo `view_financial`, e `CreateUserTransactionalInput.permissions` nem o declarava — o insert em `user_unit_permissions` caía no default físico da tabela (`false`), ignorando a matriz configurada em `group_permission_configs` (migration 0046).

Corrigido: `view_financial: boolean` adicionado ao tipo `CreateUserTransactionalInput.permissions`; `admin.createUser` agora inclui `view_financial: (dbPerm as any).view_financial ?? false` no mapeamento vindo do banco; `GROUP_PERMISSIONS` (fallback hardcoded) ganhou `view_financial` em todas as entradas, `true` para `responsaveisFinanceiros`/`adminsMaster` e `false` nas demais, consistente com a migration 0046; `createUserTransactional` persiste o campo junto com as demais permissões em `tx.insert(user_unit_permissions)`.

Testado em `server/create-user-transactional.test.ts` (teste 10, asserção nova: `uupRows[0].view_financial === true`) e em `server/admin-create-user-authorization.test.ts` (dois testes novos: configuração do banco com `view_financial=true` chega a `createUserTransactional`; ausência de configuração usa o fallback hardcoded previsível).

### B2. Bloqueio 2 — lista visível não atualizava após criar a conta

Confirmado: `UsersPermissionsTab.tsx` roda sua própria `trpc.admin.listUsersWithPermissions.useQuery()`; `AdminPage.tsx` chamava só `refetchUsers()`, que invalida `admin.listUsers` — consulta diferente, que não alimenta a tabela visível. O toast de sucesso aparecia, mas a conta só surgia na tela depois de navegar/recarregar.

Corrigido: `onSuccess` da mutation `createUser` em `AdminPage.tsx` agora usa `trpc.useUtils()` e chama `await utils.admin.listUsersWithPermissions.invalidate()` e `await utils.admin.listUsers.invalidate()` — invalidação central, sem acoplar componentes por callback.

Testado em `server/create-user-interface-wiring.test.ts` (teste 15 reescrito): prova que a query `admin.listUsersWithPermissions.invalidate()` é chamada no `onSuccess`, substituindo a checagem antiga (que só procurava `refetchUsers()`).

### B3. Bloqueio 3 — multiunidade de `responsavel_financeiro` conflitava com a regra de responsável único

Confirmado: a migration 0062 tornou `financial_responsible_users.user_id` único; o laço antigo resolvia/criava responsável POR unidade e inseria em `financial_responsible_users` uma vez por unidade — se duas unidades tivessem responsáveis ativos diferentes, a segunda inserção violava o índice único e surgia como erro genérico de banco.

Corrigido, seguindo a política conservadora recomendada pela Manus: antes de qualquer escrita, `createUserTransactional` resolve o responsável ativo de TODAS as unidades selecionadas; permite multiunidade somente quando todas já pertencem ao mesmo responsável, ou quando NENHUMA tem responsável (cria um único novo para o conjunto); rejeita o caso misto e o caso de responsáveis distintos com a nova classe `MixedFinancialResponsiblesError`, traduzida por `admin.createUser` em `TRPCError({code:'BAD_REQUEST', message: err.message})`. O índice único `uq_resp_user_id` não foi tocado; nunca há mais de uma inserção em `financial_responsible_users` por usuário.

Testado em `server/create-user-transactional.test.ts` (4 casos novos, nível `db.ts`, com fake de driver que distingue responsável ativo por unidade): duas unidades com o mesmo responsável → multiunidade permitida, um único vínculo; duas unidades com responsáveis distintos → `MixedFinancialResponsiblesError`, nada persistido; caso misto (uma com responsável, outra sem) → mesma rejeição; nenhuma unidade com responsável → cria um único novo responsável para o conjunto, uma `financial_responsible_units` por unidade, um único `financial_responsible_users`. E em `server/admin-create-user-authorization.test.ts` (nível router): `MixedFinancialResponsiblesError` → `BAD_REQUEST` legível.

### B4. Reforço 5.1 — IDs de unidade válidos, únicos e existentes

Confirmado: o input aceitava `z.array(z.number())` (decimais, negativos, duplicados passavam) e não havia checagem de existência antes da transação.

Corrigido: `unitIds: z.array(z.number().int().positive()).default([]).refine(...)` rejeita duplicatas explicitamente (nunca dedup silencioso); novo bloco em `admin.createUser` consulta a tabela `units` antes da transação e retorna `NOT_FOUND` nomeando o(s) ID(s) ausente(s). Decisão deliberada de ordenação: essa checagem roda DEPOIS do bloco de escopo de `unit_admin` — um chamador sem acesso a uma unidade recebe `FORBIDDEN` ali, sem que a checagem de existência chegue a revelar se aquele ID sequer existe.

Testado em `server/admin-create-user-authorization.test.ts`: unidade inexistente → `NOT_FOUND`, `createUserTransactional` nunca chamado; IDs duplicados → rejeição no próprio input, `createUserTransactional` nunca chamado.

### B5. Reforço 5.2 — unidade forçada não travava de verdade para `unit_admin`

Confirmado: o componente limitava a seleção a uma unidade, mas ainda permitia desmarcar a unidade forçada (`forcedUnitId`) e escolher outra dentro do escopo.

Corrigido: nova condição `unitSelectionLocked = currentUserRole === "unit_admin" && forcedUnitId != null` em `UserFormDialog.tsx`; `toggleUnit` recusa qualquer mudança quando travado (defesa em profundidade); o `Checkbox` de cada unidade recebe `disabled={unitSelectionLocked}` — a trava deixou de ser cosmética.

Testado em `server/create-user-interface-wiring.test.ts` (teste novo): prova via source que `unitSelectionLocked`, o early-return em `toggleUnit` e o `disabled` no checkbox existem e estão conectados.

### B6. Prova de que os testes são reais (stash/pop)

`git stash push --keep-index` nos 4 arquivos de implementação (`server/db.ts`, `server/routers/admin.ts`, `client/src/pages/AdminPage.tsx`, `client/src/components/UserFormDialog.tsx`), mantendo só os 3 arquivos de teste modificados. Rodando os 3 arquivos contra a implementação ANTIGA: **11 das novas/alteradas asserções falharam** exatamente nos pontos esperados (view_financial ausente, NOT_FOUND/duplicata não implementados, `MixedFinancialResponsiblesError` inexistente, `unitSelectionLocked` inexistente). `git stash pop` restaurou a implementação — todos os 31 testes dos 3 arquivos voltaram a passar.

### B7. Validação completa (sequência exata pedida pelo parecer)

- `pnpm check` — sem erros.
- `TZ=UTC pnpm vitest run server/admin-create-user-authorization.test.ts server/create-user-transactional.test.ts server/create-user-interface-wiring.test.ts` — **31 testes passando** (14 + 10 + 7; eram 9 + 6 + 6 = 21 antes deste parecer).
- `TZ=UTC pnpm test` (suíte completa) — **879 passed / 11 failed / 1 skipped** (891 total). Os 11 failed são os mesmos 7 arquivos pré-existentes já documentados nesta auditoria (`exam-catalog-security.test.ts`, `finance-v2-dashboard.test.tsx` ×2, `mediaProxy.test.ts`, `pacs-desktop-download-progress.test.ts`, `pacs.mobile-ui.test.ts`, `security.auth.test.ts`, `study-priority-ui.test.ts` ×4) — nenhuma regressão nova. 869 (baseline anterior) + 10 testes novos deste parecer = 879, bate exato.
- `pnpm build` — build de produção concluído sem erros.
- `git diff --check origin/main...HEAD` — limpo.

### B8. Decisão operacional

Esta branch (`claude/achado-criacao-usuarios-funcao-e-aparencia`) está pronta para nova revisão da Manus. Nenhum merge em `main`, atualização de VM1 ou criação de usuário real foi executado — conforme a decisão explícita do parecer corretivo.

---

## ADENDO 2 — resposta ao parecer de revisão (commit 892315d), 2026-10-15

A Manus revisou o commit `892315d` (a correção dos 3 bloqueios + 2 reforços do ADENDO anterior) e apontou 2 bloqueios novos, 1 bloqueio de arquitetura e 1 correção de segurança de credencial. Veredito: **não aprovada para merge nem implantação nesta revisão.** Todos os 4 pontos foram confirmados no código real antes de qualquer alteração, e todos foram corrigidos e testados nesta mesma branch — sem tocar `main`, sem VM.

### C1. Bloqueio 1 — unit_admin podia conceder acesso financeiro a outras unidades

Confirmado: a checagem de escopo de `unit_admin` em `admin.createUser` só validava que a(s) unidade(s) do `unitIds` estavam no escopo do chamador — mas para `responsavel_financeiro`, `createUserTransactional` reaproveita o responsável **ativo** já existente da unidade (política de multiunidade do ADENDO anterior), e esse responsável pode controlar outras unidades fora do escopo desse `unit_admin`. O vínculo final (`financial_responsible_users`) é com o responsável, não com a unidade específica — e as guardas financeiras (`assertCanAccessFinancialUnit` etc.) autorizam por responsável, não por `user_unit_permissions`. Um `unit_admin` de A, criando uma conta em A cujo responsável já controla B, criava sem querer uma conta com acesso financeiro a B.

Corrigido: `admin.createUser` e `admin.createUserScoped` agora rejeitam, com `FORBIDDEN`, qualquer tentativa de um `unit_admin` criar ou conceder acesso ao papel `responsavel_financeiro` — independentemente de a unidade estar ou não no escopo dele. Apenas `admin_master` pode criar esse papel. A opção `responsavel_financeiro` também foi removida de `visibleRoles` em `UserFormDialog.tsx`, para que um `unit_admin` nem veja essa opção no formulário. Isso segue a recomendação de menor privilégio do parecer: até existir um modelo de autorização conta-de-responsável × unidade, a concessão desse papel é exclusiva do `admin_master`.

Testado em `server/admin-create-user-authorization.test.ts`: unit_admin tentando criar responsavel_financeiro na própria unidade → `FORBIDDEN`, zero escrita; admin_master continua podendo criar normalmente; mesma restrição replicada e testada em `admin.createUserScoped`. Testado em `server/create-user-interface-wiring.test.ts`: a opção é removida de `visibleRoles` para `unit_admin`.

### C2. Bloqueio 2 — permissões individuais da tela eram descartadas na criação

Confirmado: `UserFormDialog` sempre mostrou checkboxes editáveis de permissão por unidade, mas `AdminPage.tsx` só enviava `unitIds` (derivados de `data.permissions`) para `admin.createUser` — os toggles que o administrador ajustou (`view_studies`, `print_reports` etc.) eram descartados, e a criação sempre aplicava a matriz do grupo inteira. Um administrador podia desmarcar uma permissão na tela, a conta ser criada com ela mesmo assim.

Corrigido, pela política recomendada pelo parecer (preservar permissões individuais): `admin.createUser` ganhou um campo opcional `permissions` (lista de toggles por unidade, só os 6 campos que a tela realmente exibe — `view_studies`, `edit_reports`, `view_anamnesis`, `edit_anamnesis`, `edit_exam_legend`, `print_reports`). Quando presente, precisa cobrir **exatamente** o mesmo conjunto de `unitIds` (nem mais, nem menos — senão `BAD_REQUEST`), e cada unidade grava suas próprias permissões (sobrepondo a matriz do grupo campo a campo). `manage_templates` e `view_financial`, sem controle na tela, continuam vindo sempre da matriz do grupo. `AdminPage.tsx` agora envia `permissions: data.permissions` na criação. `createUserTransactional` passou a receber `permissionsByUnit` (um mapa unidade → permissões) em vez de um único objeto uniforme aplicado a todas as unidades.

Testado em `server/admin-create-user-authorization.test.ts`: toggles individuais sobrepõem a matriz do grupo campo a campo, com `manage_templates`/`view_financial` ainda vindo do grupo; ausência de `permissions` preserva o comportamento anterior (matriz inteira, back-compat); `unit_id` em `permissions` fora de `unitIds`, ou faltando uma unidade, é rejeitado com `BAD_REQUEST` sem escrita. Testado em `server/create-user-transactional.test.ts`: fixture e asserções atualizadas para `permissionsByUnit`.

### C3. Bloqueio de arquitetura — admin.createUserScoped continuava como caminho alternativo inseguro

Confirmado: o endpoint legado `admin.createUserScoped` ainda aceitava `unit_admin` e o papel `responsavel_financeiro`, criava usuário/permissões/cadeia financeira em chamadas separadas (não transacional) e **capturava e engolia** qualquer falha da cadeia financeira (`catch { console.error(...) }`), podendo devolver sucesso com uma conta de responsável financeiro incompleta. Também não herdava nenhuma das validações novas (coerência papel↔grupo, existência de unidade, política de multiunidade).

Corrigido pela primeira opção recomendada pelo parecer: `createUserScoped` agora delega integralmente para `createUserTransactional` e para a mesma política de autorização de `admin.createUser` — incluindo a restrição do Bloqueio 1 (C1 acima) e a checagem de coerência papel↔grupo e existência de unidade. Não existe mais nenhuma escrita própria nesse endpoint; ele é um wrapper fino. Mantido só por compatibilidade com um eventual chamador direto via tRPC (a tela não o usa).

Testado em `server/admin-create-user-authorization.test.ts` (5 casos, chamando `caller.admin.createUserScoped` diretamente, não apenas confirmando que o frontend não o referencia): unit_admin tentando responsavel_financeiro → `FORBIDDEN`; chamada válida delega de fato para `createUserTransactional`; papel/grupo incoerente → `BAD_REQUEST`; unidade inexistente → `NOT_FOUND`; username duplicado → `CONFLICT` legível (mesma tradução de erro de `admin.createUser`).

### C4. Correção de segurança de credencial — validação estrita de expiration_date

Confirmado: `admin.createUser` validava `expiration_date` só com `z.string()` e convertia com `new Date(input.expiration_date)` — e `new Date('2026-02-30').toISOString()` devolve `2026-03-02T00:00:00.000Z` sem erro nenhum, normalizando silenciosamente uma data impossível. Além disso havia uma inconsistência de contrato: o fluxo de edição (`admin.updateUser`) já tratava a coluna como string `YYYY-MM-DD`, enquanto a criação entregava um objeto `Date`.

Corrigido: nova função `parseStrictCalendarDate` (módulo `server/routers/admin.ts`), compartilhada por `admin.createUser` e `admin.updateUser` — nunca constrói um `Date` a partir da string do usuário; em vez disso, reconstrói os componentes ano/mês/dia a partir do resultado e compara byte a byte com o que foi digitado, rejeitando qualquer "correção" silenciosa do JavaScript com `BAD_REQUEST`. `CreateUserTransactionalInput.expiration_date` passou a ser `string | null` (nunca `Date`), persistindo a forma canônica `AAAA-MM-DD` — igual ao contrato que `updateUser` já usava. Como achado colateral: `updateUser` tinha a MESMA falha de base (`new Date(string)` não detectava datas impossíveis) mas a mascarava diferente — ao invés de normalizar, gravava `NULL` silenciosamente quando o resultado era `NaN` (o que nunca disparava para o caso que importa, já que `new Date` quase nunca produz `NaN` para uma string nesse formato). Corrigido também, pela mesma função, para manter um único contrato real entre os dois fluxos.

Testado em `server/admin-create-user-authorization.test.ts` (6 casos): `2024-02-29` (ano bissexto) válida e persistida exatamente como enviada; `2023-02-29` (não bissexto) rejeitada com `BAD_REQUEST`; `2026-02-30` rejeitada com `BAD_REQUEST` — nunca normalizada para 2 de março (a prova central do parecer); mês 13 rejeitado; data válida persistida sem deslocamento de fuso; vazio/null persistido como `null` sem erro.

### C5. Prova de que os testes são reais (stash/pop)

`git stash push --keep-index` nos 4 arquivos de implementação (`server/db.ts`, `server/routers/admin.ts`, `client/src/pages/AdminPage.tsx`, `client/src/components/UserFormDialog.tsx`), mantendo só os 3 arquivos de teste modificados. Rodando os 3 arquivos contra a implementação ANTERIOR (892315d): **20 das novas/alteradas asserções falharam** exatamente nos pontos esperados (FORBIDDEN de unit_admin para responsavel_financeiro inexistente, `permissionsByUnit` inexistente, `createUserScoped` ainda chamando `createLocalUser`, `view_financial` não chegando ao vínculo, `visibleRoles` ainda incluindo `responsavel_financeiro`). `git stash pop` restaurou a implementação — todas as 49 asserções dos 3 arquivos voltaram a passar.

### C6. Validação completa

- `pnpm check` — sem erros.
- `TZ=UTC pnpm vitest run server/admin-create-user-authorization.test.ts server/create-user-transactional.test.ts server/create-user-interface-wiring.test.ts` — **49 testes passando** (31 + 10 + 8; eram 31 antes deste parecer).
- `TZ=UTC pnpm test` (suíte completa) — **897 passed / 11 failed / 1 skipped** (909 total). Os 11 failed são os mesmos 7 arquivos pré-existentes já documentados nesta auditoria — nenhuma regressão nova. 879 (baseline do ADENDO anterior) + 18 testes novos deste parecer = 897, bate exato.
- `pnpm build` — build de produção concluído sem erros.
- `git diff --check origin/main...HEAD` — limpo.

### C7. Decisão operacional

Esta branch (`claude/achado-criacao-usuarios-funcao-e-aparencia`) está pronta para nova revisão da Manus. Nenhum merge em `main`, atualização de VM1 ou criação de usuário real foi executado.

---

## ADENDO 3 — resposta ao parecer técnico de bloqueios (commit 8053f98), 2026-10-15

Parecer novo revisou o commit `8053f98` (a correção do ADENDO 2) e apontou 2 bloqueios: um de segurança (alta severidade) e um funcional, ambos em caminhos administrativos JÁ EXISTENTES (não no fluxo de criação em si). Veredito: **reprovada temporariamente — não integrar em `main` nem implantar na VM1 neste estado.** Ambos os bloqueios foram confirmados no código real antes de qualquer alteração, e ambos foram corrigidos e testados nesta mesma branch — sem tocar `main`, sem VM.

### D1. Bloqueio 1 (alta severidade) — `unit_admin` ainda conseguia assumir ou restaurar acesso de uma conta financeira existente

Confirmado: a restrição de `unit_admin` ao papel `responsavel_financeiro` (ADENDO 2, C1) cobria apenas a CRIAÇÃO (`admin.createUser` e `admin.createUserScoped`). Cinco rotas administrativas já existentes não tinham nenhuma checagem equivalente: `admin.updateUser` permitia a um `unit_admin` com escopo sobre a unidade do alvo trocar a senha, promover o papel para `responsavel_financeiro`, ou reativar a conta; `admin.toggleUserActive` tinha a mesma lacuna para o status da conta; `admin.setUserPermissions` e `admin.removeUserUnitLink` nem carregavam o papel do usuário-alvo — só verificavam escopo de unidade; `admin.linkExistingUserToUnitGroup` permitia conceder o `groupKey` `'responsaveisFinanceiros'` (equivalente de permissão a acesso financeiro por unidade) sem nenhuma restrição a `unit_admin`. Como o acesso financeiro final é resolvido pelo vínculo em `financial_responsible_users` e por `financial_responsible_units` (que pode abranger todas as unidades do mesmo responsável, não apenas a unidade administrada pelo `unit_admin`), qualquer uma dessas 5 rotas permitia, por caminho paralelo, invalidar a proteção já aplicada à criação.

Corrigido com uma guarda central e reutilizável em `server/authorization.ts` (o arquivo que o próprio código já documenta como "ÚNICA fonte de verdade para validação de acesso por unidade"):

- `userHasFinancialResponsibleHistory(userId)`: verifica vínculo ATIVO em `financial_responsible_users` OU vínculo HISTÓRICO via `audit_log` (ação `GRANT_FINANCIAL_RESPONSIBLE_ACCESS`, `target_type='USER'`). Esse segundo caminho foi necessário porque `financial_responsible_users` usa modelo DELETE+INSERT sem soft-delete (migration 0062) — uma revogação apaga a linha, então o histórico só sobrevive no `audit_log`, que é append-only.
- `assertUnitAdminCanManageTargetUser(actor, targetUser, opts?)`: no-op para `admin_master`; para `unit_admin`, nega com `FORBIDDEN` se o papel ATUAL do alvo for `responsavel_financeiro`, se a mudança solicitada (`opts.newRole`) definir esse papel, ou se `userHasFinancialResponsibleHistory` for verdadeiro para o alvo.

Aplicada nas 5 rotas citadas pelo parecer, sempre ANTES de qualquer `update`/`insert`/`delete`/auditoria: `admin.updateUser` (passando `newRole: input.role`); `admin.toggleUserActive`; `admin.setUserPermissions` (que ganhou uma busca nova do usuário-alvo, inexistente antes); `admin.removeUserUnitLink` (mesma busca nova); `admin.linkExistingUserToUnitGroup` (que também ganhou um bloqueio explícito e direto ao `groupKey === 'responsaveisFinanceiros'` para `unit_admin`, além da guarda central para qualquer outro `groupKey` em uma conta já financeira).

Testado em `server/unit-admin-financial-guard.test.ts` (30 testes): os 6 cenários comportamentais exigidos pelo parecer — bloqueio quando o papel atual é `responsavel_financeiro`; bloqueio ao promover para esse papel; bloqueio quando há vínculo em `financial_responsible_users` mesmo com papel comum; prova de que nenhuma escrita (update/insert/delete/audit) ocorre antes da negação; `admin_master` continua podendo fazer as mesmas alterações; conta clínica comum continua editável por `unit_admin` — replicados para cada uma das 5 rotas, mais testes unitários diretos de `userHasFinancialResponsibleHistory` e `assertUnitAdminCanManageTargetUser`.

A interface não foi alterada nesta rodada (o parecer trata essa melhoria como complementar, não obrigatória, desde que a guarda do servidor exista) — pode ser feita em rodada futura para ocultar as ações de edição/ativação/permissão quando o operador é `unit_admin` e o alvo é financeiro.

### D2. Bloqueio 2 (funcional) — modal de edição transformava uma data válida em `NaN-NaN-NaN`

Confirmado: `client/src/components/UserFormDialog.tsx`, ao abrir a edição de um usuário, executava `new Date(Number(user.expiration_date))`. A coluna `users.expiration_date` é `date(...)` sem `mode` no Drizzle, lida/gravada como string `AAAA-MM-DD` — e `Number("2026-12-30")` é `NaN`, então o campo do formulário recebia o texto literal `NaN-NaN-NaN` mesmo para uma data válida e corretamente persistida pelo backend (cuja validação estrita, do ADENDO 2/C4, já estava correta). Confirmado localmente para `2026-12-30` e para a data bissexta válida `2024-02-29`.

Corrigido com uma função pura e testada, exportada por `UserFormDialog.tsx`: `formatExpirationDateForInput(value: string | Date | null | undefined): string`. Preserva a string de calendário tal como persistida (sem conversão numérica nem reinterpretação de timezone), com suporte defensivo a um valor `Date` legado (lido via `getUTC*`) e a nulo/vazio (campo vazio). Usada no lugar da conversão antiga.

Testado em `server/user-form-expiration-date-parsing.test.ts` (9 testes): os 5 cenários exigidos pelo parecer — `2026-12-30` preservada; `2024-02-29` preservada; nulo/vazio/undefined mantém o campo vazio; nunca produz `NaN-NaN-NaN`; editar sem alterar a data não a corrompe — mais um teste que reproduz deliberadamente o bug antigo (`new Date(Number(string))` produzindo `NaN-NaN-NaN` de verdade) para provar que o helper novo evita exatamente esse caso, e testes de suporte a `Date` legado/inválido e a timestamp ISO com hora.

### D3. Prova de que os testes são reais (stash/pop)

`git stash push -- server/authorization.ts server/routers/admin.ts client/src/components/UserFormDialog.tsx` (mantendo só os 2 arquivos de teste novos, não rastreados, intocados). Rodando os 2 arquivos de teste contra a implementação ANTERIOR (8053f98): **29 das 39 asserções novas falharam** exatamente nos pontos esperados (rotas de `removeUserUnitLink`/`linkExistingUserToUnitGroup` sem a guarda, `formatExpirationDateForInput` inexistente). `git stash pop` restaurou a implementação — todas as 39 asserções dos 2 arquivos voltaram a passar.

### D4. Validação completa

- `pnpm check` — sem erros.
- `TZ=UTC pnpm vitest run server/unit-admin-financial-guard.test.ts server/user-form-expiration-date-parsing.test.ts server/admin-create-user-authorization.test.ts server/create-user-interface-wiring.test.ts` — **78 testes passando** (30 + 9 + 31 + 8).
- `TZ=UTC pnpm test` (suíte completa) — **936 passed / 11 failed / 1 skipped** (948 total). Os 11 failed são os mesmos 7 arquivos pré-existentes já documentados nesta auditoria (`exam-catalog-security.test.ts`, `finance-v2-dashboard.test.tsx` ×2, `mediaProxy.test.ts`, `pacs-desktop-download-progress.test.ts`, `pacs.mobile-ui.test.ts`, `security.auth.test.ts`, `study-priority-ui.test.ts` ×4) — nenhuma regressão nova. 897 (baseline do ADENDO anterior) + 39 testes novos deste parecer = 936, bate exato.
- `pnpm build` — build de produção concluído sem erros (só o aviso preexistente de bundle grande).
- `git diff --check origin/main...HEAD` — limpo.

### D5. Decisão operacional

Esta branch (`claude/achado-criacao-usuarios-funcao-e-aparencia`) está pronta para nova revisão da Manus. Nenhum merge em `main`, fast-forward, atualização de VM1 ou criação de usuário real foi executado — conforme a decisão explícita deste parecer.

---

## ADENDO 4 — resposta ao parecer de revisão (commit 643a15d), 2026-10-16

A Manus revisou o commit `643a15d` (resposta ao ADENDO 3) e confirmou que a guarda central estava corretamente chamada nas 5 rotas, que `unit_admin` é impedido de promover direto para `responsavel_financeiro`, que contas com papel atual `responsavel_financeiro` ficam bloqueadas para `unit_admin`, e que a correção da data de expiração eliminou o `NaN-NaN-NaN`. Apontou, porém, um bloqueio de segurança isolado: a consulta de histórico financeiro usava o formato errado de auditoria. Veredito: **reprovado temporariamente — não integrar nem implantar antes da correção.**

### E1. Bloqueio — histórico financeiro consultado no formato errado

Confirmado: `userHasFinancialResponsibleHistory` (em `server/authorization.ts`) procurava `action='GRANT_FINANCIAL_RESPONSIBLE_ACCESS'`, `target_type='USER'`, `target_id=String(userId)` — um formato que **nenhuma gravação real do sistema usa**. As duas gravações reais (`createUserTransactional` e `linkUserToResponsible`, em `server/db.ts`) persistem `target_type='FINANCIAL_RESPONSIBLE_USER'`, `target_id=`${financialResponsibleId}:${userId}`` (par de IDs, não um ID isolado) e `metadata={ financial_responsible_id, user_id, ... }`. Como `financial_responsible_users` usa modelo DELETE+INSERT sem soft-delete, depois de uma revogação o único registro de histórico que sobrevive é esse audit_log — e a função antiga nunca o encontrava, deixando a conta parecer "comum" para um `unit_admin` depois que o vínculo ativo era removido.

Corrigido: a consulta agora filtra por `target_type='FINANCIAL_RESPONSIBLE_USER'` e por `metadata.user_id` via `JSON_EXTRACT` (compatível com MySQL/TiDB) — nunca por `target_id` inteiro (que é um par, não um ID isolado) e nunca com `LIKE '%:<id>'`. O resultado do banco é reconfirmado em TypeScript, comparando `Number(metadata.user_id) === userId`, como defesa em profundidade contra qualquer comportamento inesperado do filtro SQL (inclusive sob um mock de teste que devolva linhas sem filtrar de verdade). A primeira verificação, em `financial_responsible_users` para vínculo ativo, foi preservada sem alteração.

### E2. Testes corrigidos — contrato real de auditoria

`server/unit-admin-financial-guard.test.ts` foi reescrito para usar o formato real em todos os pontos onde simulava histórico financeiro, e ganhou os 5 cenários exigidos pelo parecer: (1) histórico real (`target_type` correto + `metadata.user_id` do alvo) bloqueia o `unit_admin`; (2) o mesmo formato com `metadata.user_id` de **outro** usuário não bloqueia a conta errada; (3) um registro legado (`target_type='USER'`) não é assumido como prova de vínculo financeiro sem decisão explícita de compatibilidade; (4) o `target_id` composto não casa por coincidência de substring (ex.: usuário 7 não é confundido com um `target_id` `"1:17"`); (5) duas das cinco rotas protegidas (`toggleUserActive` e `removeUserUnitLink`) foram testadas diretamente com o histórico real, provando que nenhuma escrita (`update`/`insert`/`delete`/auditoria) ocorre antes do `FORBIDDEN`.

### E3. Prova de que os testes são reais (stash/pop)

`git stash push -- server/authorization.ts` (mantendo só o arquivo de teste modificado). Rodando a suíte contra a implementação ANTERIOR: **3 dos testes novos davam falso positivo** — bloqueavam contas sem qualquer vínculo financeiro real, porque o código antigo nunca verificava o formato do registro de auditoria encontrado (só checava `historicalGrants.length > 0`), exatamente o modo de falha que o parecer descreveu. `git stash pop` restaurou a implementação — todos os 33 testes voltaram a passar.

### E4. Incidente operacional — corrupção de objetos Git no sandbox

Durante esta rodada, uma interrupção de sessão no ambiente de trabalho deixou a working copy local com arquivos de objeto Git truncados (vários objetos de 0 bytes, remanescentes das operações de `git stash`/`stash pop` já concluídas e descartadas nesta mesma rodada). Isso impediu `pnpm check` e o `git push` subsequentes até ser diagnosticado. Resolvido clonando uma cópia nova e íntegra do branch a partir do `origin` (commit `643a15d`, já publicado e correto), reaplicando manualmente as duas alterações desta rodada (`server/authorization.ts` e `server/unit-admin-financial-guard.test.ts`) sobre essa cópia limpa, e repetindo toda a validação a partir dela antes do commit e do push. Nenhum código já publicado foi perdido ou alterado por este incidente — apenas trabalho local ainda não commitado precisou ser reconstituído a partir do que já estava em memória desta mesma sessão.

### E5. Validação completa

- `pnpm check` — sem erros.
- `TZ=UTC pnpm vitest run server/unit-admin-financial-guard.test.ts server/user-form-expiration-date-parsing.test.ts server/admin-create-user-authorization.test.ts server/create-user-interface-wiring.test.ts` — **81 testes passando** (33 + 9 + 31 + 8).
- `TZ=UTC pnpm test` (suíte completa) — **939 passed / 11 failed / 1 skipped** (951 total). Os 11 failed são os mesmos 7 arquivos pré-existentes já documentados nesta auditoria (`exam-catalog-security.test.ts`, `finance-v2-dashboard.test.tsx` ×2, `mediaProxy.test.ts`, `pacs-desktop-download-progress.test.ts`, `pacs.mobile-ui.test.ts`, `security.auth.test.ts`, `study-priority-ui.test.ts` ×4) — nenhuma regressão nova. 936 (baseline do ADENDO anterior) + 3 testes novos deste parecer = 939, bate exato.
- `pnpm build` — build de produção concluído sem erros (só o aviso preexistente de bundle grande).
- `git diff --check origin/main...HEAD` — limpo.

### E6. Decisão operacional

Esta branch (`claude/achado-criacao-usuarios-funcao-e-aparencia`, agora no commit `0296d76`) está pronta para nova revisão da Manus. Nenhum merge em `main`, fast-forward, atualização de VM1 ou criação de usuário real foi executado.
