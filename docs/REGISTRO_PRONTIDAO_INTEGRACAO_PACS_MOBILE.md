# Registro de Prontidão para Integração PACS Mobile

**Sistema:** PACS Portal / LAUDS
**Finalidade:** registrar, de forma não sensível, quais informações e capacidades já existem para um futuro aplicativo PACS Mobile e quais decisões ainda dependem do ambiente real.
**Base da avaliação:** código atual do repositório e operação conhecida em 29/08/2026.

> O aplicativo móvel deve consumir uma API segura da aplicação. Ele **não** deve receber acesso direto ao MySQL, aos IPs privados do Orthanc, a AE Titles, a credenciais DICOM ou a chaves de MinIO. Esta separação já é coerente com a arquitetura atual do Portal.[1] [2]

## 1. Conclusão executiva

O PACS Portal já contém os dados de usuários, unidades, permissões, estudos, laudos e rotas protegidas necessários para servir de backend a um cliente móvel. A maior lacuna não é banco de dados: é a autenticação. A sessão atual foi projetada para navegador e depende de um JWT guardado em **cookie HTTP**. Embora o CORS já permita o cabeçalho `Authorization`, o backend ainda não interpreta `Authorization: Bearer <token>` nas rotas tRPC nem nas rotas HTTP protegidas.[3] [4]

Assim, o PACS Mobile pode compartilhar a mesma base e as mesmas regras de autorização, mas **não deve ser conectado diretamente à produção** antes de uma extensão controlada de autenticação móvel, testes de dispositivo e definição explícita do escopo clínico inicial.

## 2. Status das informações solicitadas

| Item solicitado | Situação | Informação registrada / ação necessária |
|---|---|---|
| URL pública do Portal/API | **Confirmado** | O domínio operacional conhecido é `https://lauds.com.br`. A API tRPC é atendida sob `/api/trpc`. A validação do certificado em iOS/Android deve ser feita durante a homologação móvel. |
| Ambiente de homologação independente | **Pendente** | Não há confirmação de uma VM ou URL de homologação separada. O sandbox/preview de desenvolvimento não substitui uma homologação conectada a dados anonimizados. |
| Repositório oficial | **Confirmado** | `https://github.com/alessandrobarra7/pacs-v4.git`, branch remota `main`. A VM1 usa branch local histórica `integracao/login-mobile`, atualizada por fast-forward a commits de `main`; o commit produtivo deve ser confirmado antes de qualquer integração. |
| Backend Node/Express/tRPC | **Confirmado** | Backend Express com tRPC, React/Vite no frontend e MySQL via Drizzle.[5] |
| Usuários e credenciais existentes | **Confirmado com limite** | O login local valida usuário ativo, expiração de conta e `password_hash` bcrypt. A resposta sanitizada não expõe a senha.[6] |
| Sessão específica para dispositivo móvel | **Ausente** | Não há emissão de token mobile, `refresh token`, revogação por dispositivo ou escopo específico. É necessária implementação nova. |
| `Authorization: Bearer` | **Ausente** | Cabeçalho permitido pelo CORS, porém contexto e middleware procuram somente cookie de sessão. |
| Mesma base MySQL de produção | **Confirmado** | A integração prevista reutiliza `users`, `user_unit_permissions`, `units`, `studies_cache`, laudos e demais tabelas atuais; não há necessidade de duplicar banco. |
| PM2/Nginx em produção | **Confirmado** | VM1 executa a aplicação com PM2, Nginx recebe a borda e a porta interna 3000 é verificada por saúde local. |
| Responsável, janela de manutenção e política clínica | **Pendente** | Devem ser definidos pelo responsável operacional antes da implantação de autenticação móvel. |

## 3. Autenticação e autorização: estado atual

O procedimento `auth.login` recebe `login` e `password`, valida as credenciais pela camada `AuthService`, cria uma sessão JWT e a entrega por cookie. A validação rejeita usuário inexistente, inativo, expirado, sem senha ou com senha inválida.[6] [7] O contexto tRPC lê esse cookie, verifica o JWT e então busca novamente o usuário no banco, removendo a sessão se a conta estiver inativa ou expirada.[3]

| Capacidade | Web atual | PACS Mobile futuro |
|---|---|---|
| Login com usuário existente | Sim | Reutilizar a mesma validação de credenciais |
| Sessão | Cookie HTTP seguro | Token de acesso curto no armazenamento seguro do aparelho |
| Renovação | Novo login do navegador | Definir refresh token ou reautenticação explícita |
| Revogação | Desativação/expiração do usuário é revalidada | Acrescentar revogação por dispositivo/JTI e revalidação da conta a cada acesso |
| Unidade/permissão | Validada nos routers e na camada central | Reutilizar as mesmas funções, sem permissões somente no app |
| Auditoria | Login e acessos críticos são registrados | Registrar `MOBILE_LOGIN`, consulta de estudo e abertura de conteúdo, com dispositivo/origem sem coletar excesso de dados |

> A primeira mudança de backend deve ser uma camada de autenticação móvel limitada e auditável. Não se deve adaptar o app para copiar cookies do navegador nem expor o `JWT_SECRET` ao dispositivo.

## 4. Contratos existentes que podem ser reutilizados

As rotas abaixo existem no código, mas dependem da autenticação atual por cookie. Após a camada de token móvel ser implementada de maneira centralizada, elas podem reutilizar a mesma identidade e as mesmas verificações de unidade.[3] [4]

| Domínio | Contrato existente | Entradas confirmadas | Controle já existente |
|---|---|---|---|
| Autenticação | `auth.login`, `auth.me`, `auth.logout` | `login`, `password` no login | Credencial, ativo, expiração e cookie de sessão |
| Estudos em cache | `studies.list` | paciente, modalidade, data, accession, página, `pageSize`, unidade opcional | `view_studies` e unidade permitida |
| Detalhe de estudo | `studies.getById` | `id` | Unidade real do estudo e auditoria `VIEW_STUDY` |
| Abrir viewer | `studies.openViewer` | `studyId` | Unidade permitida e auditoria `OPEN_VIEWER` |
| Consulta PACS | `pacs.query` | paciente, ID, modalidade, data, accession, descrição e unidade opcional | Unidade associada, configuração DICOM e permissão efetiva |
| Conteúdo privado | `/api/media/*` | referência de mídia | Autorização por unidade/estudo antes de servir objeto |
| DICOM protegido | `/api/dicomweb`, `/api/dicom-series`, `/api/dicom-files`, `/api/dicom-thumbnail` | conforme rota e UID do estudo | Cookie atual, autorização por estudo/unidade e proxy da VM1 |
| Clínico complementar | Laudos, anamnese, prioridade e áudio | escopo varia por router | Permissões específicas e auditoria, quando aplicável |

### 4.1 Paginação, erros e formato de resposta

`studies.list` usa página padrão `1` e `pageSize` padrão `20`, devolvendo itens, total, página e tamanho. O contrato não impõe limite máximo explícito no schema atual; para o mobile, um limite máximo deve ser definido no backend antes de liberar pesquisas amplas.[8] A consulta `pacs.query` consulta o PACS em tempo real e também deve receber limites operacionais e timeout explícitos na especificação móvel.[9]

Os routers já usam erros tRPC como `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` e `PRECONDITION_FAILED`. O app deve tratar esses códigos sem expor detalhes internos de rede ou configuração do PACS.[8] [9]

## 5. Imagens médicas e visualização

O Portal mantém o Orthanc e o MinIO fora do alcance direto do frontend. A rota `/api/media/*` autentica e valida a permissão no estudo/unidade antes de transferir o objeto da VM3, e as rotas DICOM usam o backend/proxy como fronteira de segurança.[4] Isso é uma base adequada para mobile, mas ainda ligada ao cookie de navegador.

| Pergunta | Estado atual | Decisão necessária antes do mobile |
|---|---|---|
| DICOMweb/WADO-RS protegido | **Existe via proxy da aplicação** | Adaptar a autenticação central para aceitar token móvel; não abrir Orthanc ao app |
| Séries, arquivos e miniaturas | **Existem rotas protegidas** | Definir formatos, compressão, cache temporário e limites por dispositivo |
| Estudo sintético/anonimizado | **Pendente** | Preparar estudo de teste sem dados clínicos reais para homologação |
| Modalidades iniciais | **Pendente** | Confirmar RX, TC, RM, US ou subconjunto inicial |
| Viewer | **Disponível no Portal web** | Para v1, recomendar consulta/preview e controles básicos; ferramentas diagnósticas avançadas exigem escopo próprio |
| Armazenamento offline | **Não aprovado/definido** | Manter sem persistência de DICOM ou laudos completos offline até decisão formal de privacidade |

## 6. Decisões de pré-desenvolvimento registradas em 29/08/2026

O checklist fornecido pelo responsável operacional definiu o escopo inicial e os limites abaixo. Estas decisões orientam o planejamento técnico, mas não substituem uma autorização explícita para implantar a extensão de autenticação móvel no ambiente real.

| Tema | Decisão registrada |
|---|---|
| Escopo da versão 1 | Consulta de estudos, laudos, anamnese e prioridade clínica |
| Perfis inicialmente considerados | `medico`, `unit_admin`, `viewer` e `operador` |
| Conteúdo offline | Nenhum dado clínico offline; somente a sessão móvel no cofre seguro do aparelho |
| Estudos por página | Padrão 20; limite máximo planejado de 50 |
| Pesquisa por data | Intervalo máximo planejado de 31 dias |
| Resultados sem refinamento | Máximo planejado de 200 antes de exigir filtro adicional |
| Timeout C-FIND | Deve ser definido separadamente do timeout C-GET; valor ainda pendente de aprovação operacional |
| Homologação, publicação e rollback | Alessandro é o responsável designado |

### 6.1 Pré-requisitos que ainda bloqueiam testes contra ambiente real

1. Criar ou indicar uma homologação com banco separado de produção.
2. Disponibilizar estudo DICOM sintético ou anonimizado para testar consulta, séries, miniaturas e preview sem expor dados clínicos.
3. Criar contas de teste por canal seguro quando a homologação estiver disponível.

### 6.2 Confirmações necessárias antes da publicação controlada

1. Reconfirmar na VM1 o commit em produção, versões de Node.js e pnpm e o estado PM2.
2. Confirmar se Nginx força HTTP para HTTPS e se existe WAF, VPN ou proxy corporativo que afete chamadas externas de dispositivos móveis.
3. Confirmar que o domínio público pode ser alcançado fora da rede das unidades no comportamento esperado do aplicativo.
4. Definir o valor nominal de timeout C-FIND, limites de mídia e quais modalidades integrar no piloto.
5. Formalizar a autorização da nova camada de token móvel: acesso curto, renovação/reautenticação, revogação por dispositivo e auditoria.
6. Aprovar as regras de privacidade para laudo, anamnese e prioridade no dispositivo móvel.

## 7. Ordem segura de implementação futura

1. Revisar e testar o backend em homologação, incluindo token móvel e autorização centralizada.
2. Adicionar testes de regressão para token ausente, token expirado, conta desativada, conta expirada, unidade não autorizada e acesso a arquivo de outra unidade.
3. Documentar contratos JSON anonimizados e os erros esperados por endpoint.
4. Construir o cliente Expo usando armazenamento seguro apenas para a sessão e sem credenciais internas.
5. Testar com usuários e estudos anonimizados em dispositivo Android e iOS.
6. Publicar no ambiente real por atualização fast-forward, com checkpoint, testes, build, PM2 e verificação HTTP, seguindo o procedimento de produção já documentado.[10]

## 8. Informações que não devem ser registradas aqui

Este registro não deve conter: `JWT_SECRET`, senhas de banco, credenciais de MinIO, usuário/senha Basic do Orthanc, AE Titles sensíveis, IPs privados de PACS, tokens de usuário, dados clínicos de pacientes ou contas de teste reais.

## Referências

[1] [Arquitetura operacional de três VMs](ARQUITETURA_3_VMS_PACS.md)
[2] [Runbook de migração para infraestrutura maior](RUNBOOK_MIGRACAO_INFRAESTRUTURA_MAIOR.md)
[3] [Contexto tRPC e leitura de sessão](../server/_core/context.ts)
[4] [Rotas HTTP protegidas e proxy de mídia/DICOM](../server/_core/index.ts)
[5] [Scripts e dependências da aplicação](../package.json)
[6] [Validação de credenciais locais](../server/auth.service.ts)
[7] [Procedimentos de autenticação](../server/routers.ts)
[8] [Router de estudos](../server/routers/studies.ts)
[9] [Router de consulta PACS](../server/routers/pacs.ts)
[10] [Runbook de deploy na VM1](RUNBOOK_DEPLOY_VM1.md)
