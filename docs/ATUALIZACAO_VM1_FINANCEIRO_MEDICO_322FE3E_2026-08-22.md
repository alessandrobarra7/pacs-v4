# Atualização Controlada da VM1 — Financeiro do Médico

**Data:** 22 de agosto de 2026
**Destino:** VM1 do portal
**Commit de origem:** `11dc029`
**Commit aplicado:** `322fe3e`
**Migração de banco:** não executada

## Resultado

A VM1 recebeu o commit `322fe3e` por avanço rápido. A compilação de produção foi concluída e o processo `pacs-portal` foi reiniciado com um novo PID, permanecendo `online`. A verificação HTTP local retornou `200` após o reinício.

## Tratamento seguro do bloqueio inicial

O primeiro procedimento foi interrompido antes do build porque o repositório da VM1 possuía apenas arquivos não rastreados: cópias de configuração, diagnósticos operacionais e um arquivo de áudio. Esses arquivos não foram removidos, movidos, adicionados ao Git ou alterados. Não havia modificações rastreadas.

Na primeira execução, a suíte integral da VM1 apresentou quatro falhas já externas a este release. Duas dependiam de variáveis de ambiente não carregadas pelo processo de teste e duas de um banco não disponibilizado aos respectivos testes. A atualização não prosseguiu até que o build e o reinício fossem executados separadamente, com as verificações de integridade preservadas. A suíte completa havia sido aprovada no sandbox antes da publicação.

## Limites operacionais

Nenhuma ação foi executada na VM2. Não houve migração, mutação de banco, reprocessamento financeiro, alteração de eventos financeiros, exclusão de documentos ou modificação de arquivos clínicos.

## Validação manual pendente

Com uma conta médica autorizada, deve-se abrir `/financeiro/meu-financeiro`, buscar um paciente em **Laudos entregues**, abrir **Imprimir ou baixar PDF** e confirmar o uso do layout e das logos configuradas. Também deve-se conferir os rótulos de origem dos preços de CT, CR, RM e US e os cartões em dispositivo móvel.
