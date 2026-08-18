# RadiAnt: autorização do Portal, Query/Retrieve e configuração centralizada

## Decisão arquitetural

O Portal deve continuar sendo a autoridade de acesso: ele autentica o usuário, verifica o vínculo com a unidade e somente então produz um comando de abertura. Entretanto, uma URI `radiant://` é consumida pelo aplicativo Windows; a sessão web do Portal não é propagada como credencial DICOM. Assim, a autorização do Portal controla **o lançamento**, mas a recuperação Query/Retrieve continua sendo uma conexão direta entre RadiAnt e PACS.

> O AE Title `LAUDS` identifica a VM1 quando ela age como cliente DICOM. Ele não identifica automaticamente o computador do médico e não entrega imagens a esse computador.

## O que a documentação do fabricante confirma

O RadiAnt documenta o protocolo `radiant://` como tradução de argumentos de linha de comando. Para recuperar um estudo, a referência é `-pstv 0020000D "StudyUID"`; `-paet` limita a busca a um PACS **já configurado** no RadiAnt pelo respectivo AE Title. [1] [2]

O cliente RadiAnt suporta C-FIND, C-MOVE e C-GET. Em C-MOVE, a estação precisa aceitar a conexão de retorno e ter IP, porta e AE Title cadastrados no PACS; em C-GET, a estação não precisa receber conexão de retorno, porém o PACS precisa suportar esse protocolo. [3] [4]

Não foi localizada na documentação oficial uma interface para que o RadiAnt receba uma URL HTTP autenticada temporária e abra um ZIP por `methodName=DownloadURL`. Portanto, esse comportamento não deve ser tratado como integração suportada. O RadiAnt documenta, porém, a abertura de arquivos DICOM locais por `-f` e de pastas locais por `-d`. [8]

## Configuração preexistente do RadiAnt

O fornecedor confirma que a configuração dos PACS reside em `pacs.xml`. Ela pode ser colocada em `C:\ProgramData\RadiAntViewer` para uso comum de todos os perfis de uma mesma estação e pode ser copiada para outros computadores. [5] [6]

Esta capacidade não deve ser usada pelo Portal PACS atual. Médicos externos podem já ter uma configuração RadiAnt vinculada a hospitais, com IPs, portas e AE Titles que não podem ser sobrescritos. A integração do Portal não pode ler, alterar, substituir ou remover `pacs.xml`.

## Recomendação aprovada para o Portal PACS

O caminho aprovado é um Assistente RadiAnt local, instalado uma única vez em cada computador Windows que já possua o RadiAnt. A VM1 mantém a autorização por unidade e gera um comando temporário de uso único para um estudo. O assistente baixa somente esse estudo da VM1 para uma pasta temporária e chama o RadiAnt por `-d` ou `-f`.

O Assistente não consulta PACS, não usa C-FIND, C-GET ou C-MOVE e não recebe IP, porta, AE Title ou credenciais dos PACS das unidades. O RadiAnt abre os arquivos locais sem mudar a configuração hospitalar preexistente. Assim, a permissão do Portal é aplicada a cada estudo antes da entrega do token e não existe exposição de porta DICOM.

Se o RadiAnt não estiver instalado, o Assistente informa a indisponibilidade e não abre o estudo. Computadores macOS continuam utilizando o fluxo Horos já validado.

## Referências

1. [PACS integration — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/pacs-integration.html)
2. [URL protocol — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/url-protocol.html)
3. [PACS configuration — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/pacs-configuration.html)
4. [PACS connectivity — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/pacs-connectivity.html)
5. [Remote Installation — RadiAnt support forum](https://www.radiantviewer.com/dicom-viewer-forum/remote-installation/1542/)
6. [Deploying RadiAnt PACS files enterprise — RadiAnt support forum](https://www.radiantviewer.com/dicom-viewer-forum/deploying-radiant-viewer-pacs-files-enterprise/1346/)
7. [Setup command-line arguments — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/silent_setup_arguments.html)
8. [Command-line arguments — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/command-line_arguments.html)
