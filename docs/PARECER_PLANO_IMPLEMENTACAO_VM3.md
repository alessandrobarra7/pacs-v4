# Parecer Técnico: Plano de Implementação da VM3

Este documento registra a auditoria do `PLANO_IMPLEMENTACAO_CODIGO_VM3.txt` fornecido pelo usuário em 17/08/2026, comparando-o com o estado atual do repositório, o schema do banco de dados e a arquitetura de 3 VMs.

---

## 1. Alinhamento de Escopo (Seção 0 do Plano)

O plano enviado levanta um ponto fundamental de alinhamento:
*   **Instrução Direta do Usuário:** Logotipos, assinaturas de médicos, carimbos, layouts de páginas e configurações gerais permanecem locais na **VM1**, sem migração para a VM3.
*   **Destino da VM3:** Apenas **laudos assinados/retificados (exportados como HTML/PDF)**, **uploads de imagens por exame** (`study_attachments`) e **uploads de áudio por exame** (`study_audio_reports`) devem residir na VM3.

> **Decisão:** O escopo é estritamente ratificado conforme a instrução direta do usuário. Logos, assinaturas e carimbos não serão movidos para o S3 da VM3; eles continuam sendo gerenciados pelo storage local da VM1 (`server/storage.ts`), preservando a estabilidade dos cadastros de médicos e unidades.

---

## 2. Análise dos Itens do Plano vs. Código Atual

| Seção do Plano | Descrição | Status no Código Atual | Ação Necessária |
|---|---|---|---|
| **1. Variáveis de Ambiente** | Configurar `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Já suportado via lazy loading em `server/minio.ts` e `server/storage.ts` | Validar os valores finais no `.env` da VM1 com a nova chave da conta `pacs-app`. |
| **2. Banco de Dados** | Criar tabelas `study_attachments`, `study_audio_reports` e colunas `export_file_key`/`export_file_url` em `reports` | Tabelas parciais ou em andamento no schema | Sincronizar `drizzle/schema.ts` com a DDL real no MySQL da VM2 e aplicar via migração/SQL. |
| **3. Convenção de Chaves** | Organizar por prefixo (`laudos/`, `uploads-imagem/`, `uploads-audio/`) | Já parcialmente padronizado no storage refatorado | Manter a estrutura de prefixos limpa e sem colisão de UUIDs. |
| **4. Rota `/api/media/*`** | Servir arquivos protegidos do S3 com checagem de RBAC e unidade | Implementado em `server/_core/index.ts` e `server/mediaProxy.ts` | Validar comportamento em produção com autenticação ativa. |
| **5. Export de Laudo Assinado** | Salvar cópia HTML autocontida no MinIO no momento da assinatura | Requer ajuste na procedure de assinatura de laudos (`reports.ts`) | Vincular `minioUpload` na assinatura do laudo preenchendo `export_file_key`. |
| **6. Router de Anexos/Áudio** | Criar rotas para upload de imagens e áudios vinculados ao exame | Parcialmente estruturado em `annotations.ts` e `audioReports.ts` | Consolidar os endpoints de mutação e listagem com validação de magic bytes. |
| **7. mediaProxy.ts** | Remover fallbacks silenciosos para a VM2 antiga | Já ajustado para exigir endpoint e bucket válidos | Monitorar logs para garantir ausência de referências à VM2. |
| **8. Frontend** | Criar telas de upload de imagem e gravação de áudio por exame | Requer criação/ajuste de componentes na interface de laudo | Implementar os botões de anexo e gravação de áudio na worklist/viewer. |

---

## 3. Conclusão e Próximos Passos

O plano enviado pelo usuário está **totalmente coerente** com a estratégia de proteger a VM2 contra estouro de disco, direcionando exclusivamente os arquivos binários de exames, anexos, áudios e laudos fechados para a VM3 (MinIO/RAID1). 

A execução seguirá rigorosamente a ordem recomendada no plano, com testes em sandbox e homologação posterior na VM1/VM3.
