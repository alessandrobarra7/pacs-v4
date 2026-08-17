# Mapa de Auditoria Funcional e Operacional — VM1, VM2 e VM3

> **Data da auditoria:** 17 de agosto de 2026  
> **Escopo:** Registro consolidado de modificações, estado de infraestrutura, schema de banco de dados, matriz de funcionalidades, políticas de segurança e comandos de verificação para fins de auditoria externa e reprodução de ambiente.

---

## 1. Visão Geral da Arquitetura de 3 VMs

O Portal PACS adota uma arquitetura distribuída em três máquinas virtuais distintas para garantir isolamento de responsabilidades, segurança de dados e escalabilidade:

```
+-------------------------------------------------------+
|                       VM1 (Portal)                    |
|  - Aplicação Express / React 19 / tRPC / Node.js      |
|  - PM2 Process Manager                                |
|  - Storage Local: Logos, Assinaturas, Carimbos        |
+---------------------------+---------------------------+
                            |
             +--------------+--------------+
             |                             |
             v                             v
+------------------------+   +------------------------+
|       VM2 (Banco)      |   |      VM3 (Storage)     |
|  - MySQL 8.0           |   |  - MinIO em RAID1      |
|  - Tabela reports      |   |  - Bucket vm3-storage  |
|    (com DDL export)    |   |  - Laudos HTML/PDF     |
|  - Metadados e RBAC    |   |  - Anexos e Áudios     |
+------------------------+   +------------------------+
```

---

## 2. Inventário de Modificações na VM1 (Portal)

A VM1 hospeda o código-fonte da aplicação e o servidor Node.js gerenciado pelo PM2.

### 2.1 Principais Alterações Implementadas
*   **Isolamento de Storage por Tipo de Objeto (`server/storage.ts`):**
    *   **Permanecem estritamente locais na VM1:** Logotipos de unidades (`logos/`), assinaturas de médicos (`signatures/`), carimbos (`stamps/`), avatares e perfis (`avatars/`, `profiles/`). Isso evita falhas de carregamento e garante estabilidade aos cadastros administrativos.
    *   **Direcionados para a VM3 (MinIO):** Laudos exportados/assinados (`laudos/{unit_id}/...`), anexos de exames (`study_attachments`) e áudios vinculados (`study_audio_reports`).
*   **Exportação Persistente de Laudos (`server/routers/reports.ts`):**
    *   No momento da assinatura (`reports.sign`), o sistema gera uma cópia em HTML autocontida do laudo e faz o upload automático para o MinIO da VM3, gravando a chave e a URL nos campos correspondentes.
*   **Gestão de Processos e Segurança (`.env` e PM2):**
    *   Variáveis de ambiente do MinIO carregadas de forma tardia (*lazy loading*) para compatibilidade com `dotenv` e PM2.
    *   Permissões de arquivos sensíveis restritas (`chmod 600` no `.env` e backups).

### 2.2 Comandos de Auditoria e Diagnóstico na VM1
```bash
# Verificar status do serviço PM2
pm2 status pacs-portal

# Verificar integridade do repositório Git e commit ativo
cd /var/www/pacs-portal && git log -1 --oneline

# Verificar permissões do arquivo .env (deve retornar -rw-------)
stat -c '%A %U:%G %s bytes %n' /var/www/pacs-portal/.env
```

---

## 3. Inventário de Modificações na VM2 (Banco de Dados)

A VM2 hospeda o servidor MySQL 8.0 e o banco relacional `pacs_portal`.

### 3.1 Estado do Schema e DDL Realizada
*   **Total de tabelas inventariadas:** 44 tabelas (incluindo `reports`, `study_attachments`, `study_audio_reports`, `units`, `users`, `audit_log`, etc.).
*   **Modificação Crítica Aplicada em 17/08/2026:**
    *   Adicionadas as colunas `export_file_key` (`varchar(500) NULL`) e `export_file_url` (`text NULL`) na tabela `reports` para suportar o vínculo com os arquivos exportados na VM3.
    *   Criação de snapshot preventivo (`reports_backup_20260817`) antes da DDL.
*   **Política de Dados:**
    *   O banco armazena exclusivamente texto estruturado, metadados, status, chaves de objetos (`file_key`) e referências. Nenhum arquivo binário (PDF, imagem ou áudio em volume) é gravado no MySQL.

### 3.2 Comandos de Auditoria e Diagnóstico na VM2
```bash
# Verificar status do MySQL
systemctl status mysql

# Conferir estrutura atualizada da tabela reports
mysql pacs_portal -e "SHOW COLUMNS FROM reports;"

# Listar tamanho das maiores tabelas
mysql pacs_portal -e "
SELECT table_name AS Tabela, table_rows AS Linhas_Est, 
       ROUND((data_length + index_length) / 1024 / 1024, 2) AS Tamanho_MB
FROM information_schema.tables WHERE table_schema = 'pacs_portal' 
ORDER BY (data_length + index_length) DESC LIMIT 10;
"
```

---

## 4. Matriz de Direcionamento de Armazenamento

| Categoria de Conteúdo | Onde é Armazenado | Justificativa Operacional |
|---|---|---|
| **Logos, Assinaturas, Carimbos** | VM1 (Storage Local) | Mantém independência das telas administrativas e evita indisponibilidade por falha de rede na VM3. |
| **Laudos Assinados (Exports HTML)** | VM3 (MinIO / `vm3-storage`) | Descarrega a VM2, permitindo retenção de longo prazo sem inchar o banco relacional. |
| **Anexos e Fotos de Exames** | VM3 (MinIO / `vm3-storage`) | Arquivos binários pesados e múltiplos por estudo armazenados em objeto storage com RAID1. |
| **Áudios de Laudos (Gravações)** | VM3 (MinIO / `vm3-storage`) | Áudios gravados por médicos armazenados com referência segura e URLs pré-assinadas. |
| **Texto Editável e Metadados** | VM2 (MySQL) | Permite edição, versionamento, retificação rápida e auditoria rigorosa de acesso. |

---

## 5. Próximos Passos e Recomendações de Auditoria
1.  **Validação Final em Produção:** Realizar a assinatura de um laudo de teste na VM1 e verificar a criação do arquivo HTML correspondente no bucket da VM3.
2.  **Rotação de Segredos:** Garantir que a Secret Key da conta técnica do MinIO utilize um valor seguro e exclusivo em produção.
3.  **Backups Externos:** Complementar a redundância local da VM3 (RAID1) e os dumps da VM2 com uma rotina de cópia externa offsite.

---
*Documento gerado automaticamente para fins de auditoria técnica do Portal PACS.*
