# Proposta de Integração OsiriX — 20/08/2026

## Objetivo

Adicionar ao visualizador PACS um botão **OsiriX**, ao lado de Horos, sem modificar Horos, RadiAnt, Weasis ou qualquer configuração hospitalar. A integração deverá entregar o estudo autorizado ao OsiriX instalado no computador do próprio usuário.

## Método recomendado

O OsiriX documenta o esquema local `osirix://` e o método `DownloadURL`, que aceita uma URL para arquivo DICOM ou ZIP e o parâmetro `Display=YES` para abrir o estudo ao fim do download. O esquema é executado somente no computador local do usuário, portanto o Portal não deve tentar controlar remotamente uma estação de trabalho [1].

O Portal poderá reutilizar o modelo já empregado pelo Horos: emitir um token opaco, temporário e de uso único, entregar o ZIP DICOM por rota autenticada e invocar `osirix://?methodName=downloadURL&URL=...&Display=YES` no navegador do usuário. A entrega não exigirá alteração de AE Title, IP, porta, `pacs.xml` ou cadastro de um novo nó DICOM hospitalar.

## Implementação aprovada

O botão **OsiriX** foi incluído imediatamente ao lado de **Horos** na barra superior do visualizador. Ele usa a rota já protegida `/api/dicom-viewer-launch/:studyUid?viewer=osirix`, que valida o acesso do usuário ao estudo antes de emitir o token temporário. Horos, RadiAnt, Weasis e os demais botões não foram alterados.

## Alternativa não selecionada

O OsiriX também pode recuperar exames diretamente por DICOM Query/Retrieve. Esse modelo requer configurar o PACS em **Preferences > Locations** e, para C-MOVE, declarar o cliente no PACS. Por modificar a configuração operacional, não atende à política do Portal para esta integração [2].

## Referências

[1] [OsiriX — RIS Integration](https://www.osirix-viewer.com/resources/ris-integration/)

[2] [OsiriX — PACS Setup](https://www.osirix-viewer.com/resources/pacs/)
