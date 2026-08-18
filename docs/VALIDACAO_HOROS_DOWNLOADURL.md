# Validação Real — Integração Horos via `DownloadURL`

**Data da validação:** 17 de agosto de 2026  
**Escopo:** abertura de um estudo DICOM real no Horos a partir do botão do Portal.  
**Situação final:** **aprovada**.

## Resultado executivo

O botão **Horos** do Portal abriu o aplicativo Horos instalado na estação de trabalho e carregou corretamente o estudo DICOM. O registro do Portal confirmou que o estudo continha **1.096 arquivos**. Após a correção, o Horos exibiu o estudo na sua base local e abriu as imagens, incluindo a série axial apresentada no teste operacional.

| Etapa | Evidência observada | Resultado |
|---|---|---|
| Acionamento no Portal | Log: `[DICOM Viewer Launch] HOROS | <StudyInstanceUID> | 1096 arquivos` | O botão gerou o comando de abertura e localizou o estudo no cache da VM1. |
| Primeira tentativa | O Horos foi iniciado, mas exibiu `WADO Retrieve Failed` com status HTTP 404. | Falha na entrega do arquivo ao aplicativo externo. |
| Correção aplicada | O launch passou a gerar `/api/dicom-export-dl/<token>` em vez da rota autenticada de exportação. | O Horos passou a receber um ZIP DICOM temporário acessível sem cookie web. |
| Segunda tentativa | Horos exibiu o estudo e abriu as imagens DICOM. | Fluxo validado com sucesso. |

## Causa técnica da falha inicial

O protocolo `horos://?methodName=DownloadURL` abre o Horos localmente, mas o download subsequente é realizado pelo aplicativo Horos, não pelo navegador. Portanto, esse download não encaminha o cookie de sessão do Portal.

Antes da correção, a URL entregue ao Horos apontava para:

```text
/api/dicom-export/<StudyInstanceUID>
```

Essa rota exige sessão autenticada do navegador. Como o Horos não possuía o cookie, a busca do arquivo falhou e a aplicação exibiu o erro WADO 404. O método `DownloadURL` aceita arquivos ZIP ou DICOM, desde que a URL possa ser obtida pelo aplicativo local.[1]

## Correção implementada

O endpoint autenticado de lançamento, `/api/dicom-viewer-launch/:studyUid`, continua validando a sessão, a permissão da unidade e o acesso ao estudo. Somente depois dessas verificações ele cria um token aleatório de 24 bytes, armazenado em memória e válido por duas horas.

O Horos recebe uma URL no formato abaixo:

```text
horos://?methodName=DownloadURL&URL=https%3A%2F%2Flauds.com.br%2Fapi%2Fdicom-export-dl%2F<token>&Display=YES
```

A rota pública controlada `/api/dicom-export-dl/:token` valida o token e transmite um ZIP com os arquivos DICOM do estudo que já estavam no cache temporário da VM1. O token não contém credenciais, não revela o identificador do estudo na URL e expira automaticamente.

> A rota temporária permite acesso ao ZIP apenas enquanto o token estiver válido. Ela não substitui a autorização do Portal: o token só é emitido após a autorização do usuário e somente para o estudo solicitado.

## Distribuição de responsabilidades

| Componente | Responsabilidade no fluxo validado |
|---|---|
| Estação do médico | Navegador dispara o esquema `horos://`; Horos instalado realiza o download e abre o estudo. |
| VM1 — Portal | Verifica acesso, cria token temporário, gera o ZIP em streaming e registra os eventos de lançamento. |
| Cache DICOM da VM1 | Fornece os arquivos DICOM temporariamente baixados para compor o ZIP. |
| VM2 — Banco | Mantém metadados e permissões; não armazena os bytes DICOM do ZIP. |
| VM3 — MinIO | Não participa deste fluxo específico de visualização Horos; permanece destinada a laudos fechados, anexos e áudios. |

## Requisitos e limites operacionais

O Horos deve estar instalado no mesmo computador em que o usuário clica no botão, pois o esquema `horos://` é tratado localmente pelo sistema operacional. O estudo também precisa estar disponível no cache temporário da VM1; se não estiver, o Portal instrui o usuário a abrir ou baixar o exame primeiro.

Para auditoria de novos testes, pode-se acompanhar os logs da VM1 e procurar pelos eventos `DICOM Viewer Launch` e `DICOM Export Token`. Não devem ser registrados em documentação tokens temporários, cookies, credenciais ou capturas de tela contendo dados clínicos identificáveis.

## Validação de código

A correção foi incorporada no commit **`1df2863`** e validada por build de produção e pela suíte Vitest: **28 arquivos de teste aprovados, 215 testes aprovados e 1 teste de integração S3 intencionalmente ignorado**.

## Referências

[1]: https://www.osirix-viewer.com/resources/ris-integration/ "OsiriX RIS Integration — método DownloadURL"
