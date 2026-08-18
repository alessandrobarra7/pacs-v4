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

## 7. Causa ainda não concluída

Até a emissão deste relatório, a causa raiz do bloqueio ainda não está comprovada. As hipóteses em investigação são apresentadas abaixo em ordem de prioridade.

| Hipótese | Evidência atual | Como confirmar sem risco |
|---|---|---|
| Portal acessado por HTTP/IP em vez de HTTPS/domínio | Indício visual no navegador e natureza do arquivo `.exe`. | Inspecionar URL efetiva, Nginx, portas 80/443 e resposta HTTPS na VM1. |
| Política de download do navegador ou organização | A mensagem do navegador menciona contato com organização. | Verificar política local do browser e eventos de download, sem desabilitar controles. |
| Cabeçalhos ou resposta interrompida no proxy | O endpoint foi alterado de redirecionamento para streaming, mas a falha persistiu. | Capturar status, `Content-Length`, `Content-Disposition`, cadeia de proxy e logs Nginx/PM2. |
| Ausência de assinatura de código | O instalador é de piloto e não está assinado. | Verificar se o arquivo chega ao disco; se chegar, observar SmartScreen separadamente. |

## 8. Recomendações de correção

| Prioridade | Recomendação | Critério de aceite |
|---|---|---|
| P0 | Servir o Portal e o instalador por domínio HTTPS confiável, sem acesso do usuário final via IP/porta HTTP. | O navegador apresenta download normal de `.exe` sem falha de rede. |
| P0 | Coletar cabeçalhos HTTP e logs da VM1 para distinguir bloqueio do browser, Nginx ou aplicação. | Status, tamanho e `Content-Disposition` documentados e coerentes. |
| P1 | Aplicar certificado de assinatura de código ao instalador Windows antes da distribuição ampla. | Arquivo assinado e verificável nas propriedades do Windows. |
| P1 | Manter o instalador como arquivo de primeira utilização e o esquema `pacs-radiant://` como fluxo diário. | Após instalar uma vez, o médico só confirma a janela padrão de abertura do Windows. |
| P2 | Adicionar confirmação de ativação vinculada a dispositivo e telemetria técnica sem dados clínicos. | O Portal diferencia instalação concluída, URI ausente e falha de abertura. |

## 9. Limites e itens excluídos

Este piloto não altera a integração Horos para macOS e não habilita acesso DICOM direto do RadiAnt ao PACS. Também não configura listener, porta 11112, AE Title padrão, VPN, firewall, NAT ou PACS locations no computador do médico.

O teste completo de usuário final permanece pendente até que o download do instalador seja concluído com sucesso em Windows. Nenhuma conclusão de produção deve ser emitida antes desse aceite.

## 10. Evidências solicitadas à VM1

Para fechar a causa raiz, a auditoria deve coletar em modo somente leitura: portas expostas, estado do Nginx, resposta local do endpoint do instalador, resposta HTTPS/HTTP do domínio público e configuração de reverse proxy. Não devem ser incluídos `.env`, cookies de sessão, tokens temporários, nomes de pacientes ou arquivos DICOM.

## Referências

1. [RadiAnt DICOM Viewer — Command-line arguments](https://www.radiantviewer.com/dicom-viewer-manual/command-line_arguments.html)
2. [Microsoft Learn — Handle URI activation](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation)
3. [Chromium Blog — Protecting users from insecure downloads in Google Chrome](https://blog.chromium.org/2020/02/protecting-users-from-insecure.html)
4. [Google Chrome Help — Google Chrome blocks some downloads](https://support.google.com/chrome/answer/6261569)
