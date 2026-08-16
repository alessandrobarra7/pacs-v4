# Runbook Operacional de Produção — Atualização da VM1 (PACS Portal)

Este documento estabelece o procedimento oficial e específico para atualizar o portal PACS na **VM1** (aplicação web) a partir do repositório GitHub (`alessandrobarra7/pacs-v4`, branch `integracao/login-mobile`), preservando a integridade do banco de dados na **VM2** (`172.16.3.101`) e assegurando disponibilidade e capacidade de rollback imediato, conforme documentado no `docs/GUIA_DEPLOYMENT_PRODUCAO.txt` e `scripts/setup-vm1.sh`.

---

## 1. Arquitetura de Produção e Referências de Ambiente

| Componente | Endereço / Caminho | Função |
|---|---|---|
| **VM1 (Portal)** | IP interno `172.16.3.100` / IP público `45.189.160.17` / Domínio `lauds.com.br` | Executa o Node.js 22 via PM2 e Nginx (porta 80/443 -> 3000) |
| **VM2 (Banco)** | `172.16.3.101:3306` | MySQL/TiDB (`pacs_portal`, usuário `pacs_user`) |
| **Diretório do App** | `/opt/pacs-portal` (ou `/var/www/pacs-portal`) | Raiz da aplicação em produção na VM1 |
| **Python / DICOM** | `/usr/bin/python3.11` (ou `python3`) com `pydicom` e `pynetdicom` | Suporte ao resgate C-GET e consultas C-FIND |

---

## 2. Procedimento de Atualização Zero-Downtime na VM1

### Passo 2.1 — Acesso SSH e Backup Preventivo
Conecte-se à VM1 via SSH e posicione-se no diretório da aplicação:
```bash
ssh root@<IP_VM1>
cd /opt/pacs-portal
```

Gere um backup compactado do estado atual da aplicação e do arquivo `.env` de produção:
```bash
tar -czvf /root/pacs-portal-prod-backup-$(date +%Y%m%d_%H%M%S).tar.gz --exclude=node_modules .
```

### Passo 2.2 — Sincronização com o GitHub
Garanta que a branch correta (`integracao/login-mobile`) está atualizada com as últimas correções (como a unificação do fluxo Visualizar/download e a ordenação determinística de slices DICOM):
```bash
git fetch github
git checkout integracao/login-mobile
git pull github integracao/login-mobile
```

### Passo 2.3 — Instalação de Dependências e Build de Produção
Instale as dependências usando o gerenciador `pnpm` e compile o frontend e o backend:
```bash
pnpm install --frozen-lockfile
pnpm build
```

### Passo 2.4 — Verificação e Reinicialização via PM2
Verifique se o arquivo `.env` aponta corretamente para a VM2 (`DATABASE_URL=mysql://pacs_user:...@172.16.3.101:3306/pacs_portal`). Em seguida, reinicie o processo no PM2:
```bash
pm2 restart pacs-portal
pm2 save
```

---

## 3. Validação Operacional Pós-Deploy

1. **Inspeção de Logs do PM2**:
   ```bash
   pm2 logs pacs-portal --lines 100
   ```
   *Confirme que o servidor iniciou na porta 3000 sem erros de conexão com o banco da VM2 e sem falhas de TypeScript.*

2. **Testes Funcionais Chave**:
   - **Autenticação**: Realizar login na interface de produção (`https://lauds.com.br`).
   - **Listagem e Pré-download**: Testar a listagem PACS. Clicar em **Visualizar** em um estudo não baixado; confirme que o botão exibe carregamento e o visualizador só abre após o término do resgate completo das imagens.
   - **Ordenação do Visualizador DICOM**: Abrir o estudo de teste (ex: `ANTONIA DE SOUZA BATISTA`) e navegar pela barra de rolagem/slider. Confirme que as instâncias aparecem em sequência crescente exata (sem mistura de fatias ou saltos incorretos).
   - **Laudo e PDF**: Validar o botão de opções de laudo e gerar um PDF de laudo assinado.

---

## 4. Plano de Rollback de Emergência

Caso ocorra qualquer falha imprevista após a reinicialização:

1. **Restaurar o diretório a partir do backup**:
   ```bash
   cd /opt/pacs-portal
   rm -rf *
   tar -xzvf /root/pacs-portal-prod-backup-<TIMESTAMP>.tar.gz
   ```
2. **Reinstalar e reiniciar**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pm2 restart pacs-portal
   ```
3. O sistema será revertido instantaneamente ao estado estável anterior, sem impacto no banco de dados da VM2.
