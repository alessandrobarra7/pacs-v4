# Achado — Criação de usuários: bug funcional (unit_admin) e proposta de aparência

**Data:** 2026-10-15
**Branch:** `claude/achado-criacao-usuarios-funcao-e-aparencia`
**Autor:** Claude (auditoria de código a pedido do Alessandro)
**Status:** 🔴 ABERTO — nenhuma correção de código implementada ainda. Este documento registra os dois relatos (função + aparência) para avaliação antes de qualquer implementação.

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
