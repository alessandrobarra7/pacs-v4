# Guia de Credenciais, Tipos de Usuários e Storage — Portal PACS

Este documento esclarece a taxonomia de credenciais utilizadas na arquitetura de 3 VMs do Portal PACS, diferenciando logins de usuários, credenciais de sistema operacional e chaves técnicas de armazenamento em objeto (MinIO na VM3).

---

## 1. Classificação Geral de Credenciais

| Categoria | O que é | Onde é usado | Impacto se alterado |
|---|---|---|---|
| **Usuários do Portal** | Médicos, recepcionistas, administradores e `unit_admin` | Tela de login da aplicação web (Portal PACS) | Controla o acesso funcional e o RBAC por unidade |
| **Credenciais SSH (Root/User)** | Senhas e chaves de acesso ao sistema operacional Linux | Terminais SSH nas VMs (VM1, VM2, VM3) | Permite manutenção de infraestrutura e deploy |
| **Credenciais de Banco de Dados** | Usuário e senha de conexão ao MySQL/MariaDB | Arquivo `.env` da VM1 conectando à VM2 | Permite leitura e escrita nas tabelas do sistema |
| **Credenciais S3 / MinIO** | `MINIO_ACCESS_KEY` e `MINIO_SECRET_KEY` | Arquivo `.env` da VM1 comunicando-se com a VM3 | Permite gravação e leitura restrita de laudos, anexos e áudios |

---

## 2. Entendendo o Papel do MinIO (VM3)

O MinIO instalado na VM3 opera como um servidor de armazenamento de objetos compatível com S3. Para que o Portal PACS (VM1) grave dados na VM3 sem utilizar a conta administrativa global, é criada uma **conta de aplicação técnica** (ex: `pacs-app-...`).

- **Access Key (`MINIO_ACCESS_KEY`):** Nome identificador da conta técnica com permissões restritas ao bucket `vm3-storage` através de uma política específica (`app-policy`).
- **Secret Key (`MINIO_SECRET_KEY`):** Senha criptográfica gerada aleatoriamente associada à Access Key.

### O que NÃO são as credenciais do MinIO:
- **Não** são usadas para fazer login no Portal PACS.
- **Não** são as senhas de acesso SSH das máquinas virtuais.
- **Não** afetam as contas dos médicos ou administradores da clínica.

---

## 3. Diretrizes de Segurança para Produção

1. **Isolamento de Segredos:** Nunca utilize credenciais padrão ou administrativas globais para aplicações de produção.
2. **Permissões de Arquivo:** O arquivo `.env` contendo a `MINIO_SECRET_KEY` na VM1 deve possuir estritamente a permissão `600` (`rw-------` pertencente a `root:root`).
3. **Rotação de Chaves:** Caso uma chave seja exibida acidentalmente em ambientes públicos ou chats, ela deve ser imediatamente desativada/removida no MinIO da VM3 e substituída por uma nova chave gerada por `openssl rand -hex 24`.
