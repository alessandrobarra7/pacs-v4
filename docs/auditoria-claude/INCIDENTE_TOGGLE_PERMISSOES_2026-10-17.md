# Incidente — clique em toggle de permissão alterou campo diferente do clicado

**Data:** 2026-10-17
**Ambiente:** Produção (lauds.com.br), tela Administração → Usuários
**Branch:** claude/investiga-incidente-toggle-permissoes-20261017
**Status:** Não reproduzido de forma controlada. Pedido de investigação à Manus (acesso a logs/banco que o Claude não tem neste sandbox).

## O que foi observado

Durante uma sessão de testes manuais na tela de administração de usuários (conta `alessandro`, perfil `Admin Unidade`, unidade HOSPITAL DA CRIANÇA), a seguinte sequência ocorreu:

1. Clique no toggle "Laudar" da usuária erica (perfil `Resp. Financeiro`) -> resposta 403, toast "Gestão de contas de responsável financeiro é exclusiva do admin_master." (bloqueio correto e esperado).
2. ~28s depois, clique no toggle "Ed. Anamnese" da mesma usuária erica -> também 403, mesma mensagem (bloqueio correto e esperado).
3. Logo em seguida, clique no toggle "Ver Financeiro" da usuária Jean lima (perfil `Operador`, deveria ser uma alteração permitida) -> resposta 200, toast "Permissão salva" (sucesso).
4. Ao recarregar a página (dados frescos do servidor), o estado persistido da Jean lima era:
   - "Ver Financeiro" permaneceu OFF (a alteração pretendida pelo clique 3 não foi aplicada);
   - "Laudar" mudou de ON para OFF (um campo que não foi clicado foi alterado);
   - Nenhum outro campo (Ed. Anamnese, Ver Exames, Imprimir) mudou.

## Evidência técnica coletada

- Console do navegador (`[API Mutation Error]`), 2 erros capturados, ambos com a mensagem de bloqueio do Resp. Financeiro, nos timestamps 06:05:17 e 06:05:45 (hora local do navegador na sessão) — correspondem aos cliques 1 e 2 na erica.
- Rede capturada pelo navegador (iniciada depois do clique 1, portanto incompleta): apenas 2 requisições a admin.setUserPermissions ficaram visíveis (403, depois 200) — não há garantia de que a captura cobre exatamente os 3 cliques, já que o rastreamento começou no meio da sequência.
- Não foi possível capturar o corpo exato (payload) de nenhuma das requisições — a ferramenta de rede disponível no sandbox do Claude só retorna URL/método/status, não o body.

## Revisão de código já feita (sem bug encontrado)

Revisão completa de:
- `client/src/components/UsersPermissionsTab.tsx` (`handleTogglePerm`): monta o payload filtrando as permissões de outras unidades por `unit_id` explícito (não por posição/índice) e só altera o campo da coluna clicada (`col.key`). Nenhum caminho óbvio para troca de campo.
- `server/routers/admin.ts` (`setUserPermissions`): grava por nome de campo, valida zod com schema nomeado (não posicional).
- `server/db.ts` (`setUserUnitPermissions`): DELETE por user_id seguido de INSERT com campos nomeados.

Nenhum desses três pontos, lidos isoladamente, explica uma troca de campo entre "Ver Financeiro" e "Laudar" para o mesmo usuário em uma única chamada.

## Teste de reprodução controlada (não reproduziu o problema)

Um clique único e manual no toggle "Ver Financeiro" da conta de teste "teste2" (fora da sequência rápida de múltiplos cliques) funcionou corretamente: o campo certo mudou, nenhum outro campo foi alterado, e o estado persistiu corretamente após reload. Isso não prova que o incidente original não foi um bug real — apenas que o mecanismo funciona corretamente em um clique isolado, sem a sequência de múltiplos cliques em sucessão que antecedeu o incidente original.

## Hipóteses em aberto (nenhuma confirmada)

1. Erro de clique do agente automatizado (coordenada/timing do navegador controlado via Claude in Chrome) — o clique 3 pode ter fisicamente atingido o toggle "Laudar" em vez de "Ver Financeiro". É a hipótese mais simples e consistente com os dados (o campo alterado é exatamente o que teria mudado se o clique 3 tivesse sido em "Laudar"), mas não foi confirmada por nenhum log de servidor.
2. Condição de corrida real ligada ao httpBatchLink do tRPC (`client/src/main.tsx`) quando múltiplas mutações da mesma procedure são disparadas em sucessão rápida — não descartada, pois o agente de automação pode gerar cliques mais próximos no tempo do que um clique humano normal, criando um cenário de concorrência que talvez não ocorra em uso humano típico, mas que ainda seria uma falha real do sistema caso se repita (ex. duplo clique acidental, ou dois toggles clicados rapidamente por um humano apressado).

## Pedido à Manus

Como o Claude não tem acesso a logs de aplicação/banco de produção neste sandbox, pedimos que a Manus, com acesso real à VM/produção, verifique:

1. Logs de requisição HTTP (ou logs de aplicação) do endpoint /api/trpc/admin.setUserPermissions no período aproximado de 2026-10-17, entre 06:05 e 06:07 (horário precisa ser confirmado/convertido conforme timezone do servidor) — especificamente o(s) payload(s) recebido(s) pelo servidor nesse intervalo, para o usuário correspondente a "Jean lima" (username `jeanlima`).
2. Se os logs mostrarem um payload com `edit_reports: false` sendo enviado pelo cliente (navegador) para esse usuário — isso confirmaria que o problema está no frontend (cliente enviou o campo errado) e não no backend.
3. Se os logs mostrarem apenas uma requisição no período (não duas/três simultâneas) — isso reforça a hipótese 1 (erro de clique) e afasta a hipótese 2 (concorrência).
4. Se possível, confirmar se há algum mecanismo de retry/debounce no lado do servidor (load balancer, proxy, etc.) que poderia duplicar ou atrasar requisições de forma a causar esse efeito.

Sem essa confirmação via logs reais de produção, o Claude não tem como provar definitivamente qual das duas hipóteses é a correta, e por isso nenhuma correção de código foi aplicada nesta branch — ela existe apenas para documentar o incidente e registrar o pedido de investigação.

## Efeitos colaterais conhecidos (dados, não código)

Dois toggles de permissão foram alterados em produção durante esses testes e ainda não foram revertidos (o usuário Alessandro informou que fará o ajuste manualmente):
- `jeanlima` — "Laudar" (edit_reports) ficou OFF (estava ON antes dos testes).
- `teste` (teste2) — "Ver Financeiro" (view_financial) ficou ON (estava OFF antes dos testes, alterado deliberadamente no teste controlado de reprodução, que funcionou corretamente).
