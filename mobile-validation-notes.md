# Validação mobile do editor de layout

A captura enviada mostrou três problemas de composição: o título/descrição do editor comprimido e verticalizado, os controles superiores disputando espaço na mesma linha e o painel de edição invadindo visualmente a prévia A4.

A correção implementada separa o cabeçalho mobile em duas linhas, usa o breakpoint `lg` junto com as abas mobile, exibe uma seção de controles por vez e limita o painel/canvas com `min-w-0`. A prévia A4 continua em 595 × 842 px internamente, mas recebe escala calculada pelo viewport para caber em telas estreitas.

A inspeção do preview sandbox em 15/08/2026 confirmou TypeScript sem erros e servidor ativo. O navegador de inspeção estava em viewport CSS de 1280 × 1100 px, portanto exibiu a composição desktop; a validação da captura mobile deve ser feita em viewport CSS menor que 1024 px, onde o cabeçalho e as abas mobile são ativados.
