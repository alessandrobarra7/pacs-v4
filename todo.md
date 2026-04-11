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

## PERFORMANCE VIEWER — Streaming Progressivo + Exportação DICOM

- [x] Streaming progressivo: endpoint SSE /api/dicom-stream/:studyUid (C-GET com eventos por arquivo)
- [x] Modificar dicom_move.py para modo streaming (emite JSON por linha a cada arquivo salvo)
- [x] Refatorar DicomViewerPage: consumir SSE e adicionar imagens ao stack progressivamente
- [x] Botão "Baixar Imagens" na listagem com barra de progresso (pré-download antes de laudar)
- [x] Botão "Exportar ZIP" no viewer para baixar arquivos DICOM (RadiAnt/OsiriX/Horos)
- [x] Endpoint /api/dicom-export/:studyUid que gera ZIP dos arquivos em cache

## Cache Persistente de Download (Sessão 31/03/2026)
- [x] Endpoint GET /api/dicom-cache-status/:studyUid para verificar se estudo já está em cache no servidor
- [x] PacsQueryPage consulta status do cache ao carregar e mantém botão verde se já baixado
- [x] Limpeza automática do cache após 30 min de inatividade por estudo (timer por arquivo)

## Melhorias de UX — Cache e Viewer (31/03/2026)

- [ ] Botão laranja inteligente: se estudo já em cache, abre viewer instantaneamente (sem novo C-GET)
- [ ] Pré-download automático ao entrar na listagem: opção nas configurações da unidade
- [ ] Indicador de espaço do cache em /tmp/dicom-cache na tela de Administração com botão de limpeza manual

## Correções Viewer DICOM (31/03/2026)

- [ ] Corrigir travamento do scroll CT: substituir closure stale do `phase` por `useRef` no `addImageToStack`
- [ ] Corrigir botão RadiAnt: protocolo radiant:// com IP/porta do PACS e Study UID correto

## SESSÃO ATUAL - Fix Spinner Infinito + Scroll Viewer

- [x] Corrigir bug do spinner infinito no pré-download: backend agora trata type:complete com success:false imediatamente (não espera o close)
- [x] Corrigir frontend: distinguir evento 'error' customizado (com dados JSON) do evento nativo do EventSource (sem dados)
- [x] Adicionar timeout de segurança de 5 minutos no pré-download para evitar spinners infinitos
- [x] Adicionar cleanupSSE() nos handlers de complete e error para limpar o timeout
- [x] Confirmar scroll funcionando no viewer: Carlos Henrique (6 imagens CR) navega entre slices com setas
- [x] Confirmar botão verde após download: Antonio Santos, Pedro Daniel e Carlos Henrique todos com botão verde

## MELHORIA DO VIEWER DICOM - Navegação entre Slices

- [x] StackScroll como ferramenta padrão ao abrir o viewer (em vez de Window/Level)
- [x] Slider vertical na lateral direita para navegar entre slices arrastando
- [x] Botões ⬆/⬇ de navegação maiores e mais visíveis na toolbar
- [x] Modo Cine: botão Play que percorre slices automaticamente em loop
- [x] Ícone mais intuitivo para o botão Scroll (Layers/setas verticais)
- [x] Barra de progresso de slices na parte inferior com indicador visual de posição

## VIEWER - Miniaturas de Séries e Anotações Persistentes

- [x] Schema: tabela dicom_annotations no banco (studyUid, seriesUid, userId, annotationData JSON, createdAt)
- [x] Backend: endpoint GET /api/trpc/annotations.getByStudy
- [x] Backend: endpoint POST /api/trpc/annotations.save
- [x] Backend: endpoint DELETE /api/trpc/annotations.delete
- [x] Backend: endpoint GET /api/dicom-series/:studyUid — listar séries com metadata e thumbnail
- [x] Viewer: faixa horizontal de miniaturas de séries na parte inferior do canvas
- [x] Viewer: clicar na miniatura troca a série ativa no viewport
- [x] Viewer: carregar anotações salvas ao abrir o viewer (LengthTool)
- [x] Viewer: salvar anotações automaticamente ao criar/modificar medição
- [x] Viewer: botão para deletar anotação individual

## MÓDULO ANAMNESE

- [x] Schema: tabela anamnesis_simple (studyInstanceUid, patientName, presets JSON, manual_text, userId, createdAt, updatedAt)
- [x] Migration SQL executada no banco
- [x] Helper: getAnamnesisSimpleByStudy, saveAnamnesisSimple (upsert)
- [x] tRPC: anamnesisSimple.getByStudy, anamnesisSimple.save
- [x] Componente AnamnesisModal.tsx reescrito com presets + campo manual obrigatório
- [x] Botão "Anamnese" na listagem de exames (PacsQueryPage) por estudo
- [x] Indicador visual: botão verde quando anamnese já foi preenchida
- [x] Viewer: painel colapsável mostrando anamnese salva do estudo aberto
- [x] Laudo: card de anamnese exibido no ReportEditorPage acima do seletor de template

## MÓDULO STUDY_METADATA — Edições Compartilhadas por Unidade

- [x] Schema: tabela study_metadata (studyInstanceUid, unitId, patientNameOverride, descriptionOverride, notes, editedByUserId, editedByName, editedAt)
- [x] Migration SQL executada no banco (migrate-study-metadata.mjs)
- [x] Helper: getStudyMetadata, getStudyMetadataBatch, upsertStudyMetadata
- [x] tRPC: studyMetadata.get, studyMetadata.getBatch, studyMetadata.save
- [x] Worklist: merge PACS + banco ao exibir estudos (nome/descrição editados sobrepõem PACS)
- [x] Worklist: indicador visual (✏️ âmbar) quando nome/descrição foi editado pelo técnico
- [x] Worklist: notas do técnico exibidas abaixo do nome do paciente
- [x] EditableExamName: persiste no banco via tRPC (não mais localStorage)
- [x] Viewer: painel de anamnese exibe seção "✏️ Editado pelo Técnico" com nome, exame e notas
- [x] Laudo: card âmbar "Informações Editadas pelo Técnico" acima do card de anamnese
- [x] Laudo: exibe "Editado por [técnico] em [data]" quando houver override

## BUGS — Cadastro e Seleção de Unidades

- [ ] Bug: erro ao adicionar nova unidade PACS (179.67.254.135, 11112, PACSML)
- [ ] Bug: ao voltar para a página principal, sempre reseta para a primeira unidade (perde a seleção)
- [ ] Fix: persistir unidade selecionada no localStorage entre navegações

## MELHORIAS ADMIN — Formulários de Unidade e Usuário (Etapa 1)

- [x] Migração banco: adicionar colunas address e equipment_info na tabela units
- [x] Migração banco: adicionar coluna expiration_date na tabela users
- [x] Criar componente UnitFormDialog.tsx com campos: nome, slug, endereço, equipamento, PACS (ip/porta/ae_title/ae_local), toggle ativo
- [x] Criar componente UserFormDialog.tsx com campos: nome, email, usuário, senha, perfil, data expiração, toggle ativo, badge de perfil colorido
- [x] Atualizar AdminPage: usar UnitFormDialog e UserFormDialog em vez de formulários inline
- [x] Atualizar AdminPage: adicionar botão Power/PowerOff para ativar/desativar unidade diretamente na tabela
- [x] Atualizar AdminPage: adicionar botão ativar/desativar usuário diretamente na tabela
- [x] Atualizar AdminPage: adicionar coluna Expiração na tabela de usuários
- [x] Atualizar AdminPage: badges de perfil com cores semânticas (vermelho admin_master, laranja unit_admin, azul médico, etc.)
- [x] Atualizar AdminPage: coluna Unidade na tabela de usuários
- [x] Atualizar procedure units.update para aceitar address e equipment_info
- [x] Atualizar procedure units.create para aceitar address e equipment_info
- [x] Criar procedure admin.updateUser para editar usuário (nome, email, role, isActive, expiration_date, unit_id)
- [x] Criar procedure admin.toggleUserActive para ativar/desativar usuário
- [x] Atualizar procedure admin.listUsers para retornar expiration_date e nome da unidade

## MELHORIAS ADMIN — Etapa 2: Múltiplas Unidades por Usuário + Permissões Granulares

- [ ] Schema: criar tabela user_unit_permissions (user_id, unit_id, view_studies, edit_reports, view_anamnesis, print_reports, manage_templates)
- [ ] Migração SQL aplicada no banco
- [ ] Helper: getUserUnitPermissions(userId), setUserUnitPermissions(userId, permissions[])
- [ ] tRPC: admin.getUserPermissions, admin.setUserPermissions
- [ ] UserFormDialog: seção "Unidades e Permissões" com checkbox por unidade + 5 permissões granulares ao expandir
- [ ] Salvar/editar permissões ao criar/editar usuário
- [ ] PacsQueryPage: dropdown de unidades mostra apenas unidades com permissão view_studies
- [ ] Procedures protegidos: verificar permissão granular além do role (ex: edit_reports para laudar)
- [ ] admin_master e unit_admin têm acesso total sem precisar de registro na tabela

## FILTRO DE DATA — Calendário único (Popover)
- [x] Substituir filtro de data (campos de/até + botão Buscar) por Popover com Calendar shadcn que dispara busca ao clicar em uma data
- [x] Botão "Limpar" para remover a data selecionada e voltar ao filtro de período anterior

## AJUSTES TOOLBAR
- [x] Remover botão "Todos" da barra de filtros

## AJUSTES TOOLBAR — Layout
- [ ] Separar mais os botões de filtro (gap maior), mover Auto-Download para a direita junto à contagem de pacientes

## BUG CORRIGIDO — Edição de Usuário (expiration_date)
- [x] Corrigir conversão de expiration_date: string "YYYY-MM-DD" convertida para BIGINT (ms) na procedure admin.updateUser
- [x] Adicionar expiration_date no select do listUsers (estava faltando na query)
- [x] Corrigir UserFormDialog: converter BIGINT (ms) para YYYY-MM-DD ao popular o formulário de edição

## VISUALIZADOR — Thumbnails Reais nas Séries
- [ ] Gerar miniatura real (canvas) do primeiro frame de cada série no painel de séries do DicomViewerPage

## NOVO EDITOR DE LAUDOS WYSIWYG

- [ ] Adicionar campo `crm` (VARCHAR 50) na tabela `user`
- [ ] Adicionar campo `signature_url` (TEXT) na tabela `user`
- [ ] Adicionar campo `logo_url` (TEXT) na tabela `unit`
- [ ] Criar tabela `phrase_groups` (id, name, color, sortOrder, isActive)
- [ ] Criar tabela `phrases` (id, groupId, userId, content, isFavorite, isActive, sortOrder)
- [ ] Criar helpers de DB para phrases e phrase_groups
- [ ] Criar procedures tRPC para CRUD de phrases (phrases.list, phrases.add, phrases.delete)
- [ ] Criar procedure para upload de assinatura/logo via S3 (admin_master only)
- [ ] Criar procedure para atualizar CRM do médico (admin_master only)
- [ ] Criar componente ReportDocument.tsx (div contentEditable A4 WYSIWYG)
- [ ] Criar componente ReportSidebar.tsx (3 abas: templates, frases, exames)
- [ ] Criar componente SignatureManager.tsx (upload assinatura/logo via S3)
- [ ] Criar hook useUserReportData.ts integrado ao backend via tRPC
- [ ] Reescrever ReportEditorPage.tsx com novo layout
- [ ] Implementar geração de PDF para download (html2pdf ou puppeteer)
- [ ] Corrigir e testar função assinar/finalizar (reports.sign)
- [ ] Seed inicial de phrase_groups e phrases no banco

## EDITOR WYSIWYG — IMPLEMENTADO (02/04/2026)
- [x] Campos crm, signature_url, logo_url adicionados via SQL externo
- [x] Tabelas phrase_groups e phrases criadas via SQL externo
- [x] Helpers de DB para phrases e phrase_groups (listPhraseGroups, listPhrases, createPhraseGroup, createPhrase, deletePhrase, togglePhrasesFavorite)
- [x] Procedures tRPC: phrases.listGroups, phrases.list, phrases.createGroup, phrases.create, phrases.delete, phrases.toggleFavorite
- [x] Procedures tRPC: medicalData.updateUserMedical, medicalData.updateUnitLogo, medicalData.getReportContext
- [x] Componente ReportDocument.tsx (contentEditable A4 WYSIWYG com cabeçalho, tabela de paciente, corpo editável, assinatura)
- [x] Componente ReportSidebar.tsx (abas: templates, frases com grupos/favoritos, config)
- [x] ReportEditorPage.tsx reescrito com layout sidebar + documento A4
- [x] Geração de PDF via html2canvas + jsPDF (download do laudo)
- [x] Impressão via window.print() com CSS @media print
- [x] Função "Assinar e Finalizar" integrada ao reports.sign tRPC
- [x] Salvar rascunho integrado ao reports.create/update tRPC
- [x] Carregamento de laudo existente ao abrir editor
- [x] Substituição de variáveis no template ({{patientName}}, {{studyDate}}, etc.)
- [x] unitId corrigido para Number no sessionStorage (PacsQueryPage)

## REDESIGN EDITOR DE LAUDOS — Fiel à Referência Visual (02/04/2026)
- [ ] Header: título "Editor de Laudo" + subtítulo com nome paciente/exame, botões: seletor de nome do exame (dropdown com sugestões), Inserir Assinatura, Imprimir, Salvar, Assinar
- [ ] Sidebar aba Templates: lista "Meus Templates" com botão +Novo, templates agrupados por categoria
- [ ] Sidebar aba Frases: frases pessoais do usuário, clique insere no cursor do documento
- [ ] Sidebar aba Exames: lista de sugestões de nomes de exames para inserção rápida
- [ ] Sidebar seção Assinatura: upload de assinatura (visível apenas para admin_master)
- [ ] Sidebar seção Logo da Unidade: upload de logo (visível apenas para admin_master)
- [ ] Documento A4: cabeçalho com logo da unidade (placeholder se não tiver), dados do paciente em linha (nome, data nasc, idade, sexo, data realização)
- [ ] Documento A4: título do exame centralizado em negrito (vem do seletor no header)
- [ ] Documento A4: seções RELATÓRIO e IMPRESSÃO com texto editável
- [ ] Documento A4: rodapé com nome do radiologista
- [ ] Seletor de exame no header: dropdown com lista de sugestões + campo manual, ao selecionar vira título no documento
- [ ] Cadastro de Unidades (AdminPage): adicionar campo de upload de logo da unidade (S3)
- [ ] Cadastro de Usuários médicos (AdminPage): adicionar campo de upload de assinatura (S3)
- [ ] Botão "Inserir Assinatura" no header: insere imagem da assinatura do médico no documento no cursor atual

## REDESIGN EDITOR WYSIWYG (02/04/2026)
- [x] ReportEditorPage reescrito com design fiel à referência visual
- [x] Header: botão Voltar, título + subtítulo, seletor de exame com dropdown e busca, Inserir Assinatura, Imprimir, Salvar, Assinar
- [x] Sidebar 260px com 3 abas: Templates, Frases, Exames
- [x] Aba Templates: lista com clique para aplicar template ao documento
- [x] Aba Frases: grupos colapsáveis, inserção no cursor, favoritar, excluir, adicionar frase/grupo
- [x] Aba Exames: lista completa de 60+ sugestões de nomes de exame
- [x] Upload de assinatura e logo visível apenas para admin_master na sidebar
- [x] Documento A4 com logo da unidade, dados do paciente, título do exame, corpo editável, rodapé
- [x] UserFormDialog: seção Dados Médicos (CRM + upload de assinatura) para médicos/unit_admin
- [x] UnitFormDialog: seção Logo da Unidade com upload de imagem ao editar

## REDESIGN V2 EDITOR (02/04/2026)
- [x] Header: nome do paciente + exame, botões apenas Imprimir e Assinar
- [x] Remover seletor de exame do header, remover botão Inserir Assinatura, remover botão Salvar
- [x] Aba 1 Exames: buscador + lista de nomes de exame, clique envia título ao documento
- [x] Aba 2 Templates: grupos de templates criados pelo médico, CRUD de grupos e templates
- [x] Aba 3 Frases: grupos de frases, inserção no cursor, CRUD
- [x] Aba 4 Inserir: carimbos/imagens do médico logado (assinatura, carimbo), arrastáveis sobre o documento
- [x] Documento A4: logo da empresa (admin root), dados do paciente obrigatórios
- [x] Rodapé legal fixo no documento com texto Lauds/CNPJ/telefone/site/instagram

## BUG: IMPRESSÃO NÃO MOSTRA CONTEÚDO
- [x] Corrigir CSS de impressão para garantir que o documento A4 apareça completo ao imprimir

## CORREÇÕES URGENTES — EDITOR DE LAUDOS (02/04/2026)
- [ ] Formatar data "Realizado em" de YYYYMMDD para DD/MM/YYYY no documento A4
- [ ] Corrigir assinatura: mostrar imagem da assinatura real do médico (não avatar)
- [ ] Adicionar guards de null em todos os .map() para prevenir TypeError
- [ ] Corrigir erro TypeError: Cannot read properties of null (reading 'id') reportado pelo usuário

## CORREÇÕES APLICADAS (02/04/2026 08:33)
- [x] Formatar data "Realizado em" de YYYYMMDD para DD/MM/YYYY no documento A4
- [x] Adicionar guards de null (filter(Boolean)) em todos os .map() de templates e phrases para prevenir TypeError
- [x] Verificar assinatura: documento mostra corretamente nome do médico quando não há signatureUrl

## BOTÕES DE APAGAR ASSINATURA/CARIMBO (02/04/2026)
- [x] Adicionar procedure backend para remover signature_url do médico (admin_master e unit_admin)
- [x] Adicionar botão "Apagar Assinatura" na aba Inserir (visível apenas para admin_master e unit_admin)
- [x] Adicionar botão "Apagar Carimbo" na aba Inserir (visível apenas para admin_master e unit_admin)

## CRUD LOGO UNIDADE / ASSINATURA USUÁRIO (02/04/2026)
- [ ] Unidades: exibir logo atual no formulário de edição com botão Remover
- [ ] Unidades: botão de upload de nova logo (substituir existente)
- [ ] Unidades: procedure removeLogo no backend (limpar logo_url)
- [ ] Usuários: exibir assinatura atual no formulário de edição com botão Remover
- [ ] Usuários: botão de upload de nova assinatura (substituir existente)
- [ ] Usuários: campo CRM visível e editável no formulário de edição
- [ ] Usuários: procedure removeSignature já existe — garantir que seja chamada corretamente

## UPLOAD DE CARIMBO DO MÉDICO — IMPLEMENTAR
- [ ] Adicionar campo stamp_url na tabela users (ALTER TABLE)
- [ ] Adicionar procedure backend para upload de carimbo (medicalData.updateStamp)
- [ ] Adicionar procedure backend para remover carimbo (medicalData.removeStamp)
- [ ] Adicionar campo de upload de carimbo no UserFormDialog (visível apenas para admin_master)
- [ ] Adicionar preview e botão Remover carimbo no UserFormDialog
- [ ] Testar upload, visualização e remoção de carimbo

## CORREÇÕES EDITOR DE LAUDOS V3 — 02/04/2026 09:30
- [ ] Documento A4: remover seção de assinatura (imagem/nome do médico) do corpo do laudo
- [ ] Documento A4: remover nome do usuário logado do canto inferior esquerdo
- [ ] Documento A4: manter apenas logo da unidade + nome do paciente + data de nascimento + data de realização no cabeçalho
- [ ] Documento A4: rodapé legal fixo na parte inferior da folha (frase completa da Lauds)
- [ ] Impressão: replicar exatamente o mesmo layout do documento A4 (logo + dados + corpo + rodapé legal)
- [ ] UserFormDialog: permitir upload de carimbo ao CRIAR médico (não apenas ao editar)
- [ ] UserFormDialog: upload de carimbo visível apenas para admin_master
- [ ] Aba Inserir: médico vê apenas as opções de inserir carimbo (sem botões de upload/remover)
- [ ] Limpar todos os uploads antigos de assinatura e logo do banco de dados

## SESSÃO ATUAL — Correções Editor de Laudos (Assinatura/Carimbo/Layout)

- [x] Remover assinatura do documento A4 (corpo e impressão)
- [x] Remover nome do usuário do documento A4
- [x] Mover rodapé legal para posição absoluta na parte inferior da folha A4
- [x] Corrigir aba "Inserir" da sidebar: remover "Inserir Assinatura", manter apenas "Logo da Unidade" e "Carimbo do Médico"
- [x] Aba Inserir agora usa a imagem real do carimbo (stamp_url) em vez de gerar via canvas
- [x] Upload de carimbo disponível ao criar médico (não apenas ao editar) — admin_master
- [x] Seção de Assinatura Digital removida do UserFormDialog (não utilizada no documento)
- [x] AdminPage: upload de carimbo e CRM enviados após criação do usuário médico

## CORREÇÃO URGENTE — Template de Impressão da Lista de Exames

- [x] Corrigir handlePrintReport na PacsQueryPage para usar layout correto
- [x] Remover título "Gestão de Laudos Radiológicos" e substituir por logo da unidade
- [x] Remover badge de status "Assinado" do cabeçalho impresso
- [x] Remover data de impressão do cabeçalho
- [x] Remover box de dados do paciente (patient-card) e usar layout simples
- [x] Remover título "LAUDO" antes do corpo
- [x] Substituir rodapé "Desenvolvimento StudioBarra7" pelo rodapé legal LAUDS
- [x] Alinhar layout de impressão com o ReportEditorPage

## MINIO — Repositório Central de Arquivos na VM2

- [ ] Gerar script de instalação do MinIO para VM2 (172.16.3.101)
- [ ] Adaptar server/storage.ts para usar MinIO em vez do S3 da Manus
- [ ] Adicionar variáveis de ambiente MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
- [ ] Criar bucket "lauds" no MinIO com estrutura: unidades/{id}/logo, usuarios/{id}/carimbo
- [ ] Testar upload de carimbo e logo via MinIO

## EDIÇÃO DE LAUDOS ASSINADOS — Retificação e Complemento

- [x] Criar tabela report_versions no banco para histórico de versões
- [x] Implementar procedure reports.revise no backend (salva versão anterior + cria nova)
- [x] Implementar procedure reports.getVersions para buscar histórico
- [x] Botão "Editar" no ReportEditorPage para laudos assinados
- [x] Modal de motivo de retificação (obrigatório, mínimo 5 caracteres)
- [x] Documento read-only quando assinado e não em modo de retificação
- [x] Banner visual indicando laudo assinado/retificado
- [x] Status "revised" para laudos editados após assinatura
- [ ] Botão "Editar" na lista de exames (PacsQueryPage) para laudos assinados
- [ ] Exibir histórico de versões no editor de laudos (aba lateral)

## LAYOUT — Filtro Últimos 7 Dias no Buscador

- [x] Substituir botão "Não Laudados" por filtro "Últimos 7 dias" no buscador de pacientes (PacsQueryPage)
- [x] Filtro deve filtrar por data de realização do exame (StudyDate) nos últimos 7 dias
- [x] Filtro deve ser eficiente e aplicado na query DICOM/resultado

## LAYOUT — Caixa de Templates no Editor de Laudos

- [x] Aumentar largura da caixa de seleção de templates em ~30% (w-64 → w-[340px])
- [x] Adicionar seções por modalidade: Radiografias, Tomografias, Ultrassom, Ressonância
- [x] Cada seção com subgrupos: Tórax, Seios da Face, Abdome, Crânio, Coluna
- [x] Busca funcionando para filtrar templates por nome ou modalidade

## LAYOUT — Árvore Hierárquica de Exames (Organograma)

- [ ] Substituir lista plana de exames por árvore hierárquica visual com linhas de conexão
- [ ] Nível 1: Modalidade (Radiografias, Tomografias, Ultrassom, Ressonância, Outros)
- [ ] Nível 2: Região anatômica (Tórax, Crânio, Abdome, Coluna, etc.)
- [ ] Nível 3: Nome do exame (folha clicável para selecionar)
- [ ] Nós expansíveis/colapsáveis com chevron
- [ ] Linhas de conexão verticais/horizontais estilo organograma
- [ ] Busca filtra e expande automaticamente os nós relevantes
- [x] Aumentar área de exibição da logo no documento em 50%
- [x] Ocultar opção de logo/remover logo na aba Inserir para usuários não-admin-root
- [x] Investigar e corrigir bug do botão Assinar laudo

## IMPRESSÃO DE LAUDOS — Carimbo e Dados do Médico

- [x] Adicionar procedure getByStudyUidWithDoctor que retorna laudo + dados do médico assinante
- [x] Atualizar handlePrintReport (PacsQueryPage) para incluir carimbo/assinatura do médico no rodapé
- [x] Adicionar data de nascimento e sexo do paciente no cabeçalho do laudo impresso (PacsQueryPage)
- [x] Atualizar handlePrint (ReportEditorPage) para incluir carimbo/assinatura do médico no rodapé
- [x] Adicionar badge "RETIFICADO" no rodapé do laudo impresso quando status = revised
- [x] Adicionar status "Revisado" com badge ⚠ na lista de exames (PacsQueryPage)

## BUG CRÍTICO — Botão Assinar não salva no banco

- [x] Diagnosticar por que o botão Assinar não está funcionando (não salva o laudo no banco)
- [x] Garantir que ao assinar, o laudo é criado/atualizado no banco com status "signed"
- [x] Após assinar e voltar à lista, o botão Imprimir deve encontrar o laudo no banco
- [x] Testar fluxo completo: Laudar → Assinar → Voltar → Imprimir pela lista

## MELHORIA VISUAL — Header da PacsQueryPage

- [x] Header mais alto com imagem de fundo médica e gradiente teal escuro
- [x] Linha de acento colorida abaixo do header
- [x] Manter toda a lógica existente intacta

## REDESIGN — Layout de Impressão de Laudos

- [x] Novo layout de impressão: logo à esquerda + dados do paciente à direita (assimétrico)
- [x] Separador horizontal fino entre cabeçalho e corpo
- [x] Título do exame centralizado, negrito, maiúsculas, fonte maior
- [x] Corpo do laudo com fonte limpa sem fundo cinza
- [x] Rodapé legal completo (CNPJ, telefone, site, redes sociais)
- [x] Assinatura do médico centralizada com linha acima
- [x] Aplicar novo layout tanto na PacsQueryPage quanto no ReportEditorPage

## BUG — Migração de Banco (VM1)

- [ ] Coluna `manage_templates` ausente na tabela `user_unit_permissions` na VM1
- [ ] Gerar SQL de migração e aplicar na VM1

## BUG — Schema Drizzle dessincronizado (VM2)

- [ ] Tabela `user_unit_permissions`: banco tem `created_at` (bigint) mas schema define `createdAt`/`updatedAt` (timestamp)
- [ ] Corrigir schema Drizzle para usar `created_at` bigint e adicionar `updatedAt` timestamp no banco da VM2

## BUG — Permissões de Unidade para Usuários

- [ ] Testar e corrigir o fluxo de edição de permissões (view_studies, edit_reports, view_anamnesis, print_reports, manage_templates)
- [ ] Verificar se o erro de `user_unit_permissions` foi resolvido após a migração das colunas createdAt/updatedAt
- [x] Novo layout de impressão de laudos: cabeçalho profissional com logo e dados do paciente, tabela clínica estruturada, tipografia melhorada, rodapé com carimbo/assinatura e dados legais, suporte a impressão otimizada @page CSS
- [x] Unificar layout do editor de laudos (ReportDocument.tsx) com o layout de impressão — WYSIWYG
- [x] Novo layout clássico radiológico: logo topo-esquerdo + linha divisória, título centralizado, grid 2 colunas (PACIENTE/CONVÊNIO/SOLICITANTE/SETOR | IDADE/SEXO/DATA/ATENDIMENTO), corpo do laudo, rodapé médico centralizado com assinatura+carimbo, rodapé institucional com faixa colorida
- [x] Layout institucional completo do laudo: 6 zonas (cabeçalho logo+faixa SVG, título, grid 2 colunas, corpo, assinatura, rodapé SVG), paleta azul/turquesa, tipografia serifada, WYSIWYG
- [x] Redesenho do layout do laudo: cabeçalho com box de logo + dados mínimos do paciente (nome, data realização, data nascimento), área central com seletor de exame + editor, rodapé inalterado

## Auditoria de Upload de Imagens (04/04/2026)

- [x] [CRÍTICO] Corrigir signatureFile: undefined → signatureFile: signatureFile ?? undefined em UserFormDialog.tsx:297
- [x] [CRÍTICO] Passar _signatureFile no onSave para novos usuários em UserFormDialog.tsx
- [x] [CRÍTICO] Tratar upload de assinatura pós-criação em AdminPage.tsx
- [x] [CRÍTICO] Passar _logoFile no onSave de UnitFormDialog.tsx
- [x] [CRÍTICO] Declarar updateLogo e tratar upload de logo pós-criação/edição em AdminPage.tsx
- [x] [MÉDIO] Corrigir regex base64 nos 3 endpoints de upload em routers.ts (linhas 1702, 1724, 1763)
- [x] [MÉDIO] Adicionar validação de magic bytes server-side em routers.ts
- [x] [MÉDIO] Adicionar limite de tamanho server-side (2 MB) em routers.ts
- [x] [ESTRUTURAL] Documentar volume persistente para ./uploads/ em DEPLOY.md

## Auditoria de Retificação de Laudos (04/04/2026)

- [x] [B1 CRÍTICO] Bloquear laudos assinados/revisados no endpoint reports.update (routers.ts)
- [x] [B2 CRÍTICO] Ocultar botão "Salvar Rascunho" quando laudo está assinado (ReportEditorPage.tsx)
- [x] [B3 MÉDIO] Capturar body do DOM ao abrir o modal de retificação, não ao confirmar (ReportEditorPage.tsx)
- [x] [B4 MÉDIO] Atualizar signedAt e signedBy na mutation reports.revise (routers.ts)
- [x] [TESTES] Adicionar testes de integração cobrindo os 4 cenários de erro (6 testes, todos passando)

## Dossiê de Auditoria — Problemas Residuais e Melhorias (05/04/2026)

- [x] N5 — UNIQUE constraint (study_instance_uid, unit_id) na tabela reports + migration aplicada
- [x] N2 — Remover fallback ao DOM em handleRevise (ReportEditorPage.tsx)
- [x] N1 — Inferir extensão real do arquivo nos 3 endpoints de upload
- [x] N4 — Apagar arquivo antigo do S3 ao re-fazer upload
- [x] N3 — Reorganizar ordem de declaração: updateLogo antes de handleSaveUnit
- [x] N6 — SESSION_DURATION via variável de ambiente SESSION_DURATION_HOURS
- [x] M3 — Criar ENV_REFERENCE.md documentado
- [x] M4 — Centralizar constantes em shared/const.ts (PACS_MAX_RESULTS, MAX_UPLOAD_BYTES)
- [x] M1 — Criar testes: upload.test.ts, pacs.query.test.ts, auth.session.test.ts (104 testes)
- [x] M2 — Script de limpeza de arquivos orfãos (scripts/cleanup-orphaned-files.mjs)
## Correção Editor Multi-Seção (05/04/2026)

- [x] Cada exame deve aparecer em página completa e independente com cabeçalho próprio (logo, nome do paciente, data, título do exame)
- [x] Remover separador tracejado entre seções — usar page-break visual (borda de página separada)
- [x] Assinatura/carimbo exibida apenas na última página do laudo multi-exame
- [x] collectBody() concatena HTML de todas as seções com |||SECTION||| para salvar como laudo único

## Restauração ExamPickerModal (05/04/2026)
- [x] Restaurar ExamPickerModal.tsx removido pelo processo de checkpoint
- [x] Restaurar PacsQueryPage.tsx com integração do ExamPickerModal (EditableExamName com modal)
- [x] Restaurar ReportEditorPage.tsx com suporte multi-seção (examNames, sectionBodies, isMultiSection)
- [x] Restaurar schema.ts, db.ts e routers.ts com coluna exam_count na tabela study_metadata
- [x] Confirmar que coluna exam_count já existe no banco (migration 0018 já aplicada)
## Ícone Anatômico na Linha do Exame (05/04/2026)
- [x] Remover emoji ✏️ duplicado (indicador de editado) da linha do exame
- [x] Substituir botão Pencil por ícone anatômico SVG baseado na descrição do exame
- [x] Ícone anatômico sempre visível, ao clicar abre ExamPickerModal

## Módulo Financeiro — Etapa 1 (07/04/2026)

### Schema e banco
- [ ] Adicionar 5 tabelas de billing ao drizzle/schema.ts
- [ ] Gerar migration SQL com pnpm drizzle-kit generate
- [ ] Aplicar migration via webdev_execute_sql

### Backend
- [ ] Criar helpers de billing em server/db.ts
- [ ] Criar server/routers/billing.ts com procedures tRPC
- [ ] Registrar billing router em server/routers.ts

### Frontend
- [ ] Criar BillingAdminPage.tsx (admin_master)
- [ ] Criar BillingUnitPage.tsx (unit_admin)
- [ ] Criar BillingDoctorPage.tsx (médico)
- [ ] Registrar rotas /billing/* em App.tsx
- [ ] Adicionar item "Financeiro" na navegação por perfil

## MÓDULO FINANCEIRO — Etapa 1

- [x] Criar 5 tabelas de billing no schema Drizzle (billing_unit_prices, billing_doctor_prices, billing_monthly_unit, billing_monthly_doctor, billing_report_items)
- [x] Gerar migration 0019 e aplicar no banco da VM2
- [x] Adicionar helpers de billing em server/db.ts (upsertUnitPrice, upsertDoctorPrice, getOrCreateMonthlyUnit, getOrCreateMonthlyDoctor, listBillingItems, listMonthlyUnit, listMonthlyDoctor, listMonthlyDoctorsByUnit, closeMonthlyUnit, recalculateMonthlyUnit, recalculateMonthlyDoctor, createBillingReportItem)
- [x] Criar billing router em server/routers.ts com procedures: setUnitPrice, listUnitPrices, setDoctorPrice, listDoctorPrices, getMonthlyUnit, listMonthlyUnit, closeMonthlyUnit, getMonthlyDoctor, listMonthlyDoctor, listAllUnitsMonthly
- [x] Criar BillingAdminPage.tsx — painel admin_master com KPIs, tabela de unidades, drill-down e configuração de preços
- [x] Criar BillingUnitPage.tsx — painel unit_admin com resumo mensal, laudos por médico, histórico
- [x] Criar BillingDoctorPage.tsx — painel médico com laudos assinados e valores a receber
- [x] Registrar rotas /billing/admin, /billing/unit, /billing/doctor no App.tsx
- [x] Atualizar DashboardLayout com menu de navegação PACS filtrado por role (inclui links de billing)
- [ ] Integrar criação automática de billing_report_item ao assinar laudo no ReportEditorPage
- [ ] Criar testes unitários para os helpers de billing
- [ ] Documentar módulo financeiro no GUIA_VM2_BANCO_MESTRE.md

## MÓDULO FINANCEIRO V2 — Reimplementação Correta (ORIENTACAO_MODULO_FINANCEIRO_PACS_V4.txt)

### ETAPA 1 — Base estrutural
- [x] Remover tabelas antigas de billing do schema (billing_unit_prices, billing_doctor_prices, billing_monthly_unit, billing_monthly_doctor, billing_report_items)
- [x] Remover telas antigas (BillingAdminPage, BillingUnitPage) e renomear BillingDoctorPage
- [x] Adicionar role responsavel_financeiro no enum de roles
- [x] Criar tabela financial_responsibles (PF/PJ, legal_name, trade_name, cpf_cnpj, email, phone, isActive)
- [x] Criar tabela financial_responsible_users (vinculo usuario -> responsavel)
- [x] Criar tabela financial_responsible_units (vinculo unidade -> responsavel com vigência starts_at/ends_at)
- [x] Atualizar shared/permissions.ts com nova role
- [ ] Atualizar UserFormDialog.tsx e AdminPage.tsx com nova role

### ETAPA 2 — Precificação
- [x] Criar tabela billing_system_unit_prices (responsible + unit + price_per_report + vigência)
- [x] Criar tabela billing_doctor_unit_prices (responsible + unit + doctor + price_per_report + vigência)
- [ ] Validar sobreposição de vigência nos helpers
- [ ] Criar telas de configuração de preço no painel admin_master

### ETAPA 3 — Apuração
- [x] Criar tabela billing_report_items (report_id, study_instance_uid, financial_responsible_id, unit_id, doctor_user_id, competence_year/month, pricing_status, system_amount_due, doctor_amount_due)
- [ ] Criar tabela billing_monthly_system_by_unit (consolidado sistema por unidade)
- [x] Criar tabela billing_monthly_doctor_by_unit (consolidado médico por unidade)
- [x] Implementar billing.calculateCompetence (apuração completa por mês/ano)
- [ ] Implementar billing.closeCompetence (com bloqueio se houver pendências)
- [ ] Implementar billing.reopenCompetence (apenas admin_master)

### ETAPA 4 — Visualização
- [x] Criar BillingAdminPage.tsx (visão root: responsáveis, totais, detalhamento por unidade)
- [x] Criar BillingResponsiblePage.tsx (visão pagador: o que deve ao sistema + médicos)
- [x] Criar BillingDoctorPage.tsx (visão médico: o que tem a receber por unidade)
- [ ] Registrar rotas /financeiro/admin, /financeiro/responsavel, /financeiro/medico
- [x] Atualizar AppHeader com link Financeiro por role

### ETAPA 5 — Testes
- [ ] Testes: laudo signed gera item financeiro
- [ ] Testes: laudo revised mantém apenas um item
- [ ] Testes: laudo draft não entra no cálculo
- [ ] Testes: signedBy vence author_user_id para médico financeiro
- [ ] Testes: falta de preço gera pricing_status pendente
- [ ] Testes: competência não fecha com pendências
- [ ] Testes: responsavel_financeiro não vê dados de outro responsável

## CORREÇÕES LÓGICA FINANCEIRA V4 (LOGICA_FINANCEIRA_CORRIGIDA_PACS_V4.txt)

- [x] Corrigir getActiveResponsibleForUnit: starts_at <= data, ends_at IS NULL OU ends_at >= data, orderBy starts_at DESC
- [x] Corrigir getActiveSystemPrice: mesma regra de vigência ativa
- [x] Corrigir getActiveDoctorPrice: mesma regra de vigência ativa
- [x] Adicionar validação de sobreposição em linkUnitToResponsible (fechar vigência anterior automaticamente)
- [x] Adicionar validação de sobreposição em upsertSystemUnitPrice
- [x] Adicionar validação de sobreposição em upsertDoctorUnitPrice
- [x] Proteger calculateCompetence: não recalcular competência fechada
- [x] Proteger recalculateMonthlyConsolidates: não atualizar consolidado fechado
- [x] Corrigir BillingUnitPage: coluna Médicos deve somar todos os doctorSummary da mesma unit_id
- [x] Melhorar retorno do getResponsibleSummary: total_system_overall, total_doctor_overall, total_reports_overall, system_by_unit[], doctor_by_unit[], doctor_by_unit_and_doctor[]

## MÓDULO FINANCEIRO OPERACIONAL V3 (modulo_financeiro_frontend.txt)

### Fase 1 — Schema e Migration
- [x] Criar tabela billing_cycle_configs (unit_id, cycle_day_start, system_cycle_day_start, is_active)
- [x] Criar tabela billing_cycles (unit_id, cycle_type: system|doctor, starts_at, ends_at, status: open|closed)
- [x] Ajustar billing_report_items: adicionar visit_key (patient_name+study_date) para deduplicação por visita
- [x] Adicionar campo received_at e received_by em billing_monthly_doctor_by_unit (marcar recebimento)

### Fase 2 — Backend
- [x] Helper: getOrCreateActiveCycle(unit_id, cycle_type, date) — retorna ciclo ativo ou cria novo
- [x] Helper: createBillingEventForVisit(report_id, unit_id, doctor_user_id, patient_name, study_date) — deduplicação por visita
- [x] Helper: getDoctorFinancialSummary(doctor_user_id) — ciclo atual por unidade + histórico
- [x] Helper: markCycleItemReceived(cycle_id, doctor_user_id, unit_id) — médico sinaliza recebimento
- [x] Procedure: billing.getCycleConfig — configuração de ciclo por unidade
- [x] Procedure: billing.setCycleConfig — root define dia de fechamento por unidade
- [x] Procedure: billing.getDoctorProduction — produção do médico logado
- [x] Procedure: billing.markReceived — médico sinaliza valor recebido
- [x] Procedure: billing.getUnitFinancialInfo — info discreta para seletor de unidades

### Fase 3 — Integração ao fluxo de assinatura
- [x] Em ReportEditorPage: ao assinar laudo, chamar billing.createBillingEvent automaticamente
- [x] Deduplicação: mesmo patient_name + study_date na mesma unidade = 1 evento financeiro

### Fase 4 — BillingDoctorPage redesenhada
- [x] Partir do médico logado (sem seleção manual)
- [x] Cards: Total do Ciclo, Laudos Válidos, Unidades Ativas, Período do Fechamento
- [x] Tabela: por unidade (valor/laudo, qtd laudos, total, status recebimento)
- [x] Extrato detalhado por laudo (paciente, unidade, data, valor, status)
- [x] Histórico de ciclos fechados com status de recebimento
- [x] Botão "Marcar como Recebido" por ciclo/unidade

### Fase 5 — BillingUnitPage redesenhada (responsável)
- [x] Cards: Devo ao Sistema, Devo aos Médicos, Total Geral, Pendências
- [x] Aba Por Unidade: sistema + médicos + laudos + subtotal por médico
- [x] Aba Por Médico: total + unidades + laudos + subtotal por unidade
- [x] Aba Extrato: laudo + unidade + médico + valor sistema + valor médico + data + status
- [x] Histórico de ciclos com status

### Fase 6 — BillingAdminPage redesenhada (governança)
- [x] Configurar dia de fechamento de ciclo por unidade (sistema e médico podem ser diferentes)
- [x] Painel de pendências: unidades sem preço, responsáveis sem vínculo, laudos sem preço
- [x] Recalcular competência por unidade
- [x] Fechar ciclo manualmente

### Fase 7 — Info financeira discreta no PacsQueryPage
- [x] Ao lado de cada unidade no seletor: valor/laudo e saldo parcial do médico no ciclo atual
- [x] Bloco contextual ao entrar na unidade: valor/laudo, laudos no ciclo, acumulado, período

### Controle de acesso
- [x] Módulo financeiro visível apenas para: medico, responsavel_financeiro, admin_master, unit_admin
- [x] Ocultar para: operador, viewer

## CORREÇÕES TELA DE ADMINISTRAÇÃO

- [x] Adicionar responsavel_financeiro ao seletor de Perfil no formulário de usuário
- [x] Corrigir coluna Unidade na lista de usuários para mostrar unidades vinculadas (linked_units via permissões)
- [x] Verificar botão > de permissões por unidade no formulário de edição (já funciona corretamente)

## MÓDULO FINANCEIRO EMBUTIDO V4

### Backend
- [ ] Item financeiro nasce apenas em status signed/revised (não em rascunho/em edição)
- [ ] Retificação não duplica item financeiro — se report_id já existe, atualiza sem criar novo
- [ ] createVisitEvent protegido: idempotente por report_id
- [ ] Ciclo de 30 dias: começa no dia configurado (ex: dia 20), fecha no dia 19 do mês seguinte
- [ ] Procedure getDoctorFinancialSummary: retorna resumo, por unidade, extrato, fechamentos do médico logado
- [ ] Procedure getResponsibleDebtSummary: retorna total ao sistema, total aos médicos, por unidade, por médico, extrato
- [ ] Procedure getAdminGovernance: responsáveis, preços, pendências, ciclos abertos/fechados

### Médico — Financeiro Embutido
- [ ] Seletor de unidades: valor por laudo + saldo parcial do ciclo atual (discreto, abaixo do nome)
- [ ] Banner na fila de trabalho: laudos válidos do ciclo, saldo da unidade atual, saldo total
- [x] BillingDoctorPage V4: Bloco 1 Resumo, Bloco 2 Ganhos por Unidade, Bloco 3 Extrato, Bloco 4 Fechamentos
- [x] Médico logado é identificado pelo login — sem seleção manual

### Responsável — Painel de Dívida
- [x] BillingUnitPage V4: começa pelos valores (devo ao sistema, devo aos médicos, total)
- [x] Visão por unidade e por médico
- [x] Extrato detalhado por laudo
- [x] Fechamento por ciclo com botão gerar extrato

### Root/Admin — Retaguarda
- [x] BillingAdminPage V4: cadastro de responsáveis, vínculo unidades, configuração preços, auditoria, fechar ciclos
- [x] Configurar dia de fechamento por unidade (sistema e médico podem ser diferentes)

## BUG — Logout / Troca de Usuário

- [x] Investigar por que o logout não redireciona para a tela de login
- [x] Corrigir fluxo: após logout, limpar sessão/cookie e redirecionar para /login
- [x] Garantir que ao acessar / sem sessão válida, o usuário seja redirecionado para /login

## BUG — ProtectedRoute setState durante render

- [x] Corrigir ProtectedRoute no App.tsx: mover setLocation para useEffect (proibido chamar setState durante render)

## Módulo Financeiro — Correções do Diagnóstico (2026-04-08)

- [x] Alterar deduplicação de billing_visit_events: de visit_key (paciente+data+unidade+médico) para report_id (cada laudo = um evento)
- [ ] Remover catch silencioso do billing em ReportEditorPage: mostrar toast de aviso se createVisitEvent falhar
- [ ] Invalidar queries financeiras após assinar laudo (getUnitFinancialInfo, getDoctorProduction, getDoctorCycleEvents)
- [ ] Reduzir staleTime do banner financeiro de 60s para 0 no PacsQueryPage
- [ ] Corrigir getDoctorUnitFinancialInfo no db.ts: retornar preço ativo mesmo sem ciclo aberto
- [x] Enriquecer retorno de createVisitEvent com doctorAmountDue para toast informativo
- [ ] Melhorar toast pós-assinatura: mostrar valor gerado ("Laudo assinado. +R$ 30,00 adicionados ao saldo")

## BUG — Desaparecimento Silencioso do Banner Financeiro

- [x] FinancialBanner: adicionar estado loading (skeleton)
- [x] FinancialBanner: adicionar estado de erro ("Não foi possível carregar o resumo financeiro")
- [x] FinancialBanner: adicionar estado sem-unidade ("Selecione uma unidade para visualizar seu saldo")
- [x] FinancialBanner: adicionar estado sem-configuração ("Esta unidade ainda não possui preço configurado")
- [x] FinancialBanner: nunca retornar null silenciosamente — sempre mostrar estrutura mínima
- [x] Menu lateral: manter "Meu Financeiro" visível para role medico mesmo sem effectiveUnitId
- [x] Botão de acesso rápido ao financeiro: mesma lógica do menu — não sumir silenciosamente
- [x] Procedure getUnitFinancialInfo: retornar status explícito (no_unit, no_config, ok) em vez de null
- [x] Corrigir conflito modelo antigo (unit_id) vs modelo novo (permissões multiunidade)

## Melhoria — Vínculo Médico-Unidade na Tela de Edição

- [ ] Adicionar aba "Médicos" na tela de edição de unidades (AdminPage) com listagem e vínculo de médicos
- [ ] A aba deve listar todos os usuários com role=medico e permitir vincular/desvincular da unidade via user_unit_permissions

## ABA MÉDICOS NA EDIÇÃO DE UNIDADES

- [x] Criar procedures tRPC: units.listDoctors, units.listAllDoctors, units.addDoctor, units.removeDoctor
- [x] Criar componente UnitDoctorsTab.tsx (lista médicos vinculados, adicionar/remover)
- [x] Integrar UnitDoctorsTab no UnitFormDialog com abas Dados / Médicos
- [x] Aba Médicos só aparece ao editar unidade existente (não ao criar nova)
- [x] Zero erros TypeScript, 104 testes passando

## BUG: Erro "Não foi possível carregar o resumo financeiro"

- [x] Diagnosticar causa raiz: VM2 tem coluna `total_visits`, schema Drizzle usa `total_reports` — SELECT explícito do Drizzle falha com "Unknown column"
- [x] Corrigir getDoctorUnitFinancialInfo: usar SELECT com colunas explícitas (sem total_reports/total_visits)
- [x] Adicionar try/catch resiliente: retorna null silenciosamente em vez de propagar erro para o frontend
- [x] Frontend exibe "sem configuração financeira" em vez de mensagem de erro vermelha
- [ ] Migrar VM2: renomear total_visits → total_reports (ver scripts/VM2_MIGRATION_2026_04_09.md)

## BUG: Médico não vê estudos de múltiplas unidades

- [x] Corrigir lógica de consulta de estudos para médico vinculado a múltiplas unidades via user_unit_permissions
- [x] Unificar as duas formas de vínculo (painel de usuário e aba Médicos da unidade) para usar a mesma tabela

## PLANO FINANCEIRO — Reorganização do Módulo (ver docs/PLANO_FINANCEIRO.md)

- [x] PASSO 1: Definir modelo financeiro oficial e fonte de verdade (docs/PLANO_FINANCEIRO.md)
- [x] PASSO 3: Desacoplar preço de ciclo — banner mostra preço mesmo sem ciclo aberto
- [x] PASSO 5: Fortalecer feedback do front — estados explícitos em componentes financeiros
- [x] PASSO 4: Unificar multi-unidade — eliminar dependências de unit_id legado
- [x] PASSO 6: Fechar fluxo operacional do médico — feedback explícito após assinatura
- [x] PASSO 7: Separar camadas médico/responsável/admin
- [ ] PASSO 2: Renomear billing_visit_events → billing_report_events (baixa prioridade)
- [ ] PASSO 8: Revisão de fonte de verdade (baixa prioridade)

## TELA DE CONFIGURAÇÃO DE PREÇOS POR MÉDICO

- [ ] Procedures tRPC: getDoctorPrices, setDoctorPrice, endDoctorPrice
- [ ] Componente DoctorPriceManager na BillingAdminPage
- [ ] Integração com seletor de unidade e lista de médicos vinculados

## BUG: Função de laudar não funciona para médicos multi-unidade (2026-04-10)
- [x] Diagnosticar causa raiz: procedures reports.create/update/sign/revise/delete usam ctx.user.unit_id legado que é null para médicos multi-unidade
- [x] Adicionar função resolveEffectiveUnitId no db.ts (prioridade: legado > input.unit_id via permissões > primeira unidade)
- [x] Corrigir reports.create: aceita unit_id no input, resolve via resolveEffectiveUnitId
- [x] Corrigir reports.update: busca laudo sem filtro de unit_id, verifica acesso via getUserUnitPermission
- [x] Corrigir reports.sign: busca laudo sem filtro de unit_id, verifica acesso via getUserUnitPermission
- [x] Corrigir reports.revise: busca laudo sem filtro de unit_id, verifica acesso via getUserUnitPermission
- [x] Corrigir reports.delete: busca laudo sem filtro de unit_id, verifica acesso via getUserUnitPermission
- [x] Frontend ReportEditorPage: passar unit_id ao criar laudo (salvar rascunho e assinar)

## SEGURANÇA — Fase 1 (Imediata)
- [x] F1-1: Criar middleware requireAuth e aplicar nas 9 rotas DICOM sem autenticação
- [x] F1-2: Restringir dicom-cache-clear e dicom-cache-info a admin_master
- [x] F1-3: Instalar sanitize-html no backend e sanitizar body em reports.create e reports.update
- [x] F1-4: Instalar dompurify no frontend e sanitizar innerHTML em ReportDocument.tsx e ReportEditorPage.tsx
- [x] F1-5: Criar helper assertUserInScope e aplicar em updateUser, toggleUserActive e setUserPermissions
- [x] F1-6: Filtrar anamnesis.getByStudyId por unit_id e verificar permissão view_anamnesis
- [x] F1-7: Corrigir CORS do handler OPTIONS do DICOMweb (remover Access-Control-Allow-Origin: *)
- [x] F1-8: Remover IP interno da resposta de erro do DICOMweb proxy

## SEGURANÇA — Fase 2 (Consistência)
- [ ] F2-1: Corrigir getOrthancUrl para resolver pela unidade do usuário autenticado
- [ ] F2-2: Padronizar expiration_date como string YYYY-MM-DD em todo o stack
- [ ] F2-3: Adicionar verificação de expiração de conta no AuthService.validateCredentials
- [ ] F2-4: Remover credenciais hardcoded do minio.ts e adicionar validação no boot
- [ ] F2-5: Filtrar listAuditLog e listUsersWithPermissions por unidade para unit_admin
- [ ] F2-6: Verificar e aplicar manage_templates nas procedures de templates
- [ ] F2-7: Verificar escopo em setUserPermissions (item 4d — pendente confirmação)

## SEGURANÇA — Fase 3 (Sustentação)
- [ ] F3-1: Refatorar routers.ts (2532 linhas) em módulos por domínio (server/routers/)
- [ ] F3-2: Criar suíte de testes de autorização negativa (cross-unit, XSS, endpoints sem auth)
- [ ] F3-3: Reduzir uso de any progressivamente ao refatorar módulos
- [ ] F3-4: Padronizar tratamento de erro e remover detalhes internos das respostas

## SEGURANÇA — Fase 2 (Consistência — iniciada)
- [x] F2-1: Corrigir getOrthancUrl para resolver pela unidade do usuário autenticado (evitar cross-unidade no proxy DICOMweb)
- [x] F2-2: Padronizar expiration_date como string YYYY-MM-DD e verificar expiração no fluxo de login
- [x] F2-3: Mover credenciais do minio.ts para variáveis de ambiente (sem hardcode)

## SEGURANÇA — Fase 3 (Qualidade)
- [x] F3-1: Documentar variáveis MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY no .env.example
- [x] F3-2: Adicionar seção MinIO no README de setup da VM1
- [x] F3-3: Implementar middleware de audit_log para eventos sensíveis (login, sign, anamnese, permissões)
- [x] F3-4: Padronizar tratamento de erros nas procedures críticas (remover stack traces de respostas HTTP 500)

## SEGURANÇA — Itens Pendentes (identificados na revisão completa)
- [x] F2-5: Filtrar listUsersWithPermissions e listAuditLog por unidade para unit_admin
- [x] F2-6: Verificar permissão manage_templates em templates.create, update e delete
- [x] F3-2: Criar testes de autorização negativa (cross-unit, XSS, endpoints sem auth, expiração)
- [x] F3-1: Refatorar routers.ts (2754 linhas) em 13 módulos por domínio (server/routers/)
- [x] 4a: Corrigir admin.listUsers para suporte multi-unidade (unit_admin sem unit_id legado)
- [x] F2-7: Verificar escopo em setUserPermissions — confirmado implementado na F1-5
