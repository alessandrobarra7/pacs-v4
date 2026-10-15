# Achado — `units.removeDoctor` sem checagem de escopo por unidade

**Data:** 2026-10-14
**Branch:** `claude/achado-removedoctor-sem-escopo-unidade`
**Autor:** Claude (auditoria de código)
**Status:** 🔴 ABERTO — nenhuma correção implementada ainda. Este documento é um pedido de considerações à Manus antes de qualquer implementação.

---

## 1. O que é

A procedure `removeDoctor`, em `server/routers/units.ts`, remove o vínculo de um médico com uma unidade (apaga a linha correspondente em `user_unit_permissions`). Ela está acessível a qualquer usuário com role `admin_master` ou `unit_admin`.

```ts
// server/routers/units.ts, linha ~300
removeDoctor: protectedProcedure
  .input(z.object({ unitId: z.number(), doctorUserId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master' && ctx.user.role !== 'unit_admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
    const { user_unit_permissions } = await import('../../drizzle/schema');
    const { eq: eqOp, and: andOp } = await import('drizzle-orm');
    await db
      .delete(user_unit_permissions)
      .where(andOp(eqOp(user_unit_permissions.user_id, input.doctorUserId), eqOp(user_unit_permissions.unit_id, input.unitId)));
    await createAuditLog({
      user_id: ctx.user.id,
      unit_id: input.unitId,
      action: 'UPDATE_UNIT',
      target_type: 'USER',
      target_id: String(input.doctorUserId),
      ip_address: ctx.req.ip,
      user_agent: ctx.req.headers['user-agent'],
    });
    return { success: true };
  }),
```

A única verificação de autorização é sobre o **cargo** do chamador (`admin_master` ou `unit_admin`). Não há nenhuma verificação de que esse `unit_admin` específico tem permissão sobre a `input.unitId` informada. Depois dessa checagem de cargo, o código vai direto para o `DELETE`.

## 2. Por que isso é inconsistente com o resto do arquivo

A procedure irmã, `addDoctor` (mesmo arquivo, logo acima, linha ~254), que faz a operação inversa (vincular um médico a uma unidade), **já tem** a checagem de escopo que falta aqui — adicionada em uma correção anterior (comentário `V14-P2 FIX` no próprio código):

```ts
// server/routers/units.ts, linha ~262 (addDoctor)
if (ctx.user.role === 'unit_admin') {
  const { getUserUnitPermission: getUnitPerm } = await import('../db');
  const hasScope = ctx.user.unit_id === input.unitId || !!(await getUnitPerm(ctx.user.id, input.unitId));
  if (!hasScope) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não tem acesso a esta unidade' });
  }
}
```

Ou seja: o padrão de correção já existe, já está validado em produção para `addDoctor`, e aparentemente não foi replicado para `removeDoctor` quando o `V14-P2 FIX` foi feito. As duas procedures têm o mesmo input (`unitId`, `doctorUserId`), o mesmo tipo de usuário autorizado, e fazem a operação inversa uma da outra — mas só uma delas está protegida.

O mesmo padrão de escopo também existe em `admin.ts updateUser` (outra correção já homologada), reforçando que esta é a convenção estabelecida no projeto para `unit_admin`.

## 3. Impacto

Um usuário com role `unit_admin`, vinculado apenas à Unidade A, pode chamar `removeDoctor` passando `unitId` de uma Unidade B qualquer (alheia a ele) e o `doctorUserId` de um médico vinculado a ela — e a remoção é executada normalmente, sem nenhum bloqueio.

- **Não é vazamento de dados** (não há leitura cross-unit aqui), é **quebra de isolamento para uma ação destrutiva**: um `unit_admin` pode desvincular médicos de unidades que não administra.
- `unitId` e `doctorUserId` são inteiros sequenciais (previsíveis/enumeráveis), então não depende de informação privilegiada para ser explorado.
- Efeito prático: um médico perde acesso a uma unidade sem que o `unit_admin` daquela unidade tenha feito ou autorizado a ação — potencial sabotagem operacional ou uso indevido por um `unit_admin` mal-intencionado ou com conta comprometida.

## 4. O que ainda NÃO foi feito (intencionalmente)

Nenhuma alteração de código foi feita neste branch. Este documento existe só para registrar o achado e pedir a avaliação da Manus antes de qualquer implementação, incluindo:

1. **Confirmação do achado** — se a leitura acima do fluxo está correta e se há algum fator mitigante no app (ex.: alguma camada de autorização fora deste arquivo) que eu possa ter deixado passar.
2. **Qual deve ser a correção exata** — replicar literalmente o mesmo padrão do `addDoctor`/`updateUser` (bloquear se `unit_admin` não tiver escopo sobre `input.unitId`) parece o caminho natural e consistente, mas pergunto à Manus se há alguma nuance de negócio que deva ser considerada (ex.: algum caso legítimo em que um `unit_admin` precise remover um médico de outra unidade; comportamento esperado da auditoria; se o `admin_master` deve ter alguma restrição adicional, embora hoje não tenha nenhuma e aparentemente não deva ter).
3. **Mensagem de erro e comportamento de auditoria** — se a mensagem/forma de negar deve seguir exatamente o padrão de `addDoctor` ("Unit admin não tem acesso a esta unidade") ou se a Manus prefere outra redação/comportamento.
4. **Prioridade** — se deve ser tratado como bloqueante antes do próximo deploy, ou pode aguardar junto com outros itens pendentes (ex.: guarda de exclusão órfã de unidade, já pronta no branch `claude/bloqueia-exclusao-unidade-orfa`, ainda não mesclada).

Assim que a Manus responder, a implementação segue o fluxo padrão: fix mínimo e cirúrgico, testes de regressão comportamentais, validação completa (`pnpm check`, suíte completa comparada ao baseline, `pnpm build`, `git diff --check`), commit e push neste mesmo branch (ou em um novo, se a Manus preferir um escopo diferente).

---

## ADENDO (2026-10-14) — Correção implementada conforme orientações da Manus

**Documento de orientação:** `ORIENTACOES_BRANCH_CORRECAO_ESCOPO_REMOVEDOCTOR_2026-10-14.txt`
**Commit base de `origin/main`:** `301833c55efd9b2e4725d20978c6d4e8dcbaa729`
**Branch:** `claude/achado-removedoctor-sem-escopo-unidade` (linear sobre a main remota, sem merge/deploy)

### A1. Arquivos modificados

- `server/routers/units.ts` — nova função `assertUnitAdminScope(user, unitId)`, chamada em `removeDoctor`, `listDoctors`, `listAllDoctors` e (refatorado para usar o mesmo helper) `addDoctor`.
- `client/src/components/UnitDoctorsTab.tsx` — `trpc.units.listAllDoctors.useQuery()` passa a receber `{ unitId }`.
- `server/units-doctor-scope.test.ts` (novo) — suíte comportamental cobrindo os cenários A–I pedidos.

### A2. Regra final implementada

```ts
async function assertUnitAdminScope(
  user: { role: string; id: number; unit_id: number | null },
  unitId: number,
): Promise<void> {
  if (user.role !== 'unit_admin') return;
  const { getUserUnitPermission: getUnitPerm } = await import('../db');
  const hasScope = user.unit_id === unitId || !!(await getUnitPerm(user.id, unitId));
  if (!hasScope) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Unit admin não tem acesso a esta unidade' });
  }
}
```

- `admin_master`: nunca restringido — a função retorna imediatamente sem consultar nada.
- `unit_admin`: autorizado se `unit_id` legado bater com `input.unitId` OU existir vínculo em `user_unit_permissions`.
- Outros papéis: continuam barrados pela checagem de cargo já existente, antes mesmo de chegar à guarda de escopo.
- Mensagem padronizada: `"Unit admin não tem acesso a esta unidade"` — idêntica à já usada em `addDoctor`.
- A guarda roda imediatamente após a checagem de cargo e antes de qualquer `getDb()`, `SELECT`, `DELETE`, `INSERT` ou `createAuditLog`.

### A3. Confirmação de cobertura

- `removeDoctor` — protegido (achado original).
- `listDoctors` — protegido (recebia `{ unitId }` mas não validava escopo).
- `listAllDoctors` — protegido; trocou input vazio por `{ unitId: z.number() }`; mantém a listagem de médicos ainda não vinculados à unidade de destino (não filtra por vínculo prévio, preservando o fluxo de "adicionar médico").
- `addDoctor` — mantido com a mesma semântica V14-P2, agora via helper compartilhado (nenhuma mudança de contrato ou comportamento).
- Único consumidor de `listAllDoctors` confirmado por busca no repositório (`grep -rn "listAllDoctors"`): `UnitDoctorsTab.tsx`, atualizado.

### A4. Fora de escopo — confirmado não tocado

Nenhuma migration, nenhuma alteração em `drizzle/schema.ts`, nenhum dado em `user_unit_permissions` alterado/apagado, nenhum fluxo financeiro ou de preços tocado, `admin_master` não restringido, nenhuma exigência de role no alvo de `removeDoctor` (continua idempotente), nenhuma rota de `financeSimple` tocada, nenhum audit log de tentativa negada adicionado (mantém o padrão: auditoria só em operação autorizada e concluída).

### A5. Testes (server/units-doctor-scope.test.ts) — cenários A–I

| Cenário | Descrição | Resultado |
|---|---|---|
| A | `removeDoctor` fora do escopo → FORBIDDEN, `DELETE` e `createAuditLog` nunca chamados | PASSOU |
| B | `removeDoctor` na unidade legada própria → sucesso, `DELETE` correto, audit log `UPDATE_UNIT` | PASSOU |
| C | `removeDoctor` em unidade adicional (multiunidade) → sucesso via `getUserUnitPermission` | PASSOU |
| D | `removeDoctor` por `admin_master` em qualquer unidade, sem depender de `getUserUnitPermission` | PASSOU |
| E | `listDoctors` fora do escopo → FORBIDDEN, nenhuma consulta de médicos iniciada | PASSOU |
| F | `listAllDoctors` fora do escopo → FORBIDDEN, nenhuma consulta global iniciada | PASSOU |
| G | `listAllDoctors` no escopo → lista completa, incluindo médicos ainda não vinculados | PASSOU |
| H | Regressão de cliente: `UnitDoctorsTab` chama `listAllDoctors` com `{ unitId }` | PASSOU |
| I | Regressão `addDoctor`: continua recusando fora do escopo e permitindo próprio/multiunidade | PASSOU |

Mais um cenário adicional (não numerado pela Manus, incluído por cobertura): papéis que não são `admin_master`/`unit_admin` continuam recebendo FORBIDDEN nos três endpoints, sem nenhuma consulta.

**Prova de regressão real (ciclo `git stash`):** com a implementação revertida (apenas `server/routers/units.ts` e `UnitDoctorsTab.tsx` em stash, testes mantidos no disco), rodar a suíte produziu exatamente 5 falhas — os cenários A, C, E, F e H, todos dependentes do código novo — e 7 aprovações (B, D, G, I e o cenário de papel não autorizado, que já eram satisfeitos pelo código anterior nos pontos que não dependiam da guarda). Após `git stash pop`, os 12 testes voltam a passar. Confirma que a suíte testa comportamento real, não apenas a forma do código.

### A6. Validação completa

```
pnpm check                                          → OK, sem erros de tipo
TZ=UTC vitest run server/units-doctor-scope.test.ts
  server/units.test.ts                              → 18/18 passaram
TZ=UTC pnpm test (suíte completa)                   → 848 passaram, 11 falharam, 1 skipped (860 total)
pnpm build                                           → OK, build concluído
```

**Comparação com baseline de `origin/main`:** a suíte completa contra `origin/main` (sem as alterações deste branch) já apresentava 11 falhas em exatamente estes 7 arquivos, não relacionados a este achado:
`exam-catalog-security.test.ts`, `finance-v2-dashboard.test.tsx` (2 casos), `mediaProxy.test.ts`,
`pacs-desktop-download-progress.test.ts`, `pacs.mobile-ui.test.ts`, `security.auth.test.ts`,
`study-priority-ui.test.ts` (4 casos). Com as 12 novas asserções deste branch, o total de aprovados sobe de 836 para 848 (+12), mantendo exatamente as mesmas 11 falhas pré-existentes, nos mesmos 7 arquivos — confirmando zero regressões novas.

`git diff --check origin/main...HEAD` → sem espaços em branco ou problemas de whitespace.

### A7. Roteiro de homologação (a aplicar somente após aprovação/deploy da Manus)

1. Logar como `unit_admin` restrito à Unidade A; confirmar que a aba Médicos abre, lista e permite adicionar/remover vínculo normalmente.
2. Tentar (via chamada autenticada de teste) operar a Unidade B alheia; confirmar FORBIDDEN com a mensagem padronizada e que nenhum vínculo da Unidade B é alterado.
3. Logar como `admin_master`; confirmar que a gestão de médicos continua funcionando em qualquer unidade.
4. Conferir audit log: só aparece para operações efetivamente autorizadas e concluídas.
5. Não usar dados clínicos reais, pacientes ou imagens DICOM nesta homologação — escopo é puramente administrativo/vínculos.

### A8. Pendente

- Aguardando nova revisão da Manus desta implementação.
- Não houve merge, deploy, tag de produção, reset, rebase ou force-push neste branch.
