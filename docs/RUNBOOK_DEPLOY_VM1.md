# Runbook Operacional — Atualização da VM1 (PACS Portal)

Este documento descreve o procedimento passo a passo para atualizar o portal PACS na **VM1** a partir do repositório GitHub (`alessandrobarra7/pacs-v4`, branch `integracao/login-mobile`), garantindo zero interrupção desnecessária no banco de dados da **VM2** e permitindo reversão imediata em caso de falha.

---

## 1. Pré-requisitos e Verificações Iniciais

1. **Acesso SSH à VM1**: Garantir acesso root ou sudo à máquina virtual que executa o portal.
2. **Conexão com o Banco (VM2)**: Confirmar que a VM2 (`172.16.3.101` ou IP configurado) está acessível e respondendo.
3. **Versão do Python**: Confirmar que o interpretador `python3` e as bibliotecas `pydicom` e `pynetdicom` estão instalados no ambiente de execução do C-GET.

---

## 2. Passo a Passo de Atualização (Zero Downtime / Troca Rápida)

### Passo 2.1 — Acessar a VM1 e entrar no diretório do projeto
```bash
ssh root@<IP_DA_VM1>
cd /var/www/pacs-portal
```

### Passo 2.2 — Criar backup rápido da versão atual (para rollback seguro)
```bash
tar -czvf /root/pacs-portal-backup-$(date +%Y%m%d_%H%M%S).tar.gz .
```

### Passo 2.3 — Atualizar o código do repositório GitHub
```bash
git fetch github
git checkout integracao/login-mobile
git pull github integracao/login-mobile
```

### Passo 2.4 — Instalar dependências e recompilar o projeto
```bash
pnpm install
pnpm build
```

### Passo 2.5 — Reiniciar a aplicação via PM2
```bash
pm2 restart all
# ou se o processo for nomeado:
pm2 restart pacs-portal
```

---

## 3. Validação Pós-Deploy na VM1

1. **Verificar status do PM2**:
   ```bash
   pm2 status
   pm2 logs pacs-portal --lines 50
   ```
2. **Testar acesso HTTP local**:
   ```bash
   curl -I http://127.0.0.1:3000
   ```
3. **Validar no navegador**:
   - Acessar o domínio de produção (`https://lauds.com.br` ou IP público).
   - Efetuar login com uma conta de médico ou administrador.
   - Abrir a listagem PACS, testar o botão unificado **Visualizar** (confiando no pré-download automático e bloqueio até o cache completo).
   - Abrir o visualizador DICOM e confirmar que o slider de fatias exibe a sequência correta (sem mistura de instâncias).
   - Testar a impressão e o download de laudo em PDF.

---

## 4. Plano de Rollback Rápido (Plano B)

Caso ocorra qualquer erro crítico após o reinício do PM2:

1. **Restaurar o backup compactado**:
   ```bash
   cd /var/www/pacs-portal
   tar -xzvf /root/pacs-portal-backup-<TIMESTAMP>.tar.gz
   ```
2. **Recompilar e reiniciar**:
   ```bash
   pnpm install
   pnpm build
   pm2 restart pacs-portal
   ```
3. O sistema retornará imediatamente ao estado anterior estável, sem perda de dados na VM2.
