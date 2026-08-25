# Guia de Conhecimento — Mapeamento PACS para Descrição DICOM Vazia

**Escopo:** catálogo clínico, worklist PACS e auditoria de seleção automática.  
**Status:** fluxo ativo a partir da migração `0058_pacs_empty_description_mapping_audit.sql`.  
**Público:** administradores raiz, equipe de implantação e desenvolvimento.

---

## 1. Objetivo do recurso

Este guia explica como configurar o portal quando um equipamento PACS envia estudos sem o campo DICOM `StudyDescription`. Nessa situação, a worklist exibe **“Sem descrição”** apenas como um texto de interface. Esse texto não é o valor recebido do PACS e, portanto, não deve ser usado como chave literal de mapeamento.

O recurso permite definir uma legenda canônica para uma modalidade, por exemplo `CR`, quando a descrição recebida estiver efetivamente vazia. Quando a regra é encontrada, o portal cria uma seleção clínica automática, desde que o estudo ainda não possua composição manual ou documento clínico.

> **Regra principal:** “Sem descrição” é um placeholder visual. Para estudos cujo `StudyDescription` é vazio, a configuração correta é marcar **“Aplicar quando a descrição PACS vier vazia”** no catálogo.

| Cenário recebido do PACS | O que a worklist pode mostrar | Regra correta no catálogo |
|---|---|---|
| `StudyDescription = "COLUNA LOMBAR"` | `COLUNA LOMBAR` | Criar mapeamento textual com `COLUNA LOMBAR` |
| `StudyDescription = ""` ou ausente | `Sem descrição` | Marcar **descrição PACS vazia** para a modalidade correspondente |
| `StudyDescription = "Sem descrição"` literalmente | `Sem descrição` | Criar mapeamento textual com `Sem descrição` |

---

## 2. Arquitetura da resolução

O backend separa mapeamentos de texto e mapeamentos de descrição vazia. A modalidade é normalizada em maiúsculas e a descrição textual é comparada sem espaços nas extremidades. Para descrição vazia, a decisão usa somente a modalidade e o sinalizador explícito da regra.

```text
C-FIND PACS
   │
   ├─ StudyDescription contém texto
   │    └─ procura por modalidade + descrição textual normalizada
   │
   └─ StudyDescription está vazio
        └─ procura por modalidade + matches_empty_description = 1
                 │
                 ├─ legenda ativa, disponível na unidade e com documento ativo
                 ├─ estudo sem seleção clínica anterior
                 ├─ estudo sem documento/laudo existente
                 └─ cria seleção com origem pacs_auto
```

O resultado visual da worklist é formado pela seleção canônica persistida. Após uma consulta PACS, a interface invalida e recarrega as seleções para refletir imediatamente uma classificação automática recém-criada.

---

## 3. Configuração operacional no catálogo

O procedimento abaixo deve ser realizado por um usuário com perfil de administrador raiz.

| Etapa | Ação | Resultado esperado |
|---|---|---|
| 1 | Acesse **Administração → Catálogo de exames** | Lista de legendas canônicas disponível |
| 2 | Abra a legenda canônica que deve representar os estudos recebidos sem descrição | Modal de edição do exame canônico aberto |
| 3 | Confirme modalidade, documentos clínicos ativos e disponibilidade da unidade | Regra apta a ser aplicada automaticamente |
| 4 | Em **Mapeamentos PACS**, localize a linha da modalidade, por exemplo `CR` | Regra do equipamento visível |
| 5 | Marque **“Aplicar quando a descrição PACS vier vazia”** | Campo textual é desativado; não deve conter `Sem descrição` |
| 6 | Clique em **Salvar catálogo** | O mapeamento existente é atualizado; seu identificador é preservado |
| 7 | Volte à worklist e execute uma nova consulta pelo filtro de período | Estudos elegíveis passam a exibir a legenda canônica |

Quando existir uma regra antiga com o texto literal `Sem descrição`, ela pode ser convertida usando o toggle da etapa 5. A atualização ocorre no mesmo registro de mapeamento; não é necessário criar uma segunda regra.

---

## 4. Proteções clínicas e de integridade

O automatismo não substitui decisões clínicas já tomadas. A aplicação do mapeamento é bloqueada e registrada quando alguma condição de segurança é encontrada.

| Situação do estudo ou da legenda | Decisão registrada | Efeito |
|---|---|---|
| Sem seleção e sem documento prévio | `applied` | Cria seleção canônica com origem `pacs_auto` |
| Já possui seleção de legenda | `blocked_selection` | Mantém a seleção manual ou automática anterior |
| Já possui documento/laudo | `blocked_report` | Não altera estudo com produção clínica existente |
| Legenda inativa ou indisponível na unidade | `blocked_unavailable` | Não aplica uma regra sem autorização operacional |
| Legenda sem documento clínico ativo | `blocked_no_documents` | Não cria composição incompleta |
| Falha técnica isolada | `failed` | A consulta PACS continua para os demais estudos |

A seleção automática é salva com `selection_source = 'pacs_auto'`. Seleções já existentes continuam identificadas como `manual`, salvo alteração explícita futura. Falhas em um estudo são isoladas por `Promise.allSettled`, de modo que não interrompem a consulta PACS inteira.

---

## 5. Estruturas de banco introduzidas pela migração 0058

| Estrutura | Finalidade |
|---|---|
| `exam_legend_pacs_mappings.matches_empty_description` | Define que a regra deve corresponder a `StudyDescription` vazio, e não a um texto literal |
| `study_exam_legend_selections.selection_source` | Indica se a seleção foi `manual` ou `pacs_auto` |
| `pacs_mapping_decisions` | Registra a decisão, o motivo, a modalidade implícita pela regra, o estudo e o usuário que executou a consulta |

A migração é aditiva e não modifica os dados clínicos existentes. Em produção, a ordem obrigatória é aplicar a migração na **VM2** antes de atualizar a aplicação na **VM1**.

---

## 6. Consultas de auditoria e diagnóstico

As consultas abaixo são somente leitura. Execute-as na VM2 com acesso administrativo ao banco `pacs_portal`. Elas não exibem nome do paciente; o identificador técnico do estudo permanece necessário para rastreabilidade operacional.

### 6.1 Conferir as regras cadastradas

```sql
SELECT
  m.id,
  m.modality,
  m.pacs_description,
  m.matches_empty_description,
  e.exam_name,
  e.is_active
FROM exam_legend_pacs_mappings AS m
INNER JOIN exam_legends AS e ON e.id = m.exam_legend_id
ORDER BY m.modality, m.matches_empty_description DESC, m.pacs_description;
```

### 6.2 Conferir a decisão tomada para estudos classificados automaticamente

```sql
SELECT
  d.createdAt,
  d.study_instance_uid,
  d.unit_id,
  d.decision,
  d.reason,
  e.exam_name,
  d.raw_description
FROM pacs_mapping_decisions AS d
INNER JOIN exam_legends AS e ON e.id = d.exam_legend_id
ORDER BY d.updatedAt DESC
LIMIT 100;
```

### 6.3 Conferir a origem da seleção criada

```sql
SELECT
  s.study_instance_uid,
  s.unit_id,
  s.exam_name_snapshot,
  s.selection_source,
  s.selectedAt
FROM study_exam_legend_selections AS s
WHERE s.selection_source = 'pacs_auto'
ORDER BY s.updatedAt DESC
LIMIT 100;
```

---

## 7. Diagnóstico de falhas comuns

| Sintoma | Causa provável | Ação recomendada |
|---|---|---|
| Worklist continua em `Sem descrição` | A regra textual antiga ainda está ativa, em vez do toggle de descrição vazia | Edite a regra e marque o toggle explícito |
| Não há linha em `pacs_mapping_decisions` | A consulta PACS pode não ter sido executada após salvar o catálogo ou não houve estudo elegível | Atualize a worklist pelo filtro de período e consulte novamente |
| Decisão `blocked_no_documents` | A legenda canônica não possui documento ativo | Configure ao menos um documento clínico e salve o catálogo |
| Decisão `blocked_unavailable` | A legenda está inativa ou bloqueada para a unidade | Habilite a legenda para a unidade aplicável |
| Decisão `blocked_selection` ou `blocked_report` | Estudo já foi tratado manualmente ou já possui documento | Não sobrescrever; esse bloqueio é intencional |
| C-FIND retorna zero estudos | Problema de conectividade, filtro, AE Title ou data; não é um problema do mapeamento | Investigue a conexão PACS antes do catálogo |

---

## 8. Limites e decisões de projeto

O mapeamento automático não altera a descrição original recebida do equipamento. Ele associa uma legenda canônica ao estudo para controlar documentos e fluxo clínico. Essa separação preserva a rastreabilidade entre o dado de origem PACS e a classificação definida pela operação.

Não use o nome exibido na worklist como prova do valor DICOM. Quando o PACS não envia descrição, a interface mostra `Sem descrição` para orientar o operador; a decisão de negócio deve usar a regra explícita de descrição vazia.

Alterações em regras de catálogo valem para consultas futuras. Estudos que já possuem seleção ou documento não são reclassificados automaticamente. Essa limitação é intencional para evitar sobrescrita de trabalho clínico e financeiro.

---

## 9. Arquivos principais do código

| Arquivo | Responsabilidade |
|---|---|
| `drizzle/0058_pacs_empty_description_mapping_audit.sql` | Migração aditiva das estruturas de suporte |
| `drizzle/schema.ts` | Definição das colunas, origem de seleção e decisões auditáveis |
| `server/routers/examCatalog.ts` | Validação da regra explícita e persistência do catálogo |
| `client/src/pages/ExamCatalogPage.tsx` | Toggle de descrição PACS vazia no cadastro administrativo |
| `server/db.ts` | Resolução de regras, criação de seleção e registro de decisão |
| `server/routers/pacs.ts` | Aplicação do mapeamento durante a consulta C-FIND |
| `server/pacsAutoMapping.test.ts` | Regressão do fluxo automático e isolamento de falhas |
| `server/examCatalog.emptyDescription.test.ts` | Regressão do cadastro e atualização da regra no catálogo |

---

## 10. Registro de implantação

A estrutura foi aplicada na VM2 antes da atualização da VM1. O backup prévio da migração é mantido na VM2 em `/root/pacs-backups/`, com permissões restritas. A aplicação deve permanecer no commit que contém a migração `0058` ou posterior para interpretar corretamente a nova configuração.

Este documento deve ser atualizado sempre que forem criadas novas formas de correspondência PACS, regras de prioridade de mapeamento ou mecanismos de reclassificação retroativa.
