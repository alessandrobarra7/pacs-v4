# Set List Priorizado para Integração Seletiva

**Data:** 15 de Agosto de 2026  
**Objetivo:** Estabelecer uma lista de tarefas item por item para adotar as melhorias operacionais e visuais do código modificado (ZIP) preservando rigorosamente a arquitetura original de produção (VM1 portal web + VM2 MySQL corporativo).

---

## Metodologia de Trabalho
1. **Item por item**: Implementaremos e testaremos uma funcionalidade por vez.
2. **Preservação da base**: Mantemos a branch `main` como tronco estável e a conexão `VM1 → VM2 (MySQL)`.
3. **Validação no Sandbox**: Cada item será testado no ambiente de desenvolvimento antes de qualquer recomendação de deploy.

---

## Set List de Funcionalidades (Priorizado)

### Item 1: Anexos de Requisição por Fotos (`study_requisition_photos`)
* **O que é**: Permite anexar até 5 fotos de requisição (câmera do celular ou upload) vinculadas ao estudo DICOM e unidade.
* **Componentes afetados**: `PacsQueryPage.tsx`, `DicomViewerPage.tsx`, novo router `requisitionPhotos.ts`, migration `0047`.
* **Impacto no Banco (VM2)**: Criação da tabela `study_requisition_photos`.
* **Estratégia**: Integrar o router tRPC e os modais de requisição mantendo a autenticação e storage S3/MinIO padrão.

### Item 2: Módulo de Laudo Falado / Áudio (`study_report_audios`)
* **O que é**: Gravação de áudio/ditado via `MediaRecorder` diretamente no visualizador DICOM (até 10 áudios por estudo, limite de 15MB).
* **Componentes afetados**: `DicomViewerPage.tsx`, novo router `reportAudios.ts`, migration `0048`.
* **Impacto no Banco (VM2)**: Criação da tabela `study_report_audios`.
* **Estratégia**: Incorporar os controles de áudio no rodapé do viewer e o backend de upload/validação de buffer.

### Item 3: Adaptação Mobile da Tela de Login (`Login.tsx`)
* **O que é**: Layout vertical fixo (`100dvh`), sem rolagem, cards de status compactos e design limpo.
* **Componentes afetados**: `Login.tsx`.
* **Impacto no Banco**: Nenhum.
* **Estratégia**: Aplicar o layout refinado do login mantendo a autenticação tRPC e o contexto de sessão existentes.

### Item 4: Listagem PACS Otimizada para Mobile (`PacsQueryPage.tsx`)
* **O que é**: Cards compactos por exame, modal de ações unificado (visualizar, imprimir, laudar, requisição) e indicador visual de clipe para fotos de requisição.
* **Componentes afetados**: `PacsQueryPage.tsx`, `AppHeader.tsx`.
* **Impacto no Banco**: Nenhum.
* **Estratégia**: Trazer a listagem em cards para o mobile preservando as buscas DICOM C-FIND originais.

### Item 5: Visualizador DICOM e Editor de Laudos Mobile
* **O que é**: Rodapé flutuante no viewer DICOM com troca de séries e acesso rápido a ferramentas; editor de laudos em formato documento editável (`contentEditable`).
* **Componentes afetados**: `DicomViewerPage.tsx`, `ReportEditorPage.tsx`.
* **Impacto no Banco**: Nenhum.
* **Estratégia**: Ajustar a responsividade e os blocos posicionáveis mantendo a lógica de salvamento e assinatura de laudos.

---
*Documento registrado para acompanhamento da execução item por item.*
