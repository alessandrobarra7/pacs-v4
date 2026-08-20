# Correção do lançamento Weasis

## Causa identificada

O Portal construía a URI `weasis://` com um argumento `-r` para cada arquivo DICOM do estudo. Embora esse formato seja válido para poucos arquivos, estudos com muitas imagens geravam uma URI longa demais para manipuladores de protocolo e navegadores, impedindo a abertura confiável do Weasis.

## Correção aplicada

O lançamento agora cria um **manifesto XML temporário** contendo referências aos arquivos DICOM autorizados. A URI local do Weasis passa a carregar somente esse manifesto pelo comando `$dicom:get -w`, mantendo tamanho constante independentemente da quantidade de imagens.

Cada arquivo continua protegido por token opaco com expiração de duas horas. O manifesto também é temporário, não requer cookie de navegador, responde com `Cache-Control: no-store` e expira no mesmo prazo. Horos, OsiriX e RadiAnt não foram alterados.

## Referência técnica

A implementação segue a recomendação oficial do Weasis de usar um manifesto para múltiplas imagens, em vez de incluir uma referência por arquivo na URI local.

> “For loading multiple images, it’s recommended to use a manifest file that references all desired images instead of including each image individually in the URI.”

[1]: https://weasis.org/en/getting-started/weasis-protocol/ "Weasis Web Protocol"
