# Formulário de Coleta Técnica — PACS Mobile (Preenchido)

**Sistema avaliado:** PACS Portal / LAUDS
**Finalidade:** fornecer a informação técnica necessária para projetar o PACS Mobile sem expor segredos, dados clínicos reais, IPs privados, credenciais de infraestrutura ou tokens de usuários.
**Status:** preenchido a partir do repositório e das confirmações operacionais registradas até 29/08/2026.

> As marcações **Confirmado no código**, **Confirmado na operação**, **Pendente de confirmação** e **Decisão de produto** têm significados distintos. Um campo pendente não deve ser presumido pelo aplicativo; ele precisa ser confirmado antes da implementação correspondente.

## 1. Identificação da versão em produção

| Campo | Preenchimento seguro | Status |
|---|---|---|
| Repositório oficial | `https://github.com/alessandrobarra7/pacs-v4.git` | Confirmado no código e Git |
| Branch remota de referência | `main` | Confirmado no Git |
| Branch local da VM1 | `integracao/login-mobile` | Confirmado na operação; recebe atualizações por fast-forward de commits de `main` |
| Último commit de aplicação confirmado na VM1 | `8b40b247613775544297e879389da9904905c176` | Confirmado na operação; atualizou o fechamento histórico financeiro |
| Atualizações documentais posteriores | `dd99c9cef2ee77408090c685ed0000cae82cecd9` | Confirmado no Git; documentação, sem necessidade de deploy da aplicação |
| Data/hora exata da última atualização da VM1 | Executar o comando abaixo no servidor | Pendente de confirmação atual |
| Caminho da aplicação em produção | `/var/www/pacs-portal` | Confirmado na operação |
| Runtime | Node.js com `pnpm`, Express, tRPC, React/Vite, PM2 e Nginx | Confirmado no código e na operação |
| Versão do Node.js | Executar `node --version` na VM1 | Pendente de confirmação atual |
| Versão do pnpm | `pnpm@10.30.1` no projeto; confirmar binário da VM1 | Confirmado no projeto / pendente na VM1 |
| Processo PM2 | `pacs-portal` | Confirmado na operação |

Use na VM1 somente a consulta abaixo para atualizar os campos temporais e de versão, sem revelar nenhum segredo:

```bash
cd /var/www/pacs-portal
git branch --show-current
git rev-parse HEAD
git log -1 --format='%h | %ad | %s' --date=iso
node --version
pnpm --version
pm2 status pacs-portal
```

## 2. Endereço público, proxy e configuração não sensível

| Campo | Preenchimento seguro | Status |
|---|---|---|
| URL pública final | `https://lauds.com.br` | Confirmado no código e na operação conhecida |
| Caminho tRPC | `/api/trpc` | Confirmado no código |
| Porta interna do Node | `3000` | Confirmado na operação e no health-check |
| HTTPS no domínio | Em uso pela URL pública; validar cadeia do certificado em Android e iOS reais | Parcialmente confirmado |
| HTTP → HTTPS | Verificar configuração Nginx atual | Pendente |
| Uso fora da rede local | Necessário para o produto móvel, sujeito à política operacional | Decisão operacional |
| WAF, VPN ou proxy corporativo | Não registrado no repositório | Pendente |
| CORS atual | Permite `https://lauds.com.br`, `http://localhost:3000` e `http://localhost:5173`; aceita `Authorization` e credenciais | Confirmado no código |

O CORS permitir `Authorization` **não significa** que a autenticação Bearer esteja pronta. Atualmente, a identidade do usuário é obtida do cookie da sessão web.[1] [2]

## 3. Autenticação, sessão e opção “Salvar minha senha”

| Pergunta | Resposta | Status |
|---|---|---|
| Login aceita username/e-mail? | Aceita ambos; a busca é por username ou e-mail | Confirmado no código |
| Conta inativa é bloqueada? | Sim; o login rejeita usuário inativo e o contexto revoga o acesso no próximo uso protegido | Confirmado no código |
| Conta expirada é bloqueada? | Sim; o login compara a data de expiração no fuso configurado e o contexto também a revalida | Confirmado no código |
| Uma conta pode ter mais de uma unidade? | Sim; há permissões por `user_unit_permissions`, com fallback legado limitado em `users.unit_id` | Confirmado no código |
| Troca de senha existe? | Sim: `auth.changePassword`, exigindo senha atual e nova senha de ao menos seis caracteres | Confirmado no código |
| Recuperação de senha sem sessão | Não identificada no router atual | Pendente de produto/implementação |
| Troca de senha invalida sessões existentes? | Não há mecanismo de versão/revogação de token na troca de senha; sessões existentes permanecem válidas até expirar ou até o usuário ser desativado | Confirmado no código |
| Desativar usuário invalida sessões? | Sim, de modo efetivo no próximo acesso protegido, pois o usuário é relido e `isActive=false` remove a identidade do contexto | Confirmado no código |
| Máximo de dispositivos por usuário | Não identificado | Ausente |
| Token Bearer para aplicativo | Não existe atualmente | Ausente; requer extensão de backend |
| Sessão web atual | JWT HS256 em cookie HTTP, duração configurável por `SESSION_DURATION_HOURS` (padrão 24h) | Confirmado no código |

O PACS Mobile deve implementar “Salvar minha senha” como **salvar sessão/token em armazenamento seguro do sistema operacional**, e não guardar a senha em texto, cookie copiado do navegador ou preferência comum. A implantação móvel deverá introduzir token de acesso de curta duração, renovação ou reautenticação, identificação/revogação por dispositivo e auditoria própria; isso não está disponível ainda.[2] [3]

### 3.1 Contrato de autenticação atual, em formato anonimizado

Estes exemplos representam o **contrato lógico dos procedures**, não cookies, tokens ou uma captura de produção. O transporte tRPC pode envolver envelope próprio do cliente tRPC.

```json
{
  "procedure": "auth.login",
  "input": {
    "login": "usuario_teste",
    "password": "SENHA_NAO_ENVIADA"
  },
  "success_result": {
    "success": true,
    "user": {
      "id": 123,
      "username": "usuario_teste",
      "name": "Usuário de Teste",
      "role": "medico",
      "unitId": 20,
      "email": "usuario@exemplo.com"
    }
  }
}
```

| Cenário | Código tRPC atual | Mensagem de contrato a tratar |
|---|---|---|
| Credencial inválida | `UNAUTHORIZED` | Mensagem de login correspondente; não distinguir em tela pública usuário inexistente de senha inválida sem decisão de segurança |
| Usuário inativo | `UNAUTHORIZED` | Conta inativa |
| Conta expirada | `UNAUTHORIZED` | Conta expirada |
| Senha não configurada | `UNAUTHORIZED` | Senha não configurada |
| `auth.me` sem sessão | Retorna `null` | Aplicativo deve ir ao login |
| `auth.me` com sessão web válida | Retorna o usuário do contexto | Futuro token mobile deverá ter comportamento equivalente |

## 4. Usuários, papéis, unidades e permissões

Os papéis existentes são `admin_master`, `unit_admin`, `medico`, `viewer`, `operador`, `atendente` e `responsavel_financeiro`. A autorização efetiva no backend depende da permissão da unidade, não apenas do papel de interface. As permissões centrais de unidade são `view_studies`, `edit_reports`, `view_anamnesis`, `edit_anamnesis`, `edit_exam_legend`, `print_reports` e `manage_templates`.[4] [5]

| Papel | Entrará no app? | Consultar estudos/imagens | Ver laudos | Criar/editar laudos | Prioridade | Anamnese | Áudio | Situação correta para v1 |
|---|---|---|---|---|---|---|---|---|
| `admin_master` | Decisão pendente | Permitido, todas as unidades | Permitido | Permitido | Validar pelo router específico | Permitido | Validar escopo | Recomendável limitar a funções clínicas no piloto |
| `unit_admin` | Decisão pendente | Permitido na unidade autorizada | Laudos assinados | Não pela matriz de UI | Não identificado como editor | Condicional por permissão | Validar escopo | Consulta, se necessário |
| `medico` | Decisão pendente | Permitido em unidades autorizadas | Permitido | Permitido; assinatura autorizada | Não é o editor padrão da sinalização | Permitido por permissão | Permitido para rotas clínicas aplicáveis | Candidato principal para piloto |
| `viewer` | Decisão pendente | Permitido em unidades autorizadas | Laudos assinados | Não | Não | Não | Somente se aprovado pelo escopo | Consulta somente |
| `operador` | Decisão pendente | Permitido em unidades autorizadas | Laudos impressos/assinados conforme permissão | Não | Editor permitido pelo router de prioridade | Condicional por permissão granular | Validar escopo | Consulta e prioridade, se necessária |
| `atendente` | Decisão pendente | Permitido em unidades autorizadas | Não pela matriz de UI | Não | Editor permitido pelo router de prioridade | Não | Não definido | Consulta e prioridade, se necessária |
| `responsavel_financeiro` | Decisão pendente | Não | Não | Não | Não | Não | Não | Fora do escopo clínico do mobile v1 |

> A coluna “Entrará no app?” é uma **decisão de produto**. A tabela registra capacidade técnica atual, mas não autoriza automaticamente a exibição no cliente móvel.

## 5. Estudos, pesquisa, filtros e detalhe

| Procedure | Entrada confirmada | Saída/efeito relevante | Autorização atual |
|---|---|---|---|
| `studies.list` | `patient_name`, `modality`, `study_date`, `accession_number`, `page`, `pageSize`, `unit_id` opcional | `items`, `total`, `page`, `pageSize`; padrão de 20 itens por página | `view_studies` e unidade permitida |
| `studies.getById` | `id` | Estudo em cache; registra `VIEW_STUDY` | Unidade real do estudo e `view_studies` |
| `studies.openViewer` | `studyId` | URL de viewer, `studyInstanceUid`, unidade; registra `OPEN_VIEWER` | Unidade real do estudo e `view_studies` |
| `pacs.query` | paciente, ID, modalidade, data, accession, descrição e `unit_id` opcional | Consulta C-FIND no PACS autorizado e atualiza cache | Unidade associada/configurada e permissões efetivas |

Não há, hoje, limite máximo explícito de `pageSize` no schema de `studies.list`, nem uma especificação móvel de intervalo de datas, máximo de resultados ou timeout de pesquisa. Antes de liberar o mobile, esses limites devem ser definidos e impostos no backend.

| Limite solicitado | Estado | Proposta inicial para homologação, sujeita à aprovação |
|---|---|---|
| Tamanho máximo de página | Pendente | 20 padrão, máximo 50 |
| Intervalo máximo de datas | Pendente | 31 dias sem refinamento adicional |
| Timeout de consulta PACS | Configurável no ambiente; padrão técnico de C-GET é 600000 ms, não assumir que serve para C-FIND | Definir SLA próprio de C-FIND |
| Máximo de resultados sem refinamento | Pendente | 200, com exigência de filtro adicional |
| Campos de pesquisa | Disponíveis: paciente, ID, modalidade, data, accession e descrição | Confirmar subconjunto do v1 |

## 6. Imagens, DICOM, mídia e visualizador

| Item | Estado atual | Condição para o mobile |
|---|---|---|
| Proxy de mídia privada | Existe em `/api/media/*` | Deve aceitar identidade mobile somente após a camada central de Bearer token |
| DICOMweb/WADO-RS | Existe sob `/api/dicomweb` protegido | Não expor Orthanc diretamente; adaptar autenticação e limites |
| Séries, arquivos, miniaturas | Rotas protegidas existem: `/api/dicom-series`, `/api/dicom-files`, `/api/dicom-thumbnail` | Definir payload, cache, compressão e tamanhos aceitos por dispositivo |
| Estado de cache DICOM | Existe rota `/api/dicom-cache-status/:studyUid` | Reutilizar no app para indicar preparação/indisponibilidade de imagens |
| Stream | Existe `/api/dicom-stream/:studyUid`; confirmar uso e segurança no design mobile | Validar se a experiência Expo precisa de SSE |
| Viewer externo | Há rotas para ferramentas externas de desktop | Decidir separadamente; não incluir por padrão no mobile v1 |
| Modalidades iniciais | Não definidas | Decisão de produto: RX, TC, RM, US ou subconjunto |
| Ferramentas diagnósticas | Viewer web existente | Recomenda-se v1 de consulta/preview com zoom e janela básicos; medições diagnósticas exigem validação clínica e técnica específica |
| Cache offline | Não definido | Não persistir DICOM ou laudos completos offline na v1 sem aprovação formal de privacidade |
| Estudo sintético/anonimizado | Não confirmado | Criar antes da homologação móvel |

## 7. Referência visual móvel existente

O repositório já contém os componentes e páginas que definem a experiência responsiva do Portal, incluindo tela de login, consulta PACS, cabeçalho, detalhes clínicos, viewer, laudos, hooks móveis e tema global. Esses arquivos devem ser usados como **referência de hierarquia visual**, mas a aplicação Expo deverá reimplementar os componentes com os controles nativos adequados.

| Referência solicitada | Situação |
|---|---|
| `client/src/pages/Login.tsx` | Disponível no repositório |
| `client/src/pages/PacsQueryPage.tsx` | Disponível; é a principal referência de worklist responsiva |
| Cabeçalho, detalhes clínicos e viewer | Disponíveis no repositório, sujeitos à conferência no commit produtivo |
| `client/src/hooks/useMobile.tsx` e CSS global | Disponíveis no repositório |
| Logos, favicon e backgrounds permitidos | Ativos locais versionados; direitos de uso devem ser confirmados pelo responsável da marca |
| Capturas móveis sem dados clínicos | Ainda recomendadas para aprovação final de UX |

## 8. Laudos, anamnese, prioridade, áudio e compartilhamento

| Módulo | Existe no Portal | Decisão para v1 mobile |
|---|---|---|
| Laudos | Sim; criação, assinatura, revisão, PDF e regras de imutabilidade | **Pendente**; recomenda-se começar por consulta de laudo assinado |
| Anamnese | Sim; leitura/escrita protegidas por permissão | **Pendente**; começar por leitura ou não incluir no piloto |
| Prioridade clínica | Sim; edição restrita pelo router a `operador` e `atendente` | **Pendente**; pode integrar piloto controlado |
| Áudio | Sim; rotas de listagem/upload, com autorização e storage | **Pendente**; avaliar tamanho, conectividade e privacidade |
| Download/compartilhamento | Rotas existem no Portal | **Pendente**; não liberar sem política de auditoria, retenção e compartilhamento |

## 9. Banco e migrations — somente estrutura

| Campo | Preenchimento seguro |
|---|---|
| ORM e dialeto | Drizzle ORM com MySQL |
| Fonte de schema | `drizzle/schema.ts` |
| Configuração Drizzle | `drizzle.config.ts`, usando `DATABASE_URL` somente no ambiente; valor não deve ser compartilhado |
| Migrations | SQL versionado em `drizzle/` e journal em `drizzle/meta/_journal.json` |
| Última migration conhecida | `0059_report_study_date_snapshot.sql`, aplicada de forma aditiva na VM2 após precheck e backup da tabela `reports` |
| Datas e horas | Campos clínicos de data usam `DATE`; timestamps de negócio devem ser tratados como UTC e apresentados no fuso do usuário; revisar cada tabela ao implementar mobile |
| Tabelas de usuário/unidade | `users`, `units`, `user_unit_permissions` |
| Estudos e metadados | `studies_cache`, `study_metadata`, `study_priority_flags` (nome atual; não `study_priorities`) |
| Sessão móvel revogável | `mobile_sessions` não existe ainda; criar somente por migration aditiva após aprovação de desenho e segurança |

Não enviar dump de produção, backup, URL `DATABASE_URL`, nomes de pacientes, tokens, hashes bcrypt nem qualquer conteúdo de tabela real para o desenvolvimento mobile.

## 10. Operação, publicação e rollback

| Item | Procedimento atual conhecido |
|---|---|
| Documento de deploy | `docs/RUNBOOK_DEPLOY_VM1.md`, complementado por `docs/RUNBOOK_MIGRACAO_INFRAESTRUTURA_MAIOR.md` |
| Build | `pnpm build` |
| Tipagem | `pnpm check` |
| Testes | `pnpm vitest run <arquivos-direcionados>`; a suíte completa pode requerer serviços externos configurados |
| Reinício | `pm2 restart pacs-portal`, seguido de `pm2 save` |
| Health-check | `curl --connect-timeout 3 --max-time 10 -sS -o /dev/null -w 'HTTP_LOCAL=%{http_code}\n' http://127.0.0.1:3000/` e resultado esperado `200` |
| Atualização de código | `git fetch origin main` e `git merge --ff-only <commit-validado>` |
| Schema | Primeiro na VM2, com precheck em `information_schema`, backup e `ALTER` aditivo explícito; depois VM1 |
| Retorno de código | Checkpoint e rollback do commit em procedimento controlado; banco e storage não retornam automaticamente e exigem plano de consistência |
| Executor/aprovador, janela e piloto | Ainda precisam ser definidos pelo responsável operacional |

## 11. Próximos dados necessários do ambiente real

Para encerrar a coleta sem risco, faltam apenas as informações abaixo, que podem ser respondidas sem enviar segredo:

1. Saída sanitizada dos comandos de identificação da VM1 incluídos na seção 1.
2. Confirmação se existe homologação separada e, se existir, sua URL pública sem credenciais.
3. Confirmação de HTTP → HTTPS, acesso externo permitido para celular e existência de WAF/VPN.
4. Definição do piloto: papéis, modalidades, consulta versus edição e grupo inicial de usuários.
5. Limites aprovados de pesquisa, tamanho de mídia e timeout de consulta PACS.
6. Decisão formal sobre cache offline, download e compartilhamento clínico.
7. Indicação do responsável pela privacidade, pelo deploy e pelo rollback.

## Referências

[1] [Contexto tRPC e sessão por cookie](../server/_core/context.ts)
[2] [Rotas HTTP protegidas, CORS e proxy DICOM](../server/_core/index.ts)
[3] [Assinatura e verificação de sessão JWT local](../server/_core/session.ts)
[4] [Autorização central por unidade](../server/authorization.ts)
[5] [Matriz de papéis e permissões de interface](../shared/permissions.ts)
[6] [Serviço de validação de credenciais](../server/auth.service.ts)
[7] [Procedures de autenticação](../server/routers.ts)
[8] [Consultas de estudos](../server/routers/studies.ts)
[9] [Consulta PACS](../server/routers/pacs.ts)
[10] [Runbook de deploy da VM1](RUNBOOK_DEPLOY_VM1.md)
