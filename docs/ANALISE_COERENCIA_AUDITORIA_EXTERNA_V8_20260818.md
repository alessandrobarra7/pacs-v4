# Análise de Coerência — Auditoria Externa V8

**Documento analisado:** `AVALIACAO_CODIGO_V8_PONTOS_DE_ATENCAO.txt`  
**Data da reconciliação:** 18/08/2026  
**Escopo:** avaliação técnica do relatório externo comparada ao código atual e ao estado conhecido da infraestrutura.  
**Importante:** nenhuma correção de código ou alteração de infraestrutura foi executada nesta análise.

## Conclusão executiva

A auditoria externa é **tecnicamente coerente em seus achados centrais**. Ela identifica corretamente que o instalador RadiAnt não tem assinatura Authenticode; que as quatro correções P0 anteriores estão presentes no código; que três otimizações de desempenho foram implementadas; e que ainda existem pontos secundários de autorização, código legado, desempenho e infraestrutura.

O relatório também é prudente ao distinguir fatos verificáveis por código de fatos que dependem do ambiente de produção. Essa é uma boa prática de auditoria. Há, contudo, duas ressalvas importantes: a recomendação de Microsoft Trusted/Artifact Signing não é imediatamente aplicável à situação atual sem confirmar elegibilidade, e o arquivo executável analisado pelo auditor não corresponde em tamanho ao artefato v0.1.2-pilot atualmente provisionado na VM1. Portanto, a conclusão sobre ausência de assinatura permanece válida, mas o relatório deve ser tratado como análise de um *snapshot* anterior do instalador.

## Matriz de coerência dos achados

| Tema da auditoria | Veredito | Evidência atual | Observação |
|---|---|---|---|
| Instalador RadiAnt sem assinatura Authenticode | **Confirmado** | O processo versionado compila Go e NSIS, sem etapa de assinatura; a assinatura individual continua registrada como pendência. | SHA-256 protege a integridade contra troca acidental ou maliciosa quando o hash esperado é confiável, mas não identifica o publicador para o Windows. |
| Proteção de arquivos `laudos/` | **Confirmado** | `server/_core/index.ts` valida `print_reports` para a unidade identificada no prefixo `laudos/<unitId>/`. | A proteção é compatível com o isolamento multi-tenant definido para o Portal. |
| Fallback legado de autorização | **Confirmado** | A política atual restringe o fallback a permissões de leitura segura. | Correção P0 relevante e corretamente reconhecida pela auditoria. |
| Áudios e anexos autorizados por estudo | **Confirmado** | Upload, listagem e exclusão consultam a autorização do estudo antes de atuar. | A autorização de exclusão ainda usa `view_studies`; ver prioridade 1. |
| Validação de *magic bytes* | **Confirmado** | Uploads de áudio e imagem verificam o conteúdo do arquivo, além do tipo informado pelo navegador. | Medida apropriada contra upload disfarçado. |
| Cache de autorização DICOM de 60 segundos | **Confirmado** | `createDicomAccessCache` usa TTL padrão de 60 s, não armazena negações e é específico por usuário, perfil, unidade, permissão e estudo. | Há janela máxima de até 60 s após revogação, como apontado pela auditoria; é uma troca de desempenho conscientemente limitada. |
| Cache de bucket MinIO e leitura parcial de cabeçalhos DICOM | **Confirmado** | Cache de bucket de 5 min; leitura limitada a 256 KiB e concorrência controlada para metadados DICOM. | O relatório descreve corretamente as otimizações já implementadas. |
| `storageProxy.ts` legado e não utilizado | **Confirmado** | A busca atual não encontrou referência a `registerStorageProxy` nem `streamStorageDownload` fora do próprio módulo. | O fluxo ativo do instalador usa `radiantInstaller.ts` e artefato local da VM1. |
| Proxy DICOMweb ainda bufferiza resposta | **Confirmado** | A rota chama `response.arrayBuffer()` antes de `res.send(...)`. | O comentário no código fala em streaming, mas a implementação atual ainda materializa o corpo em memória. |
| Cache DICOM com I/O síncrono | **Confirmado, impacto administrativo** | `/api/dicom-cache-info` usa `readdirSync` e `statSync`. | A rota é administrativa; ainda pode bloquear o processo quando houver muitos estudos/arquivos. |
| PM2 em modo fork | **Confirmado no último diagnóstico da VM1** | O processo `pacs-portal` foi observado em modo `fork`, com uma instância. | Deve ser avaliado com testes de capacidade, não alterado somente por recomendação genérica. |
| Migração 0047 e índices de storage | **Coerente** | A migration idempotente e os índices de áudio/anexos já foram reconciliados no schema. | Não há divergência conhecida entre Drizzle e a migration nessa área. |

## Ressalvas e correções necessárias no próprio relatório

### 1. Azure Artifact Signing não é um caminho imediato garantido

A auditoria recomenda Microsoft Trusted Signing (hoje denominado **Artifact Signing**) e condiciona o uso a CNPJ verificável. A recomendação é correta em tese, mas incompleta para o caso atual. A documentação da Microsoft limita a identidade pública individual a Estados Unidos e Canadá; para identidade organizacional pública, a lista atual de localidades elegíveis não inclui o Brasil. Além disso, não há CNPJ/entidade formalizada neste momento. Portanto, o Azure não deve ser tratado como solução imediatamente disponível sem confirmação formal de elegibilidade.

Para o cenário provisório, um certificado **IV Authenticode** de emissor que aceite validação individual de residente no Brasil continua sendo a alternativa a confirmar. Não existe solução gratuita que crie automaticamente reputação pública no Windows.

### 2. O artefato auditado parece anterior ao instalador atual

O documento externo informa um executável de **2.428.532 bytes**. O artefato v0.1.2-pilot provisionado posteriormente na VM1 possui **2.434.429 bytes** e hash SHA-256 diferente por ser uma versão atualizada. Essa diferença não invalida a conclusão de que o fluxo não assina o código, mas mostra que a auditoria deve registrar o commit e o hash exatos analisados para manter rastreabilidade.

### 3. Assinatura reduz alerta de publicador, mas não elimina toda fricção no primeiro dia

O relatório acerta ao afirmar que assinatura é necessária. Convém apenas precisar que ela não garante o desaparecimento imediato do SmartScreen ou de avisos de reputação de download. A assinatura válida identifica o publicador e preserva uma identidade para acumular reputação; o mecanismo de reputação continua dependente de distribuição e telemetria do ecossistema Windows. A confirmação para abrir `pacs-radiant://` é outra proteção do navegador e deve continuar existindo.

## Pontos mais importantes, em ordem de prioridade

| Prioridade | Ponto | Risco e decisão necessária | Ação recomendada |
|---|---|---|---|
| **P0 pendente de negócio** | Assinatura do instalador Windows | Mantém o instalador como publicador desconhecido e prejudica a distribuição comercial. | Manter como piloto até obter certificado IV ou OV; depois assinar Assistente e instalador, usar carimbo de tempo e validar em Windows limpo. |
| **P1 — decisão de permissão** | Exclusão de áudios e anexos com `view_studies` | Um usuário que pode somente visualizar estudo pode apagar mídia clínica se a regra de negócio não vedar isso. | Decidir se exclusão deve exigir `edit_reports`, novo `manage_attachments`, ou papel administrativo. Só alterar após aprovar a política clínica. |
| **P1 — dívida de segurança** | `storageProxy.ts` sem uso e sem autenticação | Não cria exposição enquanto não é registrado, mas pode virar brecha se alguém o ativar no futuro. | Preferência: remover o módulo legado e seus testes/referências. Alternativa: colocar bloqueio explícito de autenticação/autorização antes de qualquer registro. |
| **P1 — infraestrutura** | Porta 3000 da VM1 e PostgreSQL da VM2 | A exposição direta da porta 3000 precisa ser confirmada por diagnóstico; PostgreSQL ativo segue sem consumidor identificado. | Executar somente coleta de leitura antes de alterar firewall ou serviços. Não desligar PostgreSQL sem origem comprovada. |
| **P2 — performance** | DICOMweb em memória, I/O síncrono administrativo, competência N+1, C-GET sem limite e PM2 fork | Crescem com volume de estudos e unidades, mas não há evidência de indisponibilidade imediata no volume atual. | Medir tempos, memória, consultas e carga real primeiro; priorizar DICOMweb streaming e agregação da competência quando os dados confirmarem impacto. |
| **P2 — capacidade VM3** | Terceiro disco prometido para RAID | Informação de hardware ainda não está comprovada no relatório. | Inventariar `lsblk`, `mdadm --detail` e estado do RAID; nunca recriar RAID ou formatar discos sem confirmação expressa. |

## Avaliação final

O relatório é **aproveitável e útil para governança técnica**. Ele não encontrou um novo P0 ativo no código auditado; os pontos mais relevantes são a assinatura de código ainda não implementada, a definição de permissão de exclusão de mídia clínica e a remoção/proteção do módulo legado de storage. As recomendações de desempenho são corretas, porém devem seguir medição antes de mudança estrutural.

Para a próxima rodada, a melhor ordem é: **(1)** decisão da política de exclusão, **(2)** remoção ou hardening do `storageProxy`, **(3)** diagnóstico somente-leitura da VM1 para porta 3000, **(4)** diagnóstico de consumidores do PostgreSQL e discos/RAID, **(5)** priorização de desempenho com métricas reais. A assinatura Windows permanece pendente por decisão de contratação, sem mudança de código até que exista certificado válido.
