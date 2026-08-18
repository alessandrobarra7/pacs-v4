# Relatório Técnico de Auditoria — Assistente RadiAnt

**Data:** 18/08/2026  
**Escopo:** Integração do Portal PACS com RadiAnt em computadores Windows externos.  
**Classificação:** Documento técnico para auditoria externa; não contém credenciais, tokens, dados de pacientes, endereços de PACS, AE Titles específicos de unidades ou arquivos DICOM.

## 1. Objetivo e requisito funcional

O objetivo da integração é permitir que um médico autenticado no Portal abra, no **RadiAnt já instalado em seu computador Windows**, somente o estudo para o qual ele foi autorizado. A solução não pode modificar a configuração hospitalar preexistente do RadiAnt, incluindo `pacs.xml`, IPs, portas, AE Titles, licenças ou PACS locations.

O requisito de experiência do usuário também é explícito: o médico comum não deve abrir PowerShell, executar scripts, preencher configurações DICOM ou manipular arquivos técnicos. A primeira instalação deve ser visual; nas utilizações posteriores, o navegador deve solicitar somente a autorização padrão do Windows para abrir o aplicativo local.

> O Portal é o ponto de decisão de acesso ao estudo. O RadiAnt recebe arquivos temporários locais, e não acesso direto ao PACS remoto.

## 2. Alternativas analisadas

| Alternativa | Preserva a configuração atual do RadiAnt | Mantém autorização por estudo no Portal | Situação |
|---|---:|---:|---|
| Query/Retrieve direto do RadiAnt ao PACS | Sim | Não integralmente | Não adotada para computadores pessoais externos. |
| Envio DICOM ao listener padrão `RADIANT:11112` | Sim | Parcialmente | Não adotada; depende de rede reversa, NAT, firewall e IP alcançável. |
| Download manual de ZIP e abertura pelo médico | Sim | Sim até a entrega | Mantido apenas como contingência operacional. |
| **Assistente local + arquivos temporários** | **Sim** | **Sim** | **Arquitetura escolhida.** |

O modo escolhido usa a capacidade documentada do RadiAnt de abrir arquivos ou diretórios DICOM locais pelos argumentos de linha de comando, sem exigir que o aplicativo consulte um PACS configurado. [1]

## 3. Arquitetura implementada no piloto

| Componente | Responsabilidade | Dados que não recebe ou não altera |
|---|---|---|
| Portal PACS na VM1 | Valida sessão, RBAC, unidade e acesso ao Study UID; emite token opaco temporário de uso único. | Não entrega configuração do PACS ao computador do médico. |
| Rota de launch do Portal | Emite a URI `pacs-radiant://open/<token>`, depois da autorização clínica. | O token não contém nome de paciente, Study UID, URL do PACS ou credencial. |
| Assistente RadiAnt Windows | Recebe somente a URI própria, baixa o pacote temporário via HTTPS, extrai em diretório próprio e chama o RadiAnt com `-d`. | Não lê, grava, substitui ou remove `pacs.xml`, IP, porta, AE Title ou licença. |
| RadiAnt existente | Abre os arquivos temporários locais. | Não realiza C-FIND, C-GET, C-MOVE ou Query/Retrieve nesse fluxo. |

O Assistente foi implementado como executável Windows compilado e instalador visual por usuário. O instalador registra somente o protocolo customizado `pacs-radiant://` em `HKCU`, sem privilégios administrativos e sem substituir associações existentes do RadiAnt. A ativação por URI própria está alinhada ao mecanismo de ativação de aplicativos Windows documentado pela Microsoft. [2]

## 4. Controles de segurança previstos

| Controle | Estado no código do piloto | Observação de auditoria |
|---|---|---|
| Autorização do estudo no Portal | Implementado | A emissão do token depende da validação de unidade e permissão de leitura. |
| Token opaco, curto e de uso único | Implementado | O token é consumido na primeira entrega; token expirado ou reutilizado é recusado. |
| Entrega sem PACS direto | Implementado | O computador não recebe parâmetros de conexão de PACS. |
| Validação de URI no Assistente | Implementado | O Assistente aceita somente o esquema próprio, host `open` e token de formato esperado. |
| Extração de ZIP controlada | Implementado | O pacote é limitado e rejeita caminhos inválidos; a abertura usa diretório temporário exclusivo. |
| Limpeza de arquivos temporários | Implementado | A limpeza ocorre para diretórios antigos, sem acessar arquivos ou configurações do RadiAnt. |
| Assinatura de código do instalador | Pendente | Obrigatória antes de distribuição ampla. |
| Confirmação de dispositivo vinculada ao Portal | Pendente | Evolução prevista antes de uso em escala. |

## 5. Evolução do piloto e evidências

O primeiro piloto utilizava um arquivo PowerShell para registrar o protocolo local. Embora tecnicamente funcional, esse método foi rejeitado por não atender ao perfil de usuário final. Ele foi removido da experiência do Portal.

Em seguida, foi criado um instalador visual Windows (`PacsRadiantAssistantSetup.exe`), compilado a partir do componente local e configurado para registrar a URI `pacs-radiant://`. O Portal passou a disponibilizar o instalador pelo botão **Ativar RadiAnt**.

Os testes de código concluídos no ambiente de desenvolvimento incluem **34 arquivos Vitest, 232 testes aprovados e 1 teste de integração de MinIO intencionalmente ignorado**, além de TypeScript sem erros, build de produção concluído e compilação do executável/instalador Windows concluída. Essas evidências validam a estrutura do código, mas não substituem a validação do download e da instalação em computador Windows externo.

## 6. Problema observado: bloqueio persistente de download

Durante o teste em Windows, o navegador apresentou a mensagem equivalente a **“Não foi possível baixar — Algo deu errado”** ao tentar baixar `PacsRadiantAssistantSetup.exe`. A falha ocorreu antes da instalação e antes da abertura do RadiAnt.

| Tentativa | Mecanismo de entrega | Resultado |
|---|---|---|
| Primeira | Link para objeto de storage com redirecionamento temporário. | Navegador bloqueou ou interrompeu o download. |
| Segunda | Endpoint autenticado do Portal transmitindo o executável em streaming, com `Content-Disposition: attachment`. | O navegador continuou reportando falha de download. |

O contexto visual do teste indica acesso ao Portal por endereço IP/porta em HTTP. Essa condição é uma **hipótese técnica prioritária**, ainda pendente de confirmação pelos cabeçalhos e pela configuração Nginx da VM1. Navegadores Chromium aplicam proteções adicionais a downloads de executáveis e a conteúdo considerado inseguro; downloads por HTTP ou origem não confiável podem ser bloqueados ou receber tratamento restritivo. [3] [4]

Não se recomenda desativar Safe Browsing, políticas corporativas, antivírus ou proteções do navegador para contornar o problema. A correção deve ocorrer na origem e na distribuição do arquivo.

## 7. Causa raiz confirmada

A coleta de evidências na VM1 confirmou a causa raiz. O processo do Portal não possui as variáveis `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`, e, durante o clique em **Ativar RadiAnt**, o log registrou:

```text
[StorageProxy] installer download failed: Error: Storage proxy not configured
```

Logo, o endpoint autenticado não conseguia obter o instalador hospedado no armazenamento do ambiente de desenvolvimento. O navegador recebia uma resposta de erro durante o download e mostrava uma mensagem genérica. O domínio HTTPS, o certificado e a reversão HTTP para HTTPS foram validados na VM1 e não são a causa raiz deste incidente.

| Hipótese | Status | Evidência |
|---|---|---|
| Portal acessado por HTTP/IP em vez de HTTPS | Descartada como causa raiz | `https://lauds.com.br` respondeu HTTP 200 e HTTP redirecionou para HTTPS. |
| Política de download do navegador ou organização | Não confirmada | Pode ser reavaliada apenas se persistir após a entrega local válida. |
| Proxy de storage sem configuração na VM1 | **Confirmada** | Ausência das variáveis necessárias e log técnico explícito. |
| Ausência de assinatura de código | Pendente | Continua relevante para distribuição ampla, porém não explica a falha antes de o arquivo chegar ao Windows. |

## 8. Estratégia de correção local da VM1

O instalador será publicado como **asset versionado de release** no repositório GitHub. A VM1 receberá o artefato por um script de provisionamento versionado (`scripts/provision-radiant-assistant.sh`), que baixa somente por HTTPS, valida SHA-256 e instala o arquivo fora do diretório da aplicação em `/var/lib/pacs-radiant-assistant/`.

O endpoint autenticado do Portal transmitirá então esse arquivo local para o navegador com `Content-Disposition: attachment`, `Content-Length` e checksum em cabeçalho. A VM1 não dependerá do storage de desenvolvimento, e o instalador continuará fora do repositório de produção e fora de `dist/`.

## 9. Recomendações de correção

| Prioridade | Recomendação | Critério de aceite |
|---|---|---|
| P0 | Provisionar o asset de release localmente na VM1 e validar SHA-256 antes de liberá-lo pelo endpoint autenticado. | O endpoint retorna o arquivo local com tamanho e checksum esperados. |
| P0 | Manter o Portal e a entrega do instalador por domínio HTTPS confiável, sem orientar uso de IP/porta HTTP ao usuário final. | O navegador apresenta download normal de `.exe` sem falha de rede. |
| P1 | Aplicar certificado de assinatura de código ao instalador Windows antes da distribuição ampla. | Arquivo assinado e verificável nas propriedades do Windows. |
| P1 | Manter o instalador como arquivo de primeira utilização e o esquema `pacs-radiant://` como fluxo diário. | Após instalar uma vez, o médico só confirma a janela padrão de abertura do Windows. |
| P2 | Adicionar confirmação de ativação vinculada a dispositivo e telemetria técnica sem dados clínicos. | O Portal diferencia instalação concluída, URI ausente e falha de abertura. |

## 10. Limites e itens excluídos

Este piloto não altera a integração Horos para macOS e não habilita acesso DICOM direto do RadiAnt ao PACS. Também não configura listener, porta 11112, AE Title padrão, VPN, firewall, NAT ou PACS locations no computador do médico.

O teste completo de usuário final permanece pendente até que o download do instalador seja concluído com sucesso em Windows. Nenhuma conclusão de produção deve ser emitida antes desse aceite.

## 11. Evidências de aceite solicitadas à VM1

Após o provisionamento local, a auditoria deve registrar: checksum do artefato, permissões do arquivo em `/var/lib/pacs-radiant-assistant/`, status HTTP e cabeçalhos da resposta autenticada, além do resultado do download em Windows. Não devem ser incluídos `.env`, cookies de sessão, tokens temporários, nomes de pacientes ou arquivos DICOM.

## 12. Achado do piloto Windows — detecção do RadiAnt

O instalador do piloto foi obtido com integridade confirmada por SHA-256, mas o Assistente informou inicialmente que o RadiAnt não estava instalado. A coleta de somente leitura no computador piloto identificou o executável em `C:\Program Files\RadiAntViewer64bit\RadiAntViewer.exe`. O Assistente procurava somente os diretórios `RadiAntViewer` e, por isso, não reconheceu a instalação de 64 bits validada.

Foi preparada uma correção que acrescenta `RadiAntViewer64bit`, locais comuns 32/64 bits e registros App Paths ao mecanismo de descoberta. Essa correção não lê, altera ou remove `pacs.xml`, AE Title, IP, porta, licença ou qualquer configuração hospitalar do RadiAnt. A nova validação do piloto deve confirmar somente a identificação do executável antes de abrir o estudo temporário.

## Referências

1. [RadiAnt DICOM Viewer — Command-line arguments](https://www.radiantviewer.com/dicom-viewer-manual/command-line_arguments.html)
2. [Microsoft Learn — Handle URI activation](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation)
3. [Chromium Blog — Protecting users from insecure downloads in Google Chrome](https://blog.chromium.org/2020/02/protecting-users-from-insecure.html)
4. [Google Chrome Help — Google Chrome blocks some downloads](https://support.google.com/chrome/answer/6261569)
