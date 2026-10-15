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
