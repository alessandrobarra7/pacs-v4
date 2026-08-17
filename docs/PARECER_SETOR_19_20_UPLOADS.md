# Parecer Técnico e Plano de Ação — Setores 19+20 (Uploads e Infraestrutura)

**Data:** 17 de Agosto de 2026  
**Autor:** Manus AI  
**Escopo:** Auditoria e mitigação de riscos em armazenamento de arquivos, rotas de upload, MinIO e segurança de diretórios em produção.

---

## 1. Visão Geral dos Achados

O relatório dos Setores 19 e 20 aponta vulnerabilidades e pontos de melhoria importantes na arquitetura de arquivos do PACS Portal:
1. **P1 — Exposição Pública de Assinaturas e Carimbos (`/uploads/signatures/`, `/uploads/stamps/`):** Arquivos usados para autenticar laudos médicos ficam acessíveis publicamente na internet com nomes previsíveis baseados no ID do usuário e `Date.now()`. Isso viabiliza falsificação documental caso as imagens sejam enumeradas.
2. **P1 — Rotas de Upload sem Validação Robusta e Risco de Path Traversal (`routers/storage.ts`):** O endpoint de upload do editor de layout aceita qualquer tipo de arquivo e confia no nome informado pelo cliente, permitindo teórica escrita arbitrária em disco (`path.join` sem validação de limite de diretório).
3. **P2 — Dependência de MinIO em Produção sem Uso Efetivo:** Variáveis de MinIO são obrigatórias no boot da aplicação em produção, mas o código real grava tudo em disco local (`./uploads/`).

---

## 2. Plano de Correções Aprovado

### A. Proteção de Assinaturas e Carimbos (P1)
- **Modificação em `server/routers/medicalData.ts`:**
  - Substituir a montagem do nome do arquivo baseada em timestamp por um identificador opaco e aleatório gerado via `crypto.randomUUID()`.
  - Exemplo: `signatures/sig_${userId}_${crypto.randomUUID()}.${ext}`.
- **Proteção de Acesso:**
  - Mover o servimento das pastas `signatures/` e `stamps/` para trás de rotas autenticadas (`requireAuth`), servindo-as por endpoint protegido com leitura segura em disco e validação de sessão, mantendo apenas `logos/` como público (material institucional).

### B. Hardening de Uploads e Defesa em Profundidade contra Path Traversal (P1)
- **Modificação em `server/routers/storage.ts` (`uploadFile`):**
  - Aplicar validação rigorosa com `isValidImageBuffer` (magic bytes) e `inferExtension` (idêntico ao padrão já existente em `medicalData.ts`).
  - Restringir a pasta de destino (`folder`) a uma lista estrita de valores permitidos (ex: apenas `'layouts'`).
- **Camada de Defesa em `server/storage.ts` (`storagePut`):**
  - Adicionar validação de caminho para garantir que qualquer escrita permaneça estritamente contida dentro de `UPLOADS_DIR`:
    ```ts
    const filePath = path.join(UPLOADS_DIR, key);
    if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      throw new Error('Caminho de upload inválido.');
    }
    ```

### C. Alinhamento do MinIO (P2)
- Tornar o uso do MinIO opcional quando `USE_MINIO` não estiver explicitamente ativo, evitando travar boots de produção em ambientes que utilizam armazenamento local em disco com backup externo sincronizado.
