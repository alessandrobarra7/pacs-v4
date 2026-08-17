# Arquitetura Operacional do Portal PACS — VM1, VM2 e VM3

Este documento detalha formalmente a divisão de responsabilidades, funções, fluxos de dados, limites operacionais e políticas de segurança e backup para o ambiente de produção do Portal PACS.

## 1. Visão Geral da Arquitetura

O sistema é estruturado em três máquinas virtuais independentes e isoladas por rede, garantindo que o crescimento do volume de arquivos, laudos e anexos não esgote o espaço de armazenamento do banco de dados relacional e não sobrecarregue o servidor de aplicação web.

| Camada | Hostname / IP | Função Principal | Tecnologia Principal |
|---|---|---|---|
| **VM1 — Portal** | `172.16.3.100` | Servidor web, renderização de UI, rotas tRPC, proxy DICOMweb, execução de scripts Python DICOM (C-FIND/C-MOVE) e intermediação de storage. | Node.js (Express, Vite, React, tRPC), PM2, Python 3.11 (pynetdicom, pydicom). |
| **VM2 — Banco de Dados** | `172.16.3.101` | Armazenamento relacional transacional de usuários, unidades, permissões, metadados de laudos, logs de auditoria e controle financeiro. | MySQL / MariaDB (InnoDB). |
| **VM3 — Armazenamento** | `172.16.3.102` | Repositório de objetos de longo prazo (logos, assinaturas, carimbos, anexos, áudios e PDFs de laudos) com redundância local de disco. | MinIO Server sobre mdadm RAID1 (dois discos de 4 TB) e sistema de arquivos EXT4 em `/data/storage`. |

---

## 2. Detalhamento por Máquina Virtual

### 2.1. VM1 — Portal de Aplicação

*   **O que faz:**
    *   Executa o processo Node.js principal gerenciado pelo PM2, atendendo às requisições HTTPS/HTTP dos usuários e médicos.
    *   Gerencia a autenticação local (JWT com bcrypt), controle de acesso baseado em papéis (RBAC) e isolamento por unidade (`unit_id`).
    *   Faz o proxy das consultas DICOM (C-FIND) e requisições DICOMweb para os Orthancs e PACS das unidades.
    *   Executa temporariamente o pré-download de fatias DICOM para visualização no Cornerstone ou exportação em pacote ZIP para Horos e RadiAnt.
    *   Atua como cliente S3, enviando novos arquivos diretamente para o MinIO da VM3 e obtendo URLs temporárias pré-assinadas para leitura segura.
*   **O que NÃO guarda:**
    *   Não armazena arquivos binários de forma permanente no disco local (`/var/www/pacs-portal/uploads/` serve apenas como buffer temporário ou legado em transição).
    *   Não armazena tabelas transacionais nem credenciais de banco de dados fora do arquivo seguro `.env`.
*   **Limites de capacidade:**
    *   O disco da VM1 (típico de 40 a 80 GB) permanece leve porque os dados dinâmicos e binários não residem nela.

---

### 2.2. VM2 — Banco de Dados Relacional

*   **O que faz:**
    *   Guarda exclusivamente o estado transacional, metadados estruturados e chaves de referência para os arquivos armazenados na VM3.
    *   Mantém tabelas de usuários (`users`), unidades (`units`), permissões (`user_unit_permissions`), templates (`templates`), rascunhos e textos editáveis de laudos (`reports`, `report_versions`), histórico de auditoria (`audit_log`) e eventos financeiros (`billing_*`).
*   **O que NÃO guarda:**
    *   **Não armazena arquivos binários pesados**, como imagens de logotipos, assinaturas digitais, carimbos médicos, fotos de anexos de pacientes, arquivos de áudio falado ou o corpo completo dos PDFs gerados dos laudos. O banco guarda apenas o texto estruturado/editável (`body` em HTML sanitizado) e a chave/referência S3 (`file_key` / `file_url`).
*   **Limites de capacidade:**
    *   Como os binários e os laudos pesados são descarregados na VM3, o banco de dados na VM2 consome espaço de forma linear e compacta (centenas de megabytes a poucos gigabytes ao longo de anos), impedindo estourar o disco.

---

### 2.3. VM3 — Armazenamento de Objetos (MinIO em RAID1)

*   **O que faz:**
    *   Fornece API de objetos compatível com S3 (`http://172.16.3.102:9000`), restrita exclusivamente à VM1 via UFW.
    *   Protege os dados contra falhas físicas de hardware utilizando dois discos de 4 TB em espelhamento RAID1 (`mdadm` em `/dev/md0`), montados em `/data/storage`.
*   **O que guarda (Armazenamento Permanente):**
    *   Logotipos das unidades médicas (`units.logo_url`).
    *   Assinaturas digitais e carimbos dos médicos (`users.signature_url`, `users.stamp_url`).
    *   Fotos, documentos e arquivos anexados aos estudos dos pacientes (`study_attachments`).
    *   Áudios falados vinculados aos laudos e exames (`study_audio_reports`).
    *   Versões exportadas e PDFs definitivos de laudos assinados / retificados.
*   **O que NÃO faz:**
    *   Não executa lógica de negócio, autenticação de usuários ou consultas SQL.
*   **Limites de capacidade:**
    *   Capacidade bruta de 4 TB em redundância RAID1, perfeitamente dimensionada para receber milhões de exames, anexos e laudos ao longo da operação corporativa.

---

## 3. Matriz de Armazenamento e Ciclo de Vida dos Dados

| Tipo de Dado | Onde é Editado / Gerado | Onde é Armazenado Permanentemente | Onde fica a Referência |
|---|---|---|---|
| **Textos de Laudos (Rascunho / Assinado)** | Editor Clínico (VM1) | **VM2** (tabela `reports`, campo `body`) | Chave primária do estudo/laudo |
| **PDFs e Versões de Laudos** | Gerador de PDF (VM1) | **VM3** (Bucket `vm3-storage`) | Referência S3 em `reports` / `report_versions` |
| **Logos, Assinaturas e Carimbos** | Upload Admin / Perfil (VM1) | **VM3** (Bucket `vm3-storage`) | `units.logo_url`, `users.signature_url`, `users.stamp_url` |
| **Anexos e Fotos de Exames** | Câmera / Upload (VM1) | **VM3** (Bucket `vm3-storage`) | `study_attachments.file_url` |
| **Áudios de Laudo** | Gravador do Viewer (VM1) | **VM3** (Bucket `vm3-storage`) | `study_audio_reports.file_url` |
| **Imagens DICOM (Fatias)** | PACS / Orthanc Externo | **Orthancs das Unidades** | Endereço DICOMweb / C-MOVE |

---

## 4. Segurança, Rede e Conectividade

1.  **Isolamento de Portas:**
    *   A API do MinIO na VM3 (porta `9000`) aceita tráfego **apenas** do IP da VM1 (`172.16.3.100`), bloqueando qualquer outra origem.
    *   A console administrativa do MinIO (porta `9001`) permanece bloqueada por padrão no UFW.
2.  **Credenciais Restritas:**
    *   A aplicação na VM1 conecta-se ao MinIO utilizando uma conta de aplicação dedicada (`pacs-app-*`), com permissão restrita à policy do bucket `vm3-storage`. A senha administrativa do MinIO (`pacs`) nunca é inserida no código ou no `.env` do Portal.
3.  **Segurança de Leitura:**
    *   O frontend nunca acessa arquivos brutos diretamente por URLs públicas permanentes. O backend gera URLs pré-assinadas temporárias (`storageGetUrl`) ou interage através da rota autenticada `/api/media/*`, que valida o RBAC e o isolamento por unidade antes de liberar o fluxo.

---

## 5. Estratégia de Backup, Redundância e Rollback

*   **Redundância Local (RAID1 na VM3):** Protege contra falha física repentina de um dos discos de 4 TB sem perda de dados ou parada do serviço.
*   **Backup do Banco de Dados (VM2):** Dump diário compactado (`mysqldump` com `--single-transaction`) armazenado em diretório isolado na própria VM2 ou enviado para armazenamento externo. Como o banco guarda apenas metadados e textos leves, o arquivo de backup é extremamente pequeno e rápido de restaurar.
*   **Backup da VM3 (Storage):** O RAID1 não substitui backup externo contra exclusão acidental ou corrupção lógica. Recomenda-se espelhamento periódico do bucket `vm3-storage` para um destino de backup corporativo (ex: storage secundário ou nuvem de arquivamento).
*   **Rollback de Aplicação:** O versionamento via Git na VM1, combinado com imagens PM2 e checkpoints do projeto, garante que qualquer atualização de código possa ser revertida instantaneamente sem comprometer os dados na VM2 ou os arquivos na VM3.
