# Contenção de traversal no cache DICOM

**Classificação:** correção de segurança crítica.
**Escopo:** VM1, router PACS e auxiliar C-GET local.
**Dados clínicos e financeiros:** não modificados.

## Risco corrigido

O fluxo de abertura de visualizador recebe um `Study Instance UID` e prepara um diretório transitório em `/tmp/dicom-cache`. Antes desta correção, uma entrada sem formato DICOM garantido poderia ser interpretada como parte de um caminho de sistema pelo auxiliar Python, que limpa o cache anterior do estudo.

A correção trata o UID como **identificador DICOM**, não como caminho de arquivo. Ela não tenta reproduzir valores malformados contra nenhum ambiente.

## Barreiras aplicadas

| Camada | Controle | Resultado |
|---|---|---|
| Contrato TypeScript | `studyInstanceUidSchema` aceita apenas números separados por ponto, com até 64 caracteres. | Valores com barras, espaços, letras, sequência vazia ou separadores repetidos são rejeitados antes da lógica de negócio. |
| Routers | O schema compartilhado foi aplicado aos endpoints que recebem UID de estudo, incluindo PACS, laudos, metadados, anamnese, anotações, SLA, prioridade e composição de legenda. | Reduz-se a superfície de entradas inconsistentes em todo o Portal. |
| Auxiliar Python | `dicom_move.py` valida novamente o UID antes de qualquer operação local. | Uma chamada futura fora do router também é rejeitada. |
| Caminho canônico | O diretório do estudo é resolvido com `realpath` e comparado por `commonpath` com `/tmp/dicom-cache`. | Nenhuma remoção é permitida fora do diretório de cache autorizado. |

## Regra operacional

Um `Study Instance UID` válido tem forma como `1.2.840.113619.2.55.3.604688119.868.1187175012.28`. O sistema rejeita qualquer valor que não siga a forma numérica pontuada, inclusive entradas com `/`, `..`, letras ou espaço.

Quando o cache de um UID válido já existe, ele continua sendo removido apenas dentro de `/tmp/dicom-cache/<uid>` antes do novo C-GET. O PACS remoto não sofre exclusão de dados nesse processo.

## Validação da correção

Foram executados, sem acionar operações destrutivas:

```bash
pnpm vitest run server/dicom-study-uid-security.test.ts server/pacs.test.ts server/pacs.query.test.ts server/dicom-access-cache.test.ts
pnpm check
pnpm build
```

O teste de regressão valida a aceitação de UIDs DICOM regulares, a rejeição de formatos inválidos e a presença das proteções no auxiliar Python. Em produção, o teste funcional permitido é abrir um estudo com UID DICOM válido e confirmar o fluxo normal do visualizador.

## Operação e reversão

Esta alteração não inclui migration de banco e não exige ação na VM2 ou VM3. A atualização da VM1 deve seguir o runbook padrão: árvore limpa, fast-forward para o commit publicado, testes, build, reinício do PM2 e verificação HTTP 200.

Não remova a validação do Python mesmo que o router TypeScript já valide o UID; ela é uma defesa independente para qualquer chamada futura ao auxiliar.
