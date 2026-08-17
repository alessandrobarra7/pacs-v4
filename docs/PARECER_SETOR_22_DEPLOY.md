# Parecer Técnico — Setor 22: Documentação e Infraestrutura de Deploy

**Data:** 16 de agosto de 2026  
**Autor:** Manus AI  
**Objeto:** Avaliação e validação de coerência das diretrizes apresentadas no documento `SETOR_22_documentacao_deploy_ORIENTACOES.md` frente ao projeto `pacs-portal`.

---

## 1. Visão Geral

O documento **Setor 22 — Documentação e Infraestrutura de Deploy** foi revisado em sua totalidade. As constatações levantadas pelo documento estão **100% corretas, altamente coerentes e refletem com exatidão os pontos críticos de infraestrutura, scripts de instalação, divergências de documentação (README vs DEPLOY.md) e riscos de segurança associados ao versionamento de artefatos operacionais**.

Nenhuma modificação estrutural foi aplicada automaticamente no código de produção; este parecer tem como objetivo consolidar a concordância técnica e estabelecer o plano de ação priorizado, conforme instrução metodológica do projeto.

---

## 2. Síntese dos Achados e Validação

| Prioridade | Frente Avaliada | Diagnóstico do Setor 22 | Conclusão da Análise |
| :--- | :--- | :--- | :--- |
| **P0** | **Credenciais de Produção** | Presença de senhas em texto puro em `DEPLOY.md`, `INFRASTRUCTURE.md`, `ENV_REFERENCE.md` e scripts de setup. | **Confirmado.** Risco de exposição em repositórios públicos/pacotes. Requer rotacionamento imediato de senhas de banco na VM2 e sanitização dos docs. |
| **P0** | **Abrangência do `.gitignore`** | O `.gitignore` protege arquivos `.env`, mas ignora documentação e scripts em `.md`/`.sh` que carregam segredos. | **Confirmado.** A convenção deve ser estendida para impedir qualquer valor real em arquivos de documentação versionados. |
| **P1** | **Schema no `DEPLOY.md`** | A listagem SQL no guia de deploy contém apenas 3 tabelas, enquanto o Drizzle gerencia mais de 39 tabelas. | **Confirmado.** O provisionamento por SQL manual falharia; o correto é adotar migrações versionadas ou `drizzle-kit`/`db:push`. |
| **P1** | **Conflito entre `setup.sh` e `scripts/setup-vm1.sh`** | Dois scripts concorrentes com topologias (standalone vs VM1+VM2) e senhas divergentes. | **Confirmado.** Risco de provisionamento incorreto. O script legado deve ser isolado ou removido. |
| **P1** | **Variáveis MinIO ausentes no setup** | `scripts/setup-vm1.sh` gera um `.env` sem variáveis MinIO, causando falha fatal no boot de produção (`server/minio.ts`). | **Confirmado.** A inicialização Node abortaria imediatamente por falta de variáveis obrigatórias. |
| **P2** | **Divergências no `README.md`** | Caminho de deploy (`/var/www` vs `/opt`), ausência de SSL na config do Nginx, papéis de RBAC desatualizados. | **Confirmado.** O README difere do `DEPLOY.md`, gerando confusão operacional. |
| **P3** | **Backup e Monitoramento** | Falta de política de rotação de backups no banco, retenção e testes automáticos pós-deploy (smoke tests). | **Confirmado.** Requer automação de backup via cron e healthchecks de pós-deploy. |

---

## 3. Próximos Passos Recomendados

Seguindo rigorosamente as diretrizes do projeto e os protocolos de segurança:
1. **Sanitizar a documentação:** Substituir todas as senhas em texto puro nos arquivos Markdown por placeholders padronizados (`<DB_PASSWORD>`).
2. **Rotacionar credenciais de produção:** Atualizar as senhas do MySQL/MariaDB na VM2 e refletir o novo `DATABASE_URL` no `.env` privado da VM1.
3. **Padronizar o setup:** Atualizar `scripts/setup-vm1.sh` para incluir as variáveis obrigatórias do MinIO e unificar o caminho de deploy em `/opt/pacs-portal`.
4. **Alinhar o README:** Sintonizar o `README.md` com as diretrizes vigentes no `DEPLOY.md` e `INFRASTRUCTURE.md`.

Fico no aguardo da sua autorização expressa para iniciar a aplicação destas correções no repositório.
