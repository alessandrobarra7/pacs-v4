# Parecer Técnico — Isolamento de Acesso a Exames DICOM por Unidade (Setores 05-06)

**Data:** 17 de Agosto de 2026  
**Status:** Auditado e Aprovado para Implementação  

---

## 1. Resumo Executivo
O relatório dos Setores 05 e 06 aponta uma lacuna crítica de arquitetura: embora o portal aplique o isolamento por unidade nas etapas de busca (`pacs.query`) e de disparo do C-GET (`pacs.startViewer`), os arquivos DICOM baixados e armazenados em cache local no servidor (`/tmp/dicom-cache/<studyInstanceUid>/`) ficavam acessíveis via rotas HTTP genéricas para qualquer usuário autenticado, bastando conhecer o `studyInstanceUid`.

Este parecer formaliza a validação da proposta descrita nas orientações e autoriza a implementação da checagem de permissão centralizada (`assertDicomFileAccess`) nas rotas de cache, stream, miniaturas, exportação e launch de visualizadores externos.

---

## 2. Mapeamento das 9 Rotas Afetadas em `server/_core/index.ts`
Todas as rotas abaixo serão protegidas pela validação que cruza o `studyInstanceUid` com a tabela `studies_cache` (para descobrir a `unit_id`) e executa a função `canAccessUnit` do módulo de autorização:

1. `GET /api/dicom-cache-status/:studyUid`
2. `GET /api/dicom-files/:studyUid/:filename`
3. `GET /api/dicom-files/:studyUid`
4. `DELETE /api/dicom-files/:studyUid`
5. `GET /api/dicom-series/:studyUid`
6. `GET /api/dicom-thumbnail/:studyUid/:filename`
7. `GET /api/dicom-export/:studyUid`
8. `GET /api/dicom-viewer-launch/:studyUid`
9. `GET /api/dicom-stream/:studyUid` (especialmente corrigindo o cenário de cache HIT, que atualmente confia cegamente no parâmetro de unidade enviado pelo cliente).

---

## 3. Política para Exames Órfãos
Exames presentes em cache cujo `studyInstanceUid` não possua registro correspondente em `studies_cache` ou `study_metadata` terão o acesso **negado por padrão (HTTP 403 / Forbidden)**. Essa diretriz garante que falhas de rastreabilidade de unidade não resultem em vazamento de dados de saúde.
