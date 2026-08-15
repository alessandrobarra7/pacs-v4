# Validação responsiva do Login — correção de sobreposição

## Viewport do problema

No viewport `1076x1785`, o layout desktop continua ativo, mas agora usa o breakpoint intermediário: logo reduzido, painel de login dimensionado para no máximo 480px, espaçamentos menores e cards de status compactos. O logo e o painel não se sobrepõem.

## Desktop padrão

No viewport `1280x800`, o layout preserva a composição visual desktop com logo grande, cards de status e card de login amplo. O painel permanece separado da área de identidade visual.

## Banco e autenticação

A correção altera somente CSS/classes do Login.tsx. Não altera banco de dados, schema, procedures, autenticação ou variáveis de produção.
