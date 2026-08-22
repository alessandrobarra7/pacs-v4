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

## Revisão do download direto

O carregamento invisível não disparou o download de modo confiável em navegadores reais, embora carregasse recursos da rota. Ele foi removido. Agora a página financeira solicita um objeto de documento específico, protegido por unidade, permissões de visualização e impressão, autoria ou assinatura do médico e estado finalizado do laudo. A própria página monta as folhas configuradas, aguarda logos, assinatura e carimbo, rasteriza o resultado e aciona o arquivo PDF diretamente no clique.

O botão passa a mostrar **Preparando PDF** durante a operação e informa falha de forma explícita. Não há nova aba, navegação para o editor, URL direta de arquivo ou visualização intermediária.

## Correção da captura de folhas

Na primeira execução do gerador direto, o documento autorizado era obtido corretamente, mas o cliente procurava uma classe interna inexistente. O componente canônico marca cada folha com o atributo `data-shared-report-sheet`; a captura passou a usar essa marcação real. Assim, cada folha preparada pelo mesmo componente de impressão compartilhado é adicionada ao PDF antes do download.

Essa correção foi atualizada na VM1 de `7b9e341` para `9e55c9f`, sem migração. O processo foi reiniciado com novo PID, permaneceu `online` e respondeu HTTP local `200`. Nenhuma ação foi executada na VM2.

## Segurança e autorização

O acesso continua dependente do alvo de impressão já filtrado no servidor: unidade solicitada, autoria ou assinatura do médico, `view_studies` e `print_reports`. O novo parâmetro controla a interface de consulta, não amplia permissões e não expõe URL direta do arquivo.

## Validação

Foram atualizadas regressões para verificar a consulta direta autorizada, a ausência de nova aba e de *iframe*, o feedback de preparo e a preservação do botão de download. Validação aprovada no sandbox: TypeScript, 82 arquivos Vitest com 378 testes aprovados e 1 ignorado, além de build de produção concluído.

## Atualização operacional

A VM1 foi atualizada de `322fe3e` para `4a3e260` sem migração. O processo `pacs-portal` foi reiniciado com novo PID, permaneceu `online` e respondeu HTTP local `200`. Nenhuma ação foi executada na VM2.

O refinamento de download direto foi atualizado posteriormente na VM1, de `4a3e260` para `79b7931`, também sem migração. O processo foi reiniciado com novo PID, permaneceu `online` e respondeu HTTP local `200`. Nenhuma ação foi executada na VM2.

O gerador direto autorizado foi atualizado posteriormente na VM1, de `79b7931` para `7b9e341`, sem migração. O processo foi reiniciado com novo PID, permaneceu `online` e respondeu HTTP local `200`. Nenhuma ação foi executada na VM2.
