# Correção do Download de Laudo na Visão Financeira do Médico

**Data:** 22 de agosto de 2026
**Escopo:** `/financeiro/meu-financeiro` e visualização final de documento
**Alteração de dados:** nenhuma
**Migração:** não aplicável

## Problema corrigido

O botão da lista de laudos entregues abria a rota do editor clínico com impressão automática. Quando a impressão não era concluída imediatamente, a tela expunha a interface do editor, inclusive comandos clínicos de imprimir, apagar e retificar. Esse comportamento não correspondia ao contrato de consulta financeira somente leitura.

## Novo fluxo

O botão agora se chama **Baixar PDF** e abre o documento com o parâmetro restrito `financialView=1`. Nesse modo, a tela preserva a renderização final configurada da unidade, incluindo layout, logos, rodapé, assinatura e carimbo do assinante, mas remove as ferramentas de modelo, frases, carimbo, edição de título, exclusão, retificação, assinatura, nova laudagem e salvamento de rascunho.

O único comando disponível é **Baixar PDF**. A geração captura cada folha configurada e cria o arquivo PDF no navegador. O retorno volta para `/financeiro/meu-financeiro`.

## Download direto sem aba

O fluxo foi refinado para não abrir uma nova aba ou apresentar uma visualização intermediária. A página financeira cria um *iframe* invisível e temporário com o alvo já autorizado. Esse contexto executa o mesmo gerador de PDF configurado e dispara o download do navegador; depois é removido. Assim, o médico permanece em **Meu financeiro** e recebe apenas o arquivo baixado.

## Segurança e autorização

O acesso continua dependente do alvo de impressão já filtrado no servidor: unidade solicitada, autoria ou assinatura do médico, `view_studies` e `print_reports`. O novo parâmetro controla a interface de consulta, não amplia permissões e não expõe URL direta do arquivo.

## Validação

Foram atualizadas regressões para verificar o parâmetro `financialView=1`, a ausência de ações clínicas, o bloqueio de ferramentas móveis, o carregamento invisível e a ausência de `window.open`. Validação aprovada no sandbox: TypeScript, 82 arquivos Vitest com 378 testes aprovados e 1 ignorado, além de build de produção concluído.

## Atualização operacional

A VM1 foi atualizada de `322fe3e` para `4a3e260` sem migração. O processo `pacs-portal` foi reiniciado com novo PID, permaneceu `online` e respondeu HTTP local `200`. Nenhuma ação foi executada na VM2.
