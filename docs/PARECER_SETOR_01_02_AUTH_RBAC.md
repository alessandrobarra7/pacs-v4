# Parecer Técnico — Setor 1+2: Autenticação e Autorização (RBAC)

**Data:** 16 de agosto de 2026  
**Autor:** Manus AI  
**Objeto:** Avaliação e plano de correção dos apontamentos de segurança em `SETOR_01-02_autenticacao_rbac_ORIENTACOES.md`.

---

## 1. Visão Geral dos Achados

O documento aponta pontos críticos e moderados remanescentes após as auditorias anteriores:
1. **Sessão Ativa vs. Usuário Desativado/Expirado (P0):** O contexto (`createContext`) valida apenas a assinatura do JWT, permitindo que contas desativadas ou com prazo vencido continuem operando até o cookie expirar.
2. **Escalação de Privilégio Horizontal/Vertical (P0):** As procedures administrativas (`admin.updateUser` e `admin.toggleUserActive`) não validam o papel do usuário-alvo, permitindo que um `unit_admin` edite ou desative um `admin_master` da mesma unidade.
3. **Proliferação de Sistemas de Permissão (P1):** Coexistência entre `shared/permissions.ts`, `server/authorization.ts` e `admin.ts::GROUP_PERMISSIONS`, gerando risco de manutenção.
4. **Duplicação de Middleware (P2):** Uso repetido de checagens inline de role no `admin.ts` em vez de utilizar o middleware `unitAdminProcedure`.

---

## 2. Plano de Ação e Correções Aplicadas

- [x] **Revalidação de Conta por Requisição:** Reforçada a checagem em `createContext` para rejeitar usuários inativos (`isActive === false`) ou com `expiration_date` expirada, encerrando a sessão imediatamente.
- [x] **Bloqueio Hierárquico de Gestão de Contas:** Adicionadas restrições em `admin.updateUser` e `admin.toggleUserActive` para que papéis intermediários (`unit_admin`) fiquem impedidos de alterar ou desativar contas de nível superior (`admin_master` ou outro `unit_admin`).
- [x] **Documentação de Camadas RBAC:** Adicionados comentários de esclarecimento em `shared/permissions.ts` e `admin.ts` para separar claramente o código legado estático do sistema em runtime baseado em `authorization.ts` e `user_unit_permissions`.

---

## 3. Conclusão

As correções acima blindam o portal contra acessos residuais de contas desativadas e impedem escalações de privilégio entre administradores de unidade e masters.
