# Sinalização Clínica de Estudos: Urgência e Prioridade Máxima

## Finalidade

O Portal PACS permite identificar estudos que exigem atenção clínica antes da elaboração do laudo. A sinalização é realizada na listagem de estudos e aparece logo abaixo do status do laudo, tanto no desktop quanto no celular. Os dois níveis disponíveis são **Urgência** e **Prioridade máxima**.

## Regras de acesso

| Ação | Operador | Atendente | Médico | Outros perfis |
|---|---:|---:|---:|---:|
| Ver a prioridade do estudo autorizado | Sim | Sim | Sim | Sim, quando puder ver o estudo |
| Criar prioridade | Sim | Sim | Não | Não |
| Trocar ou remover a própria prioridade | Sim | Sim | Não | Não |
| Alterar prioridade criada por outro usuário | Não | Não | Não | Não |

Cada estudo possui no máximo uma sinalização ativa por unidade. A prioridade grava o identificador e o nome do autor. Quando um usuário diferente tenta mudar uma indicação existente, a API nega a operação. A ação é registrada em auditoria como `SET_STUDY_PRIORITY`, `UPDATE_STUDY_PRIORITY` ou `CLEAR_STUDY_PRIORITY`.

## Isolamento de unidade

Antes de persistir uma prioridade, o Portal resolve a unidade real do estudo por meio do cache de estudos ou dos metadados do estudo e verifica a permissão `view_studies` na unidade. O identificador de unidade enviado pela tela não substitui essa validação. Assim, uma conta não pode marcar estudos de outra unidade apenas alterando parâmetros de requisição.

## Dados persistidos

A migração `drizzle/0049_study_priority_flags.sql` adiciona o perfil `atendente`, o grupo de unidade `atendentes`, as novas ações de auditoria e a tabela `study_priority_flags`.

| Campo | Descrição |
|---|---|
| `study_instance_uid` | Identificador DICOM do estudo sinalizado |
| `unit_id` | Unidade proprietária do estudo |
| `priority` | `urgencia` ou `prioridade_maxima` |
| `marked_by_user_id` | Usuário que criou a indicação |
| `marked_by_name` | Nome exibido para rastreabilidade |
| `createdAt` / `updatedAt` | Timestamps de auditoria do registro |

## Implantação

O sandbox recebeu a migração aditiva após verificação somente leitura da estrutura existente. Na infraestrutura real, a migração deve ser aplicada primeiro na **VM2** e validada com `SHOW CREATE TABLE study_priority_flags;`. Somente após a validação do banco a **VM1** pode receber a versão do Portal que contém o novo roteador e a interface.

> A migração não remove tabelas, colunas ou registros clínicos existentes. Ela apenas amplia enums e cria uma tabela nova com chave única por estudo e unidade.
