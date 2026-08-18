# Parecer Técnico — Setor Desempenho v2 e VM3

**Data:** 18 de agosto de 2026  
**Fonte analisada:** `SETOR_DESEMPENHO_ORIENTACOES_v2_VM3.txt`, recebido do usuário.  
**Método:** revisão independente do código atual do Portal, sem executar comandos destrutivos nas VMs.

## Síntese executiva

O relatório externo apontou riscos relevantes. A revisão independente confirmou quatro vulnerabilidades prioritárias no código atual: ausência de isolamento do prefixo `laudos/` no proxy de mídia, fallback legado excessivamente permissivo, operações de anexos e áudios sem validação do estudo, e confiança no tipo MIME informado pelo cliente.

Essas quatro falhas foram corrigidas no ambiente de desenvolvimento antes de qualquer alteração adicional de desempenho. A correção foi coberta por novos testes de regressão, além da suíte completa do projeto. A rotação da credencial MinIO permanece uma ação operacional separada e não foi executada por este parecer.

| Área | Veredito da revisão | Situação após esta etapa |
|---|---|---|
| Laudos HTML na VM3 | **Confirmado**: o prefixo `laudos/` não possuía validação própria no proxy de mídia. | Corrigido com verificação de permissão `print_reports` na unidade da chave. |
| Fallback de permissões | **Confirmado**: uma conta sem concessão granular recebia qualquer ação na sua unidade legada. | Corrigido: somente leitura segura (`view_studies`, `view_anamnesis`, `print_reports`). |
| Anexos e áudios | **Confirmado**: listagem, upload e exclusão não validavam o estudo associado. | Corrigido com `assertDicomFileAccess` antes das operações. |
| Tipo real do upload | **Confirmado**: o MIME do cliente era persistido sem verificação de bytes. | Corrigido com reconhecimento de assinaturas de PNG/JPEG/GIF/WebP e MP3/WAV/OGG/WEBM. |
| Credencial MinIO | **Não revalidado no código**; é um risco operacional se a chave anterior foi exposta. | Pendente de rotação controlada, sem registrar segredo em código ou documentação. |

> Não existe base técnica para declarar a aplicação “100% segura” sem validação contínua. Este parecer registra o estado verificado nesta etapa e separa claramente o que já foi corrigido do que ainda depende de medição ou ação operacional.

## Correções P0 implementadas

### Isolamento de laudos assinados

Os laudos assinados são armazenados com a chave `laudos/<unitId>/...`. A rota autenticada `/api/media/*` agora identifica esse padrão e exige a permissão `print_reports` na unidade correspondente. Assim, conhecer ou tentar adivinhar uma URL não basta para acessar o conteúdo de outra unidade.

### Fallback legado com privilégio mínimo

O fallback para contas antigas sem registro em `user_unit_permissions` foi reduzido às permissões de leitura necessárias para continuidade operacional. Ações de edição, assinatura, alteração de legenda e gestão de templates continuam bloqueadas até que exista uma concessão granular explícita.

### Áudios e anexos vinculados ao estudo

As procedures de listar, consultar status, gravar e excluir agora validam o `study_instance_uid` por meio da camada central de autorização. Para exclusões por ID, o registro é carregado primeiro e sua vinculação ao estudo é validada antes da remoção do objeto ou do metadado.

### Validação real de arquivos

O Portal não usa mais a declaração MIME do navegador como verdade. O tipo é reconhecido pelos bytes iniciais do arquivo e o nome persistido recebe extensão derivada desse tipo real. Conteúdo HTML ou JavaScript disfarçado de mídia é rejeitado antes de alcançar o MinIO ou o filesystem local.

## Evidência de validação

| Verificação | Resultado |
|---|---|
| Novos testes de isolamento e tipo real de arquivo | Aprovados. |
| Suíte Vitest completa | **29 arquivos aprovados, 218 testes aprovados e 1 teste de integração S3 ignorado intencionalmente**. |
| Build de produção | Concluído sem erro TypeScript. |
| Estado do servidor de desenvolvimento após reinício | Em execução, com verificações de dependência e TypeScript saudáveis. |

## Desempenho: avaliação e ordem de trabalho

O relatório também aponta problemas de desempenho plausíveis. Dois foram diretamente confirmados no código atual: a rota individual de fatias DICOM executa `assertDicomFileAccess` para cada arquivo solicitado e `getOrderedDicomFiles` lê os arquivos `.dcm` completos de forma sequencial para extrair campos de ordenação.

Esses pontos não foram otimizados nesta correção P0, pois a alteração exige medição de produção e testes de comportamento do visualizador. A próxima etapa deve coletar, de forma exclusivamente leitora, CPU, memória, I/O, consultas lentas, índices e tempos de resposta nas três VMs. Só então devem ser priorizados cache de autorização por sessão/estudo, leitura limitada de cabeçalhos DICOM, índices e ajustes de concorrência.

| Prioridade seguinte | Dependência | Objetivo |
|---|---|---|
| Coleta de VM1/VM2/VM3 | Nenhuma alteração operacional | Medir gargalo real de CPU, memória, I/O, MySQL e MinIO. |
| Cache curto de autorização por usuário + estudo | Resultado da coleta e teste de revogação | Eliminar consultas repetitivas ao banco para cada fatia DICOM. |
| Leitura de cabeçalho DICOM | Testes de ordenação clínica | Evitar carregar o conteúdo integral de cada arquivo apenas para ordenar séries. |
| Índices e consultas financeiras | Snapshot do schema e plano de execução da VM2 | Reduzir leituras repetidas e N+1. |

## Controles operacionais pendentes

O endpoint MinIO e o bucket não devem ter credenciais documentadas ou expostas em chat. Caso exista suspeita de exposição anterior, a credencial da aplicação deve ser rotacionada por procedimento controlado, atualizada na VM1 por canal seguro e validada por upload/leitura autenticada antes de revogar a conta anterior.

Os diagnósticos de desempenho devem ser somente de leitura. Não executar `mkfs`, `wipefs`, recriação de RAID, exclusão de bucket, limpeza de cache ou alteração de índice em produção antes de backup e de uma janela de manutenção aprovada.
