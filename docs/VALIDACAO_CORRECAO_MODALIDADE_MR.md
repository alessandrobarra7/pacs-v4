# Validação da correção de modalidade MR

**Data:** 1º de setembro de 2026

## Resultado técnico

A consulta PACS foi verificada no ambiente de desenvolvimento após a alteração do seletor de legendas. A rota efetiva `/` continuou renderizando normalmente, sem erro de tipagem ou de execução. A rota histórica `/pacs/query` devolve 404 por não ser uma rota registrada; a aplicação usa `/` para a consulta PACS.

O ambiente de desenvolvimento não retornou estudos no momento da verificação, portanto não foi possível abrir o modal **Compor exames do estudo** visualmente. A validação funcional do comportamento MR foi coberta por testes automatizados: o valor DICOM selecionado é `MR`, enquanto a interface exibe `RM`.

## Verificações concluídas

| Verificação | Resultado |
|---|---|
| Comparação de catálogo para ressonância | Usa o código DICOM `MR` |
| Rótulo da aba e textos da interface | Mantém `RM` |
| Testes direcionados | 10 testes aprovados |
| TypeScript | `pnpm check` aprovado |
| Build de produção | `pnpm build` aprovado |

## Validação funcional pendente em produção

Quando existir um estudo de modalidade `MR`, abrir **Compor exames do estudo**, selecionar a aba **RM** e confirmar que uma legenda cadastrada como `MR` aparece, pode ser selecionada e é preservada ao reabrir o estudo.
