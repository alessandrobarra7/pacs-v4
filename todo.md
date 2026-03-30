# PACS Portal - TODO List

## FASE 0 - Estruturação do banco de dados e modelos
- [x] Criar schema completo do banco de dados (units, users, studies_cache, reports, templates, audit_log)
- [x] Gerar e aplicar migrações do banco de dados
- [x] Criar helpers de banco de dados para cada entidade

## FASE 1 - Autenticação JWT e RBAC multi-tenant
- [x] Implementar sistema de roles (admin_master, admin_unit, radiologist, referring_doctor)
- [x] Adicionar campo unit_id na tabela users
- [x] Criar middleware de autorização por unidade
- [x] Implementar procedures protegidos por role (adminProcedure, unitAdminProcedure)
- [x] Validar segregação de dados por unit_id

## FASE 2 - Dashboard e gestão de unidades médicas
- [x] Criar CRUD de unidades (name, slug, orthanc_base_url, orthanc_basic_user, orthanc_basic_pass)
- [x] Implementar dashboard com métricas (total estudos, laudos pendentes, últimos acessos)
- [ ] Criar interface de gestão de usuários vinculados a unidades
- [x] Implementar filtros por unidade em todas as queries

## FASE 3 - Sistema de estudos DICOM e templates de laudos
- [x] Criar sistema de cache de estudos (studies_cache) com dados mock
- [x] Implementar busca e listagem de estudos com filtros (patient_name, modality, study_date, accession_number)
- [x] Criar CRUD de templates de laudos por unidade/modalidade
- [ ] Implementar editor de laudos com rascunho automático
- [x] Adicionar sistema de histórico de versões de laudos

## FASE 4 - Proxy DICOMweb e integração OHIF Viewer
- [ ] Implementar proxy DICOMweb (/dicomweb/{unitSlug}/qido, /dicomweb/{unitSlug}/wado)
- [ ] Criar cliente Orthanc no backend com autenticação
- [ ] Integrar OHIF Viewer v3 no frontend
- [ ] Conectar OHIF com proxy DICOMweb do portal
- [ ] Substituir dados mock por consultas reais ao Orthanc

## FASE 5 - Sistema de auditoria e geração de PDFs
- [ ] Implementar tabela audit_log (user_id, unit_id, action, target_type, target_id, ip_address, user_agent, timestamp)
- [ ] Registrar eventos de auditoria (LOGIN, VIEW_STUDY, OPEN_VIEWER, CREATE_REPORT, UPDATE_REPORT)
- [ ] Criar geração de PDF de laudos com logo da unidade
- [ ] Implementar assinatura digital de laudos

## FASE 6 - Testes e entrega final
- [ ] Criar testes unitários para procedures críticos
- [ ] Testar segregação de dados entre unidades
- [ ] Validar fluxo completo de autenticação e autorização
- [ ] Documentar instalação e configuração
- [ ] Criar scripts de seed para dados iniciais

## Customização de Interface
- [x] Criar página de login personalizada com layout 50/50 (formulário esquerdo + imagem direita)
- [x] Adicionar logo "SETE ME" na página de login
- [x] Implementar design profissional médico-hospitalar
- [x] Adicionar imagem médica no lado direito da tela de login

## Ajustes na Página de Login
- [x] Criar logo circular azul com listras (similar ao da referência)
- [x] Ajustar tipografia: "SETE ME" em fonte robusta + "CLOUD" em azul claro ao lado
- [x] Refinar estilo dos campos de input (bordas mais sutis)
- [x] Aumentar border-radius do botão "Acessar"
- [x] Garantir que a imagem ocupe exatamente 50% da largura da tela

## IMPLEMENTAÇÃO RBAC - Sistema de 4 Perfis (Guia LAUDS)
- [x] Atualizar schema: alterar enum role para (admin_master, unit_admin, medico, viewer)
- [x] Criar migration SQL para alterar coluna role
- [x] Atualizar tipos TypeScript com novos perfis
- [x] Criar helpers de permissão (canReport, canAccessAdmin, canAccessPACS)
- [x] Implementar middleware adminMasterProcedure
- [x] Implementar middleware unitAdminProcedure  
- [x] Implementar middleware medicoProcedure
- [ ] Atualizar procedures existentes com novos middlewares
- [ ] Criar componente ProtectedRoute com verificação de perfil
- [ ] Implementar UI condicional na lista de exames (botões por perfil)
- [ ] Criar menu lateral condicional (Administração, PACS Remoto)
- [ ] Remover página DashboardPage.tsx
- [ ] Remover rota /dashboard
- [ ] Redirecionar "/" para "/studies"
- [ ] Atualizar AppLayout com menu condicional
- [ ] Criar página de matriz de permissões (/admin/permissions)
- [ ] Testar fluxo do perfil viewer
- [ ] Testar fluxo do perfil medico
- [ ] Testar fluxo do perfil unit_admin
- [ ] Testar fluxo do perfil admin_master
- [ ] Documentar sistema RBAC no README

## INTEGRAÇÃO ORTHANC REST API (172.16.3.241:8042)
- [x] Criar helper server/orthanc.ts com funções REST (queryStudies, retrieveStudy, getStudyInfo)
- [x] Atualizar procedure pacs.query para usar Orthanc REST em vez de pynetdicom direto
- [x] Atualizar procedure pacs.startViewer para retornar URL DICOMweb do Orthanc (/dicom-web/)
- [x] Atualizar cadastro de unidade: orthanc_base_url obrigatório, credenciais opcionais
- [x] Adicionar procedure getViewerUrl ao router pacs
- [x] Corrigir erros TypeScript (cornerstone.d.ts, AnamnesisModal props)
- [x] Atualizar unidade de teste com URL do Orthanc real (http://172.16.3.241:8042)
- [ ] Testar busca de exames via Orthanc REST API em ambiente de produção (VM1)

## CORREÇÕES E VISUALIZADOR DICOM
- [ ] Diagnosticar e corrigir travamentos da aplicação
- [ ] Corrigir limpeza de nomes de pacientes (remover ^ e dados extras como CPF/leito)
- [ ] Corrigir listagem: mostrar apenas data, nome e modalidade limpos
- [ ] Instalar Cornerstone.js para visualização DICOM no browser
- [ ] Criar página ViewerPage com Cornerstone integrado
- [ ] Implementar C-GET/C-MOVE para baixar imagens DICOM temporariamente
- [ ] Visualização temporária: apagar imagens após fechar o viewer
- [ ] Botão "Ver" abre o viewer com as imagens do estudo

## SESSÃO ATUAL - Visualizador DICOM + RadiAnt + RBAC Frontend
- [x] Corrigir banco de dados: remover IP antigo 179.67.254.135 das unidades
- [x] Implementar visualizador DICOM com Cornerstone.js (DICOMweb via Orthanc)
- [x] Criar proxy DICOMweb no backend (rota /api/dicomweb que faz proxy para Orthanc)
- [x] Criar página DicomViewerPage.tsx com Cornerstone.js
- [x] Conectar botão "Ver" ao visualizador DICOM
- [x] Adicionar botão "RadiAnt" com URL scheme radiant://
- [x] Aplicar RBAC frontend: botões condicionais por perfil
- [x] Corrigir status de laudo: usar hash determinístico em vez de mock aleatório
- [x] Corrigir getReportStatus para ser consistente
- [x] Corrigir pacs.query: fallback para primeira unidade quando unit_id é nulo
- [x] Adicionar badge de perfil no header da página de exames
- [x] Adicionar links de navegação para admins (Unidades, Templates)

## SESSÃO 3 - Correção busca Orthanc local + Visualizador
- [x] Corrigir pacs.query para usar queryStudiesLocal (Orthanc já tem exames armazenados)
- [x] Remover lógica C-FIND remoto como fluxo principal (usar como fallback opcional)
- [x] Corrigir proxy DICOMweb para usar IP da unidade do banco dinamicamente (com cache 60s)
- [x] Adicionar botão "Orthanc" para abrir viewer nativo do Orthanc (Osimis Web Viewer)
- [x] Garantir que o visualizador Cornerstone usa o proxy /api/dicomweb corretamente
- [x] Corrigir URL scheme RadiAnt (window.location.href em vez de window.open)
- [x] Atualizar todas as unidades no banco com orthanc_base_url = http://172.16.3.241:8042

## SESSÃO 4 - Autenticação Local + Deploy VM1
- [x] Implementar login local (usuário/senha) substituindo Manus OAuth
- [x] Adicionar campo password_hash e username na tabela user (migração aplicada)
- [x] Criar procedure auth.login com bcrypt no backend (routers.ts)
- [x] Atualizar frontend Login.tsx para usar auth.login local (sem OAuth)
- [x] Criar scripts/seed-production.mjs para criar admin inicial
- [x] Criar scripts/setup-vm1.sh para setup automático na VM1
- [x] Criar ecosystem.config.cjs para PM2 com variáveis de ambiente
- [x] Adicionar dotenv com caminho absoluto no server/_core/index.ts
- [x] Configurar MySQL na VM2 (172.16.3.101): banco pacs_portal, usuário pacs_user
- [x] Criar usuário admin no banco via SQL direto (admin / password)
- [x] Gerar relatório técnico completo do projeto (PDF + Markdown)
- [ ] Resolver carregamento de variáveis de ambiente no PM2 (dist/index.js injecting env 0)
- [ ] Testar login e busca de exames em produção (http://45.189.160.17)
- [ ] Configurar nginx como proxy reverso (porta 80 → 3000) na VM1
- [ ] Configurar SSL/HTTPS com Let's Encrypt para lauds.com.br

## CORREÇÃO CRÍTICA - TypeError: Invalid URL no lauds.com.br
- [x] Corrigir const.ts: tornar getLoginUrl() segura quando VITE_OAUTH_PORTAL_URL é undefined/vazio
- [x] Corrigir useAuth.ts: não chamar getLoginUrl() no nível do hook (render phase)
- [x] Validar que o build de produção não quebra quando variáveis VITE_ não estão definidas

## INFRAESTRUTURA MIKROTIK — Atualização de Unidades e URLs

- [x] Atualizar banco: criar 5 unidades com IPs/portas reais do Mikrotik NAT
- [x] Corrigir unit_id do usuário admin para Studio Barra7 (Orthanc 172.16.3.241:8042)
- [x] Verificar helper orthanc.ts: URL interna vs. URL pública por unidade
- [x] Atualizar página de Unidades para exibir orthanc_base_url e status de conexão

## IDENTIDADE VISUAL LAUDS

- [x] Substituir nome "SETE ME CLOUD" por "LAUDS" em toda a aplicação
- [x] Atualizar Login.tsx: layout 50/50, imagem P&B, nome LAUDS no canto inferior esquerdo, formulário minimalista sem ícones
- [x] Atualizar index.css: paleta de cores LAUDS (azul #2563EB, fundo #F9FAFB)
- [x] Atualizar Header/Navbar: fundo branco, "LAUDS" bold à esquerda, nav central azul, usuário + logout à direita
- [x] Atualizar App.tsx: remover referências "SETE ME CLOUD", aplicar tema LAUDS
- [x] Atualizar PacsQueryPage.tsx: tabela com colunas Data|Paciente|Unidade|Visualizar|Impressão|Laudar|Status Envio
- [x] Criar AdminPage.tsx: página unificada com abas Unidades|Usuários|Auditoria
- [x] Adicionar procedures admin.listUsers, admin.listAuditLog, admin.deleteUser
- [x] Atualizar App.tsx: adicionar rota /admin
- [x] Fazer push para GitHub após aplicar todas as mudanças

## CORREÇÃO LOGIN - Pixel-Perfect LAUDS

- [ ] Reescrever Login.tsx: replicar fielmente o design do LAUDS de referência (lovable)
- [ ] Trocar rodapé "Desenvolvido por Manus" por "Desenvolvimento StudioBarra7"

## AUDITORIA DE SEGURANÇA — Correções Críticas

- [x] CRÍTICO 1: JWT_SECRET — remover fallback inseguro, falhar cedo se não definido
- [x] CRÍTICO 2: IDOR em startViewer e getViewerUrl — validar unit_id do usuário
- [x] CRÍTICO 3: Rate limiting no auth.login — express-rate-limit (10 tentativas/15min)
- [x] CRÍTICO 4: Padronizar custo bcrypt para 12 em todos os lugares
- [x] MELHORIA: Adicionar helmet.js para headers HTTP de segurança
- [x] MELHORIA: Configurar CORS explicitamente
- [x] MELHORIA: Centralizar JWT_SECRET em server/_core/env.ts (via ENV.cookieSecret)

## ETAPA 2 — Integração DICOM C-FIND (rxhtl 179.67.254.135:11112 PACSML)

- [ ] Simplificar schema de Unidades: manter apenas nome, ip, porta, ae_title, ae_title_local, isActive
- [ ] Simplificar formulário de Unidades no AdminPage.tsx (remover campos Orthanc/Mikrotik)
- [ ] Instalar biblioteca DICOM para Node.js (dicom-dimse)
- [ ] Criar server/dicom.service.ts com função cFind(ip, port, aeTitle, filters)
- [ ] Criar endpoint tRPC studies.queryPACS para buscar via C-FIND
- [ ] Atualizar frontend da worklist para exibir estudos reais do PACS
- [ ] Testar busca real contra rxhtl (179.67.254.135:11112, PACSML)

## REFATORAÇÃO — Relatórios RELATORIO_MUDANCAS_LAUDS + ORIENTACOES_MELHORIAS_LAUDS

- [x] Mudança 1: Remover Orthanc do fluxo pacs.query — C-FIND exclusivo (dicom.service.ts)
- [x] Mudança 1: Adicionar campo unit_id opcional no input de pacs.query para admin_master
- [x] Mudança 1: Usar targetUnitId (admin_master pode passar unit_id explícito)
- [x] Mudança 2: Simplificar formulário de Unidades para 4 campos (Nome, IP, Porta, AE Title)
- [x] Mudança 2: Remover campos Orthanc (orthanc_base_url, orthanc_public_url, orthanc_basic_user, orthanc_basic_pass) dos formulários
- [x] Mudança 2: Atualizar Units.tsx, UnitsPage.tsx e AdminPage.tsx — formulários e tabelas
- [x] Mudança 3: Restringir aba "Unidades" ao perfil admin_master no AdminPage.tsx
- [x] Mudança 3: effectiveTab redireciona para "users" se não for admin_master
- [x] Mudança 5: AE Title exibido no cabeçalho da PacsQueryPage (badge "AE: PACSML")
- [x] Mudança 5: Seletor de unidade no cabeçalho para admin_master (dropdown com todas as unidades)
- [x] Mudança 5: Cache local isolado por unit_id (cacheKey = pacs_query_results_unit_{id})
- [x] Mudança 5: Logout limpa todos os caches de unidade
- [x] Mudança 5: modality enviado como "" em vez de "ALL" (corrige 0 resultados no C-FIND)
- [x] Bug fix: reports.update e reports.sign usam getReportById (não getReportByStudyId)
- [x] Testes Vitest: 11 novos testes cobrindo todas as mudanças (pacs-refactor.test.ts)

## PRÓXIMOS PASSOS — Status Real + Filtro Modalidade + Deploy VM1

- [x] Backend: procedure reports.statusByStudyUids — busca status de laudos em lote por studyInstanceUid
- [x] Frontend: integrar status real do laudo na worklist (substituir hash por consulta ao banco)
- [x] Frontend: adicionar filtro por modalidade (CT/CR/MR/US/DX/PT/Todos) na barra de filtros
- [ ] Deploy VM1: git pull + pnpm build + pm2 restart após todas as mudanças

## PLANO_ACAO_VIEWER_LAUDS — C-MOVE Confiável + Filtro Data Customizado

- [x] dicom_move.py: logs detalhados (StudyUID, AE Titles, IP/porta, qtd arquivos, erros)
- [x] dicom_move.py: retornar JSON com status, qtd_arquivos, diretorio, erros
- [x] startViewer (routers.ts): aguardar confirmação real de recebimento antes de liberar viewer
- [x] startViewer: retornar erro claro quando 0 arquivos recebidos
- [x] _core/index.ts: endpoint listagem de instâncias retorna lista correta de .dcm
- [x] _core/index.ts: limpeza de cache com log (diretório, horário, causa)
- [x] _core/index.ts: limpeza automática de caches com mais de 2 horas
- [x] DicomViewerPage: exibir progresso do C-MOVE (aguardando → recebendo → abrindo)
- [x] DicomViewerPage: só montar Cornerstone após confirmação de arquivos recebidos
- [x] PacsQueryPage: filtro de data customizado (data inicial + data final)
- [x] PacsQueryPage: opção "Personalizado" nos filtros rápidos abre date picker

## CORREÇÃO CRÍTICA — Viewer DICOM (Sessão Atual)

- [x] Corrigir startViewer: remover dependência da tabela studies_cache (estava vazia, causava "Acesso negado")
- [x] startViewer: usar unit_id do usuário diretamente (sem consultar studies_cache)
- [x] startViewer: aceitar unit_id opcional no input para admin_master
- [x] Corrigir conflito Python: PYTHONHOME/PYTHONPATH apontavam para Python 3.13 (uv), mas pynetdicom está no Python 3.11
- [x] Usar /usr/bin/python3.11 com caminho absoluto e limpar PYTHONHOME/PYTHONPATH no execFileAsync
- [x] Corrigir getViewerUrl: remover dependência de studies_cache
- [x] PacsQueryPage: passar unit_id na URL ao navegar para o viewer (admin_master)
- [x] DicomViewerPage: ler unit_id da query string e passar ao startViewer
- [x] Corrigir teste auth.logout: sameSite "none" → "lax" (alinhado com auth.service.ts)
- [x] 42/42 testes passando

## PRÓXIMO PASSO CRÍTICO — Configuração PACS (Ação no Servidor)

- [ ] Registrar AE Title "LAUDS" no Orthanc dpacs (172.16.3.250:3004) como destino autorizado para C-MOVE
- [ ] Verificar porta 11112 aberta no VM1: ss -tlnp | grep 11112
- [ ] Testar C-MOVE completo após configuração do PACS
- [ ] Criar página de criação/edição de laudos (/reports/create/:uid)
- [ ] Adicionar botão C-ECHO na página de Unidades para teste de conectividade

## NOVA ARQUITETURA VIEWER — DICOMweb WADO-RS (sem C-MOVE)

- [x] Verificar suporte C-GET no PACS dpacs (45.189.160.17:3004) — confirmado, modo promíscuo
- [x] Reescrever dicom_move.py: C-MOVE → C-GET com negociação de roles (ext_neg scp_role=True)
- [x] Testar C-GET: 220 arquivos DICOM recebidos com sucesso (146MB, 91s)
- [x] Atualizar routers.ts: labels C-MOVE → C-GET, mensagens de erro atualizadas
- [x] 42/42 testes passando
- [ ] Testar fluxo completo via interface web: busca → clicar Visualizar → imagens no browser

## ETAPA 1 — Viewer DICOM: Corrigir dicomParser e Renderização

- [ ] Verificar se dicom-parser está instalado nas dependências
- [ ] Injetar dicomParser explicitamente no csDicomLoader antes do init()
- [ ] Configurar workers do Cornerstone (codecs WASM) corretamente no Vite
- [ ] Validar que vp.setStack() resolve e imagem é renderizada
- [ ] Confirmar renderização real no browser com estudo CT real

## ETAPA 1 — Viewer DICOM Funcional (Cornerstone.js)

- [x] Instalar comlink (dependência do Cornerstone WebWorkerManager)
- [x] Adicionar dicom-parser ao optimizeDeps.include (fix do require('zlib') no browser)
- [x] Expandir vitePluginCjsDefaultExport para cobrir codecs WASM do Cornerstone (libjpeg-turbo, charls, openjpeg, openjph)
- [x] Adicionar @cornerstonejs/dicom-image-loader ao optimizeDeps.exclude (evita pré-bundle do Web Worker)
- [x] Converter imports dinâmicos (import()) para imports estáticos no DicomViewerPage.tsx
- [x] Validar renderização real: canvas 1236x1022px, hasContent:true — IMAGEM CT RENDERIZANDO!
- [ ] Salvar checkpoint após viewer funcional

## FIX PRODUÇÃO — module is not defined (30/03/2026)

- [ ] Corrigir vite.config.ts: build de produção com módulos CJS do Cornerstone
- [ ] Testar build local sem erros
- [ ] Deploy na VM1 e validar que a página carrega
