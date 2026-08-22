# PACS Portal - TODO List

## INTEGRAÇÃO SELETIVA DO CÓDIGO MODIFICADO
- [x] Item 1 — Integrar melhorias visuais e mobile da página de login preservando a autenticação original
- [x] Correção do breakpoint responsivo do login para tablets e janelas estreitas
- [x] Item 2 — Integrar listagem PACS mobile organizada e responsiva preservando a lógica de backend

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
- [x] Criar componente ProtectedRoute com verificação de perfil
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

## CORREÇÕES FINANCEIRO — 2026-04-11
- [x] Corrigir tela Preços Médicos: listar médicos vinculados à unidade e permitir configurar valor por laudo por médico (com doctor_user_id)
- [x] Substituir todas as ocorrências de "visita/visitas" por "laudo/laudos" em todo o frontend
- [ ] Corrigir valor R$ 0,00 no extrato individual dos laudos na tela Meu Financeiro do médico
- [ ] Corrigir aviso "sem configuração de preço" persistindo na Policlínica Ribamar mesmo com preço configurado

## MÓDULO FINANCEIRO — Páginas de Detalhe e Navegação

- [x] Criar FinanceUnidadeDetalhe.tsx (/financeiro/unidades/:id) com abas Médicos/Preços/Ciclos
- [x] Criar FinanceResponsavelDetalhe.tsx (/financeiro/responsaveis/:id) com abas Resumo/Unidades/Médicos/Usuários
- [x] Adicionar link de navegação na lista de Unidades (botão ExternalLink → detalhe)
- [x] Confirmar link de navegação na lista de Responsáveis (botão Detalhe já existia)
- [x] Registrar rotas /financeiro/unidades/:id e /financeiro/responsaveis/:id no App.tsx
- [x] Adicionar procedure getUnitDetail ao billing router (dados consolidados por unidade)
- [x] Build de produção verificado sem erros TypeScript

## BUG — useAuth fora do AuthProvider em /financeiro/meu-financeiro
- [x] Corrigir erro "useAuth must be used within an AuthProvider" na página FinanceiroPessoal/MeuFinanceiro

## BUG — TypeError: d.reduce is not a function em /financeiro/meu-financeiro
- [x] Corrigir erro de reduce em array não inicializado no FinanceMeuFinanceiro (getDoctorProduction retorna objeto, não array)

## MÓDULO FINANCEIRO — Relatório e Reset por Médico (painel root)
- [x] Procedure resetDoctorBilling: apaga eventos de billing e ciclos de um médico específico (admin_master only)
- [x] Procedure getDoctorAuditReport: retorna todos os laudos de um médico com paciente, unidade, data, valor, status
- [x] Aba Auditoria em FinanceMedicoDetalhe.tsx: relatório completo de laudos por médico + botão "Resetar dados financeiros"
- [x] Aba Auditoria acessível diretamente na página de detalhe do médico (sem página separada)

## REFATORAÇÃO — Evento financeiro atômico no backend
- [x] Integrar createBillingVisitEvent dentro do procedure signReport no backend (transação atômica)
- [x] Ajustar retorno do signReport para incluir doctor_amount_due (para o toast do frontend)
- [x] Remover chamada de createVisitEvent do frontend (ReportEditorPage)
- [x] Verificar TypeScript e build após a refatoração

## FASE 4 — Integração financeira ao cadastro admin do médico
- [ ] Adicionar aba "Unidades Vinculadas" ao cadastro admin do médico com gestão de vínculos
- [ ] Adicionar aba "Preços por Unidade" ao cadastro admin do médico com edição inline de preços
- [ ] Verificar TypeScript, build e fazer commit/push

## FASE 5 — Responsável Financeiro Padrão Automático
- [x] Criar helper getOrCreateDefaultResponsibleForUnit: busca responsável ativo ou cria "Sem Responsável" automaticamente
- [x] Atualizar setDoctorPriceDirect para usar o novo helper (sem erro 400 quando unidade não tem responsável)
- [x] Ajustar frontend para exibir "(sem responsável)" com aviso visual quando responsável for o padrão
- [ ] Commit e push para GitHub

## FASE 6 — Correções da análise técnica (erros_restantes_nova_versao_financeiro.txt)

- [x] P1A: Cadastro de médico — permitir configurar unidades e valores já na criação (não exigir reabrir)
- [x] P1B: Aba Médicos da unidade — tabela financeira com preço editável diretamente na linha (colunas: Médico, Status, Valor/laudo, Vigência, Editar, Remover)
- [x] P1C: Meu Financeiro — separar Saldo Operacional (ciclo atual) de Fechamentos Oficiais em seções visuais distintas
- [x] P1D: Preço por laudo — exibir sempre o preço configurado vigente, não média derivada do ciclo
- [x] P2: Integridade do evento financeiro — assinatura usa só report.unit_id, report.signedBy, report.signedAt como fonte de verdade; log de falhas financeiras
- [x] P3: Navegação — unificar /financeiro/*, redirecionar /billing/*, destino correto por perfil

## REESTRUTURAÇÃO INTUITIVA — Especificação 13/04/2026

### Fase 1 — Banco de dados (novas tabelas)
- [ ] Criar tabela unit_doctor_scales (escala semanal médico/unidade)
- [ ] Criar tabela unit_doctor_compensation_rules (remuneração médica por unidade)
- [ ] Criar tabela contract_revenues (receita do contrato do responsável)
- [ ] Criar tabela contract_custom_expenses (gastos personalizados do responsável)
- [ ] Adicionar campos status_completude na tabela units (técnico, financeiro, operacional)
- [ ] Gerar e aplicar migration SQL

### Fase 2 — Backend (novos procedures)
- [ ] units.getDetail — retorna unidade com todas as relações (responsável, médicos, equipe, preço, ciclo, escala)
- [ ] units.saveOrthancConnection — salva/atualiza dados de conexão Orthanc da unidade
- [ ] units.testOrthancConnection — testa conexão com Orthanc e retorna status
- [ ] units.linkResponsible — vincula responsável existente à unidade com vigência
- [ ] units.unlinkResponsible — encerra vínculo de responsável
- [ ] units.linkTeamMember — vincula operador/viewer/unit_admin à unidade
- [ ] units.unlinkTeamMember — desvincula membro da equipe
- [ ] units.setDoctorScale — define escala semanal de um médico na unidade
- [ ] units.setDoctorCompensationRule — define remuneração do médico na unidade
- [ ] finance.createContractRevenue — cria receita do contrato
- [ ] finance.updateContractRevenue — atualiza receita
- [ ] finance.deleteContractRevenue — remove receita
- [ ] finance.createCustomExpense — cria gasto personalizado
- [ ] finance.updateCustomExpense — atualiza gasto
- [ ] finance.deleteCustomExpense — remove gasto
- [ ] finance.getResponsibleEconomicDashboard — dashboard econômico completo do responsável

### Fase 3 — Frontend: Cadastro de Unidade (7 abas)
- [ ] Aba 1 — Dados Gerais: nome, nome fantasia, tipo, status, endereço, telefone, email, observações
- [ ] Aba 2 — Conexão Orthanc/PACS: host, porta, AETitle, URL API, auth, botão testar conexão
- [ ] Aba 3 — Responsável Financeiro: vincular existente ou criar novo, vigência, histórico
- [ ] Aba 4 — Médicos: vincular/criar médico, status, vigência, tabela de médicos vinculados
- [ ] Aba 5 — Equipe: operadores, visualizadores, unit_admins — vincular/criar por papel
- [ ] Aba 6 — Preço do Sistema: valor por laudo, vigência, histórico de alterações
- [ ] Aba 7 — Operação: ciclo financeiro, escala médica semanal, regras de contagem
- [ ] Indicador de completude (técnico/financeiro/operacional) no card da unidade
- [ ] Remover criação de "responsável fantasma" automático

### Fase 4 — Frontend: Cadastros de Usuário
- [ ] Médico: aba Unidades Vinculadas com seleção múltipla e status de vínculo
- [ ] Operador: aba Unidades Vinculadas
- [ ] Visualizador: aba Unidades Vinculadas
- [ ] unit_admin: aba Unidades Vinculadas

### Fase 5 — Frontend: Ambiente do Administrador de Unidade
- [ ] Seção Remuneração: tipo (por laudo/paciente/plantão), valor, vigência
- [ ] Seção Ciclo Financeiro: data inicial, dia de fechamento, periodicidade
- [ ] Seção Escala Médica: médico, dias da semana, horário, status
- [ ] Seção Regras de Contagem: por paciente/laudo/estudo, exceções

### Fase 6 — Frontend: Ambiente do Responsável Financeiro
- [ ] Seção Receita do Contrato: valor, periodicidade, vigência, CRUD
- [ ] Seção Gastos com Médicos: total em tempo real, por unidade, por médico, por ciclo
- [ ] Seção Gastos com Sistema: valor devido, por unidade, por período
- [ ] Seção Gastos Personalizados: categorias livres (secretária, internet, aluguel...), CRUD
- [ ] Seção Resultado Econômico: receita - custos = saldo operacional, margem estimada
- [ ] UnitFormDialog: remover aba Conexão, mover botão Testar Conexão para aba Dados ao lado dos campos DICOM
- [ ] UnitFormDialog: aba Médicos deve mostrar claramente o preço por laudo do médico com edição inline
- [ ] SEGURANÇA CRÍTICA: setDoctorPrice, setDoctorPriceDirect, setSystemPrice — bloquear no backend para apenas admin_master e unit_admin

## SEGURANÇA DE PREÇOS — Proteção Frontend (Sessão atual)

- [x] Verificar que backend protege setDoctorPrice/setSystemPrice com role !== 'admin_master'
- [x] Confirmar que DashboardLayout filtra menu por role (médico não vê /admin nem /financeiro admin)
- [x] Adicionar verificação de role no ProtectedRoute do App.tsx (allowedRoles prop)
- [x] Proteger rota /admin: apenas admin_master
- [x] Proteger rota /financeiro/admin: apenas admin_master
- [x] Proteger rota /financeiro/meu-financeiro: apenas medico
- [x] Proteger rotas /financeiro/medicos, /unidades, /responsaveis: admin_master, unit_admin, responsavel_financeiro
- [x] Confirmar que UserFormDialog oculta aba Valores para não-admin_master (isMedicoEditing/isMedicoCreating)
- [x] Confirmar que UnitFormDialog e UnitDoctorsTab só são acessíveis via /admin (protegido)
- [x] 135 testes passando, TypeScript limpo

## SLA DE LAUDO — Contador de Prazo a partir da Anamnese

### FASE 1 — Modelagem de dados
- [x] Criar tabela unit_report_sla_configs no schema Drizzle
- [x] Criar tabela report_readiness no schema Drizzle
- [x] Gerar e aplicar migration SQL (0023_sla_readiness.sql)

### FASE 2 — Backend
- [x] Procedure unit.setReportSla (admin_master, unit_admin)
- [x] Procedure unit.getReportSla
- [x] Integrar save de anamnese com avaliação de readiness (apenas primeiro start)
- [x] Procedure readiness.getByStudy
- [x] Procedure readiness.getBatchStatus (batch por UIDs)
- [x] Procedure readiness.invalidate (admin_master)

### FASE 3 — Frontend: UnitFormDialog aba SLA
- [x] Adicionar aba "SLA do Laudo" no UnitFormDialog
- [x] Campos: habilitado (toggle), valor (integer), unidade (horas/dias), notas, vigência
- [x] Permissão: só admin_master e unit_admin vêem/editam

### FASE 4 — Frontend: lista de exames e viewer
- [x] Exibir contador/badge de prazo ao lado do botão Anamnese na PacsQueryPage
- [x] Estados visuais: verde (no prazo), amarelo (próximo), vermelho (vencido), cinza (laudado)
- [x] Exibir readiness no DicomViewerPage (início, vencimento, tempo restante)

### FASE 5 — Integração com finalização de laudo
- [x] Ao assinar laudo (signReport), marcar readiness como 'reported' e calcular sla_met
- [x] Registrar reported_at, sla_met, delay_seconds no report_readiness

### FASE 6 — Testes e entrega
- [x] Testes de regressão para readiness (primeiro start, edição não reinicia, signReport fecha SLA)
- [x] Checkpoint e demonstração ao vivo

## AUDITORIA v11 — Correções

### Sprint 1 — Segurança (CRÍTICO/ALTO)
- [ ] C7: IDOR em deleteContractRevenue e deleteCustomExpense (finance.ts)
- [ ] C8: saveOrthancConnection + testOrthancConnection sem verificação de posse (finance.ts)

### Sprint 2 — Dados Críticos
- [ ] C9: getEconomicDashboard — 3 falhas: filtro de data, status de ciclos, periodicidade
- [ ] C1: FinanceShell — unit_admin navega para /financeiro/admin (403)
- [ ] C3: Retificação não atualiza billing_visit_events.report_status_snapshot

### Sprint 3 — Integridade
- [ ] C2: FinanceMeuFinanceiro — unificar para fonte única (Sistema B)
- [ ] C10: unit_doctor_scales — remover constraint única para suportar histórico
- [ ] C12: SLA — ensureReadinessExists para laudos assinados sem anamnese
- [ ] C13: days_of_week — garantir JSON.parse no retorno de listDoctorScales

### Sprint 4 — Limpeza e Débito Técnico
- [ ] C4: Eliminar gambiarra "Sem Responsável" (getOrCreateDefaultResponsibleForUnit)
- [ ] C11: Documentar relação compensation_rules vs billing
- [ ] C14: Documentar precedência de compensation_rules (doctor_user_id null)
- [ ] C5: FK em billing_visit_events para reports (ON DELETE CASCADE)
- [ ] C6: Trigger de responsável único ativo por unidade (SQL para VM2)

## CATÁLOGO DE EXAMES — Reorganização Administrativa

- [x] Remover o acesso ao Catálogo de Exames da navegação principal e concentrá-lo na administração ao lado de Usuários e Unidades
- [x] Reestruturar a tela do Catálogo de Exames para gestão administrativa mais clara de exames, documentos e mapeamentos PACS
- [x] Validar rota, RBAC de admin_master e ausência do atalho no cabeçalho principal

## ANEXOS CLÍNICOS — Restauração do Acesso

- [x] Restaurar o botão de Anexos na listagem de estudos para desktop e mobile
- [x] Preservar a abertura do modal, a prévia e as permissões clínicas já aprovadas
- [x] Validar regressões de interface e RBAC de anexos antes de publicar
- [x] Liberar a visualização de anexos para todos os usuários autenticados, mantendo envio e exclusão apenas pelo médico autor

## PÁGINA PRINCIPAL MÓVEL — Revisão de Interface

- [ ] Revisar cabeçalho, resumo financeiro, filtros de data e cartões de estudo conforme referência enviada pelo usuário
- [ ] Aplicar as alterações móveis aprovadas sem regressão da página principal desktop
- [x] Reestruturar a faixa de resumo financeiro móvel para melhorar a hierarquia visual dos valores e do ciclo
- [x] Substituir o tempo relativo pela quantidade de imagens do estudo nos cartões móveis
- [x] Exibir a quantidade de imagens também ao lado da data na tabela desktop e confirmar a atualização da prévia
- [x] Exibir barra de progresso real do pré-download abaixo das ações do cartão móvel e abrir o visualizador ao concluir
- [x] Exibir barra de progresso real do pré-download na linha da tabela desktop, preservando as ações existentes
- [x] Reproduzir no sandbox e corrigir o fluxo de barra de progresso e abertura automática do visualizador
- [x] Registrar a validação manual aprovada da barra de progresso e preparar a atualização controlada da VM1
- [x] Reduzir a faixa financeira móvel a uma linha com A receber neste ciclo, Laudos assinados e Fechamento do ciclo
- [ ] Atualizar a VM1 do commit 097c508 para 758f5eb e validar a faixa financeira compacta no celular
- [x] Reordenar a faixa para Ciclo, Laudos assinados e Receber neste ciclo, reduzindo-a à altura de uma linha de texto
- [ ] Atualizar a VM1 para o commit 5ca02ea e validar a faixa financeira ultracompacta no celular
- [x] Criar sinalização por estudo de Urgência e Prioridade máxima, acionável por operador e atendente com autoria imutável
- [x] Exibir prioridade abaixo do status do laudo no mobile e desktop, visível ao médico antes de laudar
- [x] Validar isolamento por unidade, autoria da sinalização e bloqueio de alterações por outros usuários
- [x] Aplicar e validar na VM2 a migração 0049 de prioridade clínica antes de atualizar a VM1
- [x] Atualizar a VM1 para o commit 3852302 após a migração aprovada da VM2 e validar prioridade clínica em produção
- [x] Corrigir a ausência dos controles Urgência e Prioridade máxima nas listagens móvel e desktop para os perfis autorizados
- [x] Ajustar a apresentação da sinalização clínica na tabela desktop e versionar a correção no GitHub
- [x] Substituir o painel da coluna Status por colunas compactas e exclusivas de Urgência e Prioridade máxima no desktop
- [x] Remover as colunas de prioridade do desktop e mostrar alerta apenas na linha do estudo quando houver sinalização
- [x] Alinhar o alerta condicional de prioridade ao lado do sexo do paciente em uma única linha no desktop
- [x] Adicionar botão OsiriX ao lado de Horos usando abertura local segura, sem alterar as integrações existentes
- [x] Auditar a duplicidade entre cadastro de usuário e configuração financeira antes de alterar módulos administrativos
- [x] Centralizar preços no módulo Financeiro, remover atalhos duplicados e impor vigência por ciclo no servidor
- [x] Diagnosticar e corrigir o fluxo de abertura do Weasis sem alterar os demais visualizadores
- [x] Diagnosticar o erro de criação de exame canônico no Catálogo de Exames antes de alterar o módulo
- [x] Redesenhar o catálogo para selecionar legenda clínica, documentos e eventos financeiros por estudo
- [x] Implementar precificação por legenda canônica, unidade e médico com vigência por ciclo
- [x] Implementar seleção obrigatória de legenda, documentos independentes e eventos consolidados por estudo

## MÓDULO DE LAUDO — Legendas Bilaterais, Frases e Templates Padrão

- [ ] Criar tabela exam_legends (exam_name, bilateral, modality) no schema Drizzle
- [ ] Aplicar migration SQL da exam_legends no banco
- [ ] Seed de exam_legends com exames bilaterais (ombro, joelho, quadril, mama, etc.)
- [ ] Procedure sla.listExamLegends (público) no backend
- [ ] Seletor bilateral no editor: ao selecionar exame com bilateral=true, mostrar Direito/Esquerdo/Bilateral
- [ ] Seed de frases padrão do sistema (is_global=true): ~5-10 frases por modalidade RX, TC, US, RM
- [ ] FrasesTab: exibir grupo "Padrão do Sistema" (somente leitura, sem excluir) + botão "Salvar como minha"
- [ ] Seed de templates padrão do sistema (isGlobal=true): 1 template por modalidade principal
- [ ] TemplatesTab: exibir seção "Templates do Sistema" (somente leitura) + botão "Usar como base"
- [ ] Corrigir incoerência patientBirthDate/birthDate no sessionStorage do editor

## DIAGNÓSTICO FINANCEIRO — Melhorias implementadas (2025-04)

- [x] Criar função getSystemOwnerLiveByUnit no db.ts (receita por unidade em tempo real)
- [x] Criar procedure billing.getSystemOwnerLiveByUnit no billing.ts (protegido admin_master)
- [x] Criar tela FinanceOwnerOverview.tsx — painel operacional do dono por unidade
- [x] Adicionar rota /financeiro/overview no App.tsx (admin_master only)
- [x] Adicionar item "Receita por Unidade" no menu FinanceShell (adminItems)
- [x] Integrar getDoctorOperationalBalance no FinanceMeuFinanceiro (saldo correto do médico)
- [x] Reorganizar FinanceDashboard.tsx: bloco receita em tempo real + eixo responsável + acesso rápido
- [x] Padronizar terminologia: "Receita do Sistema", "Custo Médico", "Margem Operacional"

## REESTRUTURAÇÃO FINANCEIRA P2/P3/P4 (orientacao_reestruturacao_ambiente_financeiro.txt)

- [x] P2: Migração banco — adicionar paid_status, paid_at, paid_by_user_id, paid_note em billing_cycles
- [x] P2: Backend — procedures closeCycle, markCyclePaid, unmarkCyclePaid, addCycleNote, listSystemReceivables
- [x] P2: Frontend — tela FinanceContasReceber.tsx (Contas a Receber do Sistema)
- [x] P3: Backend — procedure getDoctorStatement com value_per_report_snapshot
- [x] P3: Frontend — melhorar FinanceMeuFinanceiro: extrato agrupado por dias, exportação PDF/planilha
- [x] P4: Backend — procedure getResponsibleDebtByDoctor com signed_days[]
- [x] P4: Frontend — tela FinanceResponsavelDivida.tsx (Dívida do Responsável por Médico)

## REESTRUTURAÇÃO FINANCEIRA P2/P3/P4 — Concluídas 2025-04-15

- [x] Migração banco: campos paid_status, paid_at, paid_by_user_id, paid_note em billing_cycles
- [x] Backend P2: procedures listSystemReceivables, markCyclePaid, unmarkCyclePaid, addCycleNote
- [x] Frontend P2: tela FinanceContasReceber.tsx — Contas a Receber do Sistema
- [x] Backend P3: procedure getDoctorStatement (extrato agrupado por unidade → dias)
- [x] Frontend P3: ExtratoTab no FinanceMeuFinanceiro com agrupamento por unidade/dias e exportação CSV
- [x] Backend P4: procedure getResponsibleDebtByDoctor (dívida por responsável → médico → unidade → dias)
- [x] Frontend P4: tela FinanceResponsavelDivida.tsx — Dívida do Responsável por Médico com exportação CSV

## AUDITORIA v15 — SPRINT 1 (Segurança e bugs críticos)

- [x] C1 — getDoctorStatement: filtrar por unidades do responsável financeiro (SEGURANÇA ALTA)
- [ ] C6 — FinanceDashboard: queries adaptativas por perfil (BUG MÉDIO — 403 silencioso)

## AUDITORIA v15 — SPRINT 2 (Performance)

- [ ] C2 — Eliminar N+1 em getSystemOwnerLiveByUnit (4 queries por unidade → 5 queries fixas)
- [ ] C3 — Eliminar N+1 em listSystemReceivables (2 queries por ciclo → 1 query com JOINs)

## AUDITORIA v15 — SPRINT 3 (Integridade dos dados)

- [ ] C4 — Overlap check em createCycleManual e editCycleDates
- [x] C7 — Validar starts_at < ends_at em editCycleDates e createCycleManual
- [x] C8 — markCyclePaid: exigir que ciclo esteja fechado antes de marcar como pago
- [ ] C12 — revise: atualizar billing_visit_events.report_status_snapshot (PENDENTE: requer migration) = 'revised'

## AUDITORIA v15 — SPRINT 4 (Unificação billing)

- [x] C11 — FinanceMeuFinanceiro: unificar para Sistema B (getDoctorExtract via billing_visit_events)

## AUDITORIA v15 — SPRINT 5 (Limpeza e melhorias)

- [x] C13 — Remover getOrCreateDefaultResponsibleForUnit (código morto)
- [x] C9 — SlaCountdown: intervalo adaptativo (30s para horas, 5min para dias)
- [ ] C10 — SLA: registrar readiness na chegada do exame (studies_cache)
- [x] P5 — FK em billing_visit_events.report_id → reports.id
- [x] P6 — Trigger/constraint: 1 responsável ativo por unidade
- [x] P3 — Reconsiderar constraint única em unit_doctor_scales (impede histórico)

## AUDITORIA v15 — Sprint 1: Segurança e Bugs Críticos

- [x] C1 — getDoctorStatement: filtrar por unidades do responsável financeiro (SEGURANÇA ALTA)
- [x] C6 — FinanceDashboard: queries adaptativas por perfil do usuário (BUG MÉDIO)

## AUDITORIA v15 — Sprint 2: Performance

- [x] C2 — Eliminar N+1 em getSystemOwnerLiveByUnit (5 queries fixas em vez de 4N+1)
- [x] C3 — Eliminar N+1 em listSystemReceivables (JOIN em vez de Promise.all com queries)
- [x] C5 — Paginação em getDoctorStatement e getResponsibleDebtByDoctor

## AUDITORIA v15 — Sprint 3: Integridade de Dados

- [x] C4 — Validar sobreposição de datas em createCycleManual e editCycleDates
- [x] C7 — Validar starts_at < ends_at em editCycleDates e createCycleManual
- [x] C8 — markCyclePaid: exigir que ciclo esteja fechado antes de marcar como pago
- [ ] C12 — revise: atualizar billing_visit_events.report_status_snapshot (PENDENTE: requer migration)

## AUDITORIA v15 — Sprint 4: Unificação do Billing

- [x] C11 — FinanceMeuFinanceiro: unificar para Sistema B (getDoctorExtract via billing_visit_events)

## AUDITORIA v15 — Sprint 5: Limpeza

- [x] C13 — Remover getOrCreateDefaultResponsibleForUnit (código morto)
- [x] C9 — SlaCountdown: intervalo adaptativo (30s para horas, 5min para dias)

## Bug: Cadastro de Usuário não salva unit_id

- [x] BUG: Cadastro de usuário pelo portal não salva unit_id (campo fica NULL no banco) — CORRIGIDO: UserFormDialog.tsx agora deriva unit_id das permissões selecionadas
- [x] BUG: user_unit_permissions não é criado automaticamente ao cadastrar usuário com unidade — CORRIGIDO: setUserUnitPermissions agora sincroniza unit_id na tabela users automaticamente

## Auditoria relatorio_erros_pacs_v4 — Correções

### Sprint Crítico
- [ ] SEC-01 — Cookie maxAge em milissegundos em vez de segundos (~2740 anos de expiração)
- [ ] LOG-01 — reports.delete não verifica status: laudos assinados podem ser apagados por qualquer médico
- [ ] SEC-02 — Dados do usuário gravados no localStorage a cada render (vetor XSS)

### Sprint Alto
- [ ] LOG-02 — IDOR em updateCustomExpense: qualquer usuário pode editar despesas de terceiros
- [ ] LOG-03 — markReceived sem verificar propriedade do ciclo
- [ ] SCH-02 — Migrations duplicadas com mesmo número (0017_* e 0022_*)

### Sprint Médio
- [ ] LOG-04 — createVisitEvent não verifica duplicidade por report_id
- [ ] LOG-05 — getResponsibleDebtByDoctor soma ciclos pagos no grand_total
- [ ] LOG-06 — unit_admin deve ter acesso às telas financeiras da sua unidade
- [ ] PRG-06 — sign/revise/delete usam ctx.user.unit_id legado em vez de resolveEffectiveUnitId
- [ ] SCH-01 — Migration: billing_visit_events ADD COLUMN report_status_snapshot

### Sprint Baixo/Organização
- [ ] PRG-01 — Remover código morto do AuthService (createSession, buildSessionCookie)
- [ ] PRG-02 — openId usa Date.now() com risco de colisão, trocar para crypto.randomUUID()
- [ ] PRG-03 — Consolidar logoUrl e logo_url na tabela units
- [ ] PRG-04 — PASSWORD_NOT_SET sem mensagem clara no handler de login
- [ ] PRG-05 — Imports dinâmicos dentro de procedures (mover para topo do arquivo)

## AUDITORIA v4 — Implementações (Apr 2026)

- [x] LOG-01: Bloquear deleção de laudos assinados/retificados por não-admin_master + audit log com motivo
- [x] LOG-01 (frontend): Modal de exclusão com campo de motivo obrigatório para admin_master
- [x] SEC-02: Remover dados do usuário do localStorage (vetor XSS) em useAuth.ts
- [x] LOG-02: IDOR fix em updateCustomExpense — verificar que expense pertence ao financialResponsibleId
- [x] LOG-03: markReceived — verificar que o ciclo pertence ao médico autenticado (IDOR)
- [x] SCH-02: Renomear migrations manuais duplicadas com prefixo manual_ para evitar conflito com Drizzle
- [x] LOG-04: createBillingVisitEvent já tinha deduplicação por report_key (confirmado, sem mudança)
- [x] LOG-05: getResponsibleDebtByDoctor — filtrar ciclos pagos via JOIN com billing_cycles
- [x] LOG-06: unit_admin já tem acesso às telas financeiras da sua unidade (confirmado, sem mudança)
- [x] PRG-06: Usar report.unit_id como fonte de verdade no audit log de update, revise e delete
- [x] PRG-01: Remover código morto (createSession, buildSessionCookie) do auth.service.ts
- [x] PRG-02: Substituir Date.now() por crypto.randomUUID() na geração de openId
- [x] PRG-05: Converter imports dinâmicos repetitivos para imports estáticos no billing.ts (81→0)
- [x] SEC-03: sameSite já configurado como 'lax' em produção no cookies.ts (confirmado)

## Viewers Externos — RadiAnt, Weasis, OsiriX, Horos

- [x] Endpoint /api/dicom-viewer-launch/:studyUid para gerar URLs de launch sem PACS configurado
- [x] Protocolo radiant://?n=f (abre arquivos DICOM remotos diretamente, sem AE Title)
- [x] Protocolo weasis://?$dicom:get -r (abre arquivos DICOM remotos diretamente)
- [x] Protocolo horos://?methodName=DownloadURL (via ZIP do estudo, macOS gratuito)
- [x] Protocolo osirix://?methodName=DownloadURL (via ZIP do estudo, macOS)
- [x] Botões RadiAnt, Weasis, Horos na toolbar do DicomViewerPage com loading state
- [x] Fallback: botão RadiAnt no painel de erro do viewer

## RadiAnt ZIP Download Flow

- [x] Botão RadiAnt baixa ZIP automaticamente e abre com RadiAnt (2 cliques, sem configuração de PACS)

## Auditoria v4 — Correções Pendentes (Sessão Atual)
- [x] SEC-01/N-01: Substituir maxAge hardcoded por ENV.sessionDurationHours em cookies.ts
- [x] PRG-06: Corrigir hasAccess em sign/revise/delete para usar resolveEffectiveUnitId (médicos multi-unidade)
- [x] PRG-04: Tratar PASSWORD_NOT_SET com mensagem diagnóstica específica em auth.ts
- [x] LOG-06: Adicionar permissões financeiras para unit_admin em shared/permissions.ts e função canAccessFinancial
- [x] SCH-01: Implementar campo report_status_snapshot em billing_visit_events (migration + código)
- [x] PRG-05: Converter todos os imports dinâmicos em reports.ts para estáticos (0 restantes)
- [x] PRG-03: Remover coluna logoUrl duplicada do schema e banco (manter logo_url canônico)
- [x] SCH-02/N-02: Documentar migrations manual_* em MIGRATIONS_README.md com estratégia de integração
- [x] SEC-04: Ocultar orthanc_basic_pass nas queries getAllUnits e getUnitById (não exposto ao frontend)

## Auditoria v3 — Correções Pendentes

- [x] N-01: Adicionar migrations 0023-0028 ao _journal.json
- [x] SCH-02: Mover arquivos manual_* para drizzle/archive/ e atualizar MIGRATIONS_README.md
- [x] N-02: Corrigir race condition em createBillingVisitEvent (INSERT ON DUPLICATE KEY UPDATE)
- [x] SEC-04: Sanitizar getUnitBySlug para omitir orthanc_basic_pass
- [x] N-03: Adicionar middleware loginRateLimiterBatchAware para cobrir requisições batch tRPC

## Débito Técnico — Auditoria Real (Sessão Atual)
- [x] DB-01: Adicionar FK references() em billing_visit_events.report_id para reports (onDelete: cascade)
- [x] PRG-07: Converter 57 imports dinâmicos em db.ts para estáticos (0 restantes)
- [x] TYP-01: Substituir as any por tipos corretos em db.ts e billing.ts (0 restantes)

## Reorganização Aba Usuários — Modelo Hierárquico por Unidade
- [ ] BE: Criar endpoint admin.getUnitAccessTree (agrega users + user_unit_permissions + units por papel)
- [ ] FE: Criar componente UnitUsersTree.tsx
- [ ] FE: Criar componente UnitUsersCard.tsx (accordion por unidade)
- [ ] FE: Criar componente UnitUsersGroup.tsx (grupos por papel)
- [ ] FE: Criar componente UnitUserRow.tsx (linha de usuário com ações)
- [ ] FE: Substituir tabela plana da aba Usuários pelo UnitUsersTree
- [ ] FE: Filtros (busca por unidade, busca por usuário, só ativas, só com médicos, sem resp. financeiro)
- [ ] FE: Ações contextuais (Novo usuário nesta unidade, Vincular existente, Remover vínculo)
- [ ] FE: Abertura contextual do UserFormDialog com unidade pré-selecionada

## Explorer Hierárquico — Aba Usuários (Master-Detail)
- [ ] EXPLORER-01: Criar endpoint admin.getUserExplorerTree com dados agrupados por unidade/grupo
- [ ] EXPLORER-02: Criar componentes UserExplorerLayout, UserTreeSidebar, UserTreeNode
- [ ] EXPLORER-03: Criar painéis UnitSummaryPanel, RoleGroupPanel, UserDetailPanel
- [ ] EXPLORER-04: Integrar ao AdminPage substituindo UnitUsersTree pelo Explorer

## Vínculo de Usuário Existente (orientacao_vincular_usuario_existente_unidade.txt)
- [x] LINK-01: Criar endpoint admin.searchAssignableUsers (busca por nome/username/email com filtros)
- [x] LINK-02: Criar mutation admin.linkExistingUserToUnitGroup (vínculo semântico com permissões por grupo)
- [x] LINK-03: Criar componente LinkExistingUserDialog (modal de busca, seleção e confirmação)
- [x] LINK-04: Atualizar RoleGroupPanel com dois botões distintos (Vincular existente / Criar novo)
- [x] LINK-05: Atualizar UserExplorerLayout com onRefresh passado ao RoleGroupPanel
- [ ] LINK-06: Atualizar AdminPage com estado isLinkExistingUserOpen e linkContext
- [ ] LINK-07: Pré-preencher UserFormDialog com unidade e grupo ao criar novo usuário no contexto

## CORREÇÃO group_key — Classificação por Unidade no Explorer

- [x] GROUP-KEY-01: Adicionar coluna group_key na tabela user_unit_permissions (schema + migração SQL)
- [x] GROUP-KEY-02: Atualizar linkExistingUserToUnitGroup para salvar group_key no insert/update
- [x] GROUP-KEY-03: Atualizar getUnitAccessTree para classificar usuários por group_key (específico por unidade) com fallback para role global
- [x] GROUP-KEY-04: Migrar registros existentes (preencher group_key baseado no role global dos usuários)
- [x] GROUP-KEY-05: Testar fluxo completo: remover responsável financeiro e vincular Admin Master como Resp. Financeiro — árvore e painel atualizados corretamente

## MÓDULO FINANCEIRO — Reformulação Completa

### Fase 1 — Banco de dados
- [ ] FIN-DB-01: Criar tabela unit_exam_prices no schema Drizzle e aplicar migração no sandbox
- [ ] FIN-DB-02: Adicionar coluna patient_price em billing_visit_events e aplicar migração no sandbox

### Fase 2 — Back-end
- [ ] FIN-BE-01: CRUD de unit_exam_prices (list/create/update/delete) — acesso: responsavel_financeiro e admin_master
- [ ] FIN-BE-02: Lógica de patient_price automático na assinatura do laudo (busca por modalidade em unit_exam_prices)
- [ ] FIN-BE-03: Endpoint de auditoria de laudos por unidade/período com patient_price e status configurado/não configurado
- [ ] FIN-BE-04: Endpoint de resumo financeiro da unidade: total sistema, total médicos individual, total médicos somado, total receita pacientes, lucro

### Fase 3 — Front-end: Meu Financeiro (médico)
- [x] FIN-FE-01: Reformular FinanceMeuFinanceiro seguindo layout MockMyFinance
- [ ] FIN-FE-02: Criar rota /financeiro/meu-financeiro/unidades/:id
- [ ] FIN-FE-03: Criar página FinanceMeuFinanceiroUnidade seguindo layout MockDoctorUnitDetail

### Fase 4 — Front-end: Detalhe de Unidade (admin)
- [ ] FIN-FE-04: Reformular FinanceUnidadeDetalhe seguindo layout MockUnitDetail com KPIs reais
- [ ] FIN-FE-05: Seção de preços por laudo com botão Alterar
- [ ] FIN-FE-06: Tabela de médicos vinculados com laudos, total a receber e botão Detalhar
- [ ] FIN-FE-07: Bloco de alerta de ciclo pendente com botão Fechar ciclo

### Fase 5 — Front-end: Auditoria e Preços de Exames (admin financeiro)
- [ ] FIN-FE-08: Criar página de gestão de preços de exames por unidade (CRUD de unit_exam_prices)
- [ ] FIN-FE-09: Criar ambiente de auditoria de laudos com patient_price editável e indicador "Não configurado"
- [ ] FIN-FE-10: Adicionar itens de navegação no FinanceShell para as novas páginas

## Auditoria V12 — Permissões Granulares por Unidade

- [x] V12-1: Corrigir resolveUnitFilter para unir users.unit_id + user_unit_permissions
- [x] V12-2: Corrigir reports.ts create — usar assertUnitPermission com fallback legado para edit_reports
- [x] V12-3: Corrigir pacs.ts startViewer — aceitar unit_id de qualquer usuário com permissão view_studies
- [x] V12-4: Corrigir pacs.ts getViewerUrl — aceitar unit_id no input e validar view_studies
- [x] V12-5: Corrigir templates.ts create — aceitar unit_id no input para usuários multiunidade
- [x] V12-6: Corrigir frontend PacsQueryPage — usar myPermissions por unidade para canViewer, canLaudo, canCID, canPrint
- [x] V12-7: Condicionar botão Imprimir a print_reports da unidade selecionada
- [x] V12-8: Condicionar botão Anamnese a edit_anamnesis da unidade selecionada

## Auditoria V13 — Permissões (25/04/2026)
- [x] V13-P1: resolveUnitFilter prioriza user_unit_permissions; fallback legado apenas quando sem permissões granulares
- [x] V13-P1: setUserUnitPermissions grava unit_id=null para usuários multiunidade (Opção A)
- [x] V13-P3: PacsQueryPage — canViewStudies, canViewAnamnesis, canEditAnamnesis, canEditExamLegend como variáveis separadas
- [x] V13-P3: EditableExamName usa canEditExamLegend (não canCID)
- [x] V13-P3: Botão anamnese usa canViewAnamnesis (ver) e canEditAnamnesis (editar) separadamente
- [x] V13-P4: units.update() valida user_unit_permissions para unit_admin multiunidade
- [x] V13-P5: admin.getUserPermissions() valida se usuário alvo pertence ao escopo do unit_admin

## Auditoria V14 — Permissões (25/04/2026)
- [x] V14-P1: assertUnitPermission fallback mínimo (view_studies+print_reports=true, resto=false)
- [x] V14-P1: resolveEffectiveUnitId prioriza user_unit_permissions; legado só se sem permissões granulares
- [x] V14-P1: units.myPermissions fallback mínimo (alinhado com assertUnitPermission)
- [x] V14-P1: setUserUnitPermissions grava group_key no insert
- [x] V14-P1: reports.create usa canAccessUnit (fonte única, não mais assertUnitPermission)
- [x] V14-P1: studyMetadata.get/getBatch/save aceitam unit_id da tela; save usa canAccessUnit
- [x] V14-P2: addDoctor valida escopo do unit_admin via user_unit_permissions
- [x] V14-P2: listUsers filtra linked_units pelo escopo do unit_admin
- [x] V14-P2: updateUser valida novo unit_id pertence ao escopo do unit_admin
- [x] V14-P2: PacsQueryPage envia effectiveUnitId em studyMetadata.getBatch e save

## Bugs PacsQueryPage — Filtros de Data (01/05/2026)
- [x] BUG-1: ecosystem.config.cjs — adicionar TZ=America/Sao_Paulo no env do PM2
- [x] BUG-2: pacs.ts — adicionar token YESTERDAY + ranges fechados para LAST_7_DAYS e LAST_30_DAYS
- [x] BUG-3: PacsQueryPage — auto-busca ao montar a tela (evitar dados stale do localStorage)
- [x] BUG-4: PacsQueryPage — troca de unidade dispara nova busca automaticamente
- [x] BUG-5: PacsQueryPage — handlePeriodChange usa token YESTERDAY em vez de calcular UTC no frontend
- [x] BUG-6: PacsQueryPage — dead code sanitização de data: length === 8 → length === 10

## Bugs DICOM/PACS 01/05/2026
- [x] BUG-1: pacs.download stub substituído por TRPCError METHOD_NOT_SUPPORTED
- [x] BUG-2: dicom-stream multi-unidade via assertUnitPermission em index.ts
- [x] BUG-3: getViewerUrl sem dependência de orthanc_base_url; hasOrthanc flag adicionada
- [x] BUG-4: shebang dicom_thumbnail.py corrigido para #!/usr/bin/python3.11
- [x] BUG-5: DICOM_GET_TIMEOUT_MS adicionado ao ENV em env.ts
- [x] BUG-6: imports dinâmicos convertidos para estáticos no topo de pacs.ts
- [x] BUG-7: 20 novos testes DICOM em pacs.test.ts (tokens de data, resolução de unidade, hasOrthanc, timeout)

## Bugs de Performance DICOM (01/05/2026)
- [x] BUG-DICOM-1 (crítico): batch de setStack com pendingIdsRef + batchTimerRef (evita O(n²) em TC)
- [x] BUG-DICOM-2 (alto): remover vp.render() de goToSlice (Cornerstone já agenda render internamente)
- [x] BUG-DICOM-3 (médio): substituir setInterval por requestAnimationFrame no cine
- [x] BUG-DICOM-4 (baixo): remover phase das dependências de startStreamingViewer

## Cleanup DicomViewerPage (02/05/2026)
- [x] VIEWER-CLEANUP: cancelAnimationFrame em vez de clearInterval no useEffect de desmontagem
- [x] VIEWER-CLEANUP: batchTimerRef limpo no unmount (evita setState em ref nula)

## Bugs 05/05/2026 — Data/Timezone DICOM
- [x] CORR-1: normalizeDicomStudyDate em orthanc.ts (preserva intervalos DICOM, converte apenas ISO simples)
- [x] CORR-2: TZ America/Fortaleza + APP_TIME_ZONE em ecosystem.config.cjs (evita regressão no horário de verão)
- [x] CORR-3: toDiscom → toDicomDateInTimeZone com Intl.DateTimeFormat explícito em pacs.ts
- [x] ENV_REFERENCE.md atualizado com TZ, APP_TIME_ZONE, DICOM_GET_TIMEOUT_MS
## Editor de Layout de Laudos (07/05/2026)
- [x] LAYOUT-1: Migration 0032_model_layouts — tabela model_layouts no banco
- [x] LAYOUT-2: Migration 0033_add_layout_audit_actions — ações CREATE_LAYOUT, UPDATE_LAYOUT, DELETE_LAYOUT no audit_log
- [x] LAYOUT-3: Migration 0034_reports_add_layout_snapshot — coluna layout_snapshot em reports
- [x] LAYOUT-4: schema.ts atualizado com model_layouts e layout_snapshot
- [x] LAYOUT-5: shared/types.ts — layoutPreferencesSchema, LayoutPreferences, DEFAULT_LAYOUT_PREFERENCES, LayoutSnapshot
- [x] LAYOUT-6: server/routers/layouts.ts — getByUnit, upsert, delete (com sanitização HTML e audit log)
- [x] LAYOUT-7: server/routers.ts — layouts router registrado
- [x] LAYOUT-8: ReportDocument.tsx — atualizado com stampUrl, headerHtml, footerHtml, preferences
- [x] LAYOUT-9: ReportEditorPage.tsx — query trpc.layouts.getByUnit adicionada
- [x] LAYOUT-10: UnitUsersCard.tsx — botão "Layout" adicionado com navigate para /admin/layouts/:unitId
- [x] LAYOUT-11: LayoutEditorPage.tsx — criada com painel de controles + preview A4 (0 erros TypeScript)
- [x] LAYOUT-12: App.tsx — rota /admin/layouts/:unitId registrada para LayoutEditorPage

## Aprimoramentos do Editor de Layout de Laudos (v2)

- [x] Aprimoramento 1 — Temas de cor pré-configurados (5 temas: Hospitalar, Clínica, Elegante, Sóbrio, Quente)
- [x] Aprimoramento 2 — Reordenação de blocos via drag-and-drop (framer-motion Reorder)
- [x] Aprimoramento 3 — Preview tipográfico ao vivo na seção Tipografia
- [x] Aprimoramento 4 — Visualização proporcional de margens (diagrama A4 com handles)
- [x] Aprimoramento 5 — Editor rich text para cabeçalho/rodapé (negrito, itálico, sublinhado, alinhamento, cor, tamanho, toggle HTML)
- [x] Aprimoramento 6 — Undo/Redo com useReducer (até 50 estados, Ctrl+Z / Ctrl+Y)
- [x] Aprimoramento 7 — Indicador dirty "Alterações não salvas" + aviso beforeunload
- [x] Aprimoramento 8 — Export/Import JSON do layout completo (inclui blockOrder)
- [x] Aprimoramento 9 — Modo comparação "Editado vs Salvo" no preview

## Aprimoramentos do Editor de Layout de Laudos (v2)

- [x] Aprimoramento 1 - Temas de cor pre-configurados (5 temas: Hospitalar, Clinica, Elegante, Sobrio, Quente)
- [x] Aprimoramento 2 - Reordenacao de blocos via drag-and-drop (framer-motion Reorder)
- [x] Aprimoramento 3 - Preview tipografico ao vivo na secao Tipografia
- [x] Aprimoramento 4 - Visualizacao proporcional de margens (diagrama A4)
- [x] Aprimoramento 5 - Editor rich text para cabecalho/rodape (negrito, italico, sublinhado, alinhamento, cor, tamanho, toggle HTML)
- [x] Aprimoramento 6 - Undo/Redo com useReducer (ate 50 estados, Ctrl+Z / Ctrl+Y)
- [x] Aprimoramento 7 - Indicador dirty Alteracoes nao salvas + aviso beforeunload
- [x] Aprimoramento 8 - Export/Import JSON do layout completo (inclui blockOrder)
- [x] Aprimoramento 9 - Modo comparacao Editado vs Salvo no preview

## Consolidação do Módulo Financeiro (12/05/2026)
- [x] FIN-1: Criar aba "Responsáveis Financeiros" no AdminPage com CRUD completo (criar, vincular unidade, vincular usuário)
- [x] FIN-2: Adicionar procedure billing.unlinkUnit ao billingRouter (encerrar vigência de unidade)
- [x] FIN-3: Adicionar procedure billing.listAvailableUsers ao billingRouter (usuários para vincular como responsável)
- [ ] FIN-4: Limpar App.tsx — remover rotas finance/* e finance2/* e billing/*, manter apenas /financeiro/*
- [ ] FIN-5: Criar novo FinanceShell.tsx com entrada por role (médico → meu-financeiro, responsavel → responsavel, admin → admin)
- [x] FIN-6: Construir tela /financeiro/meu-financeiro (médico) — extrato por unidade usando financeSimple.myFinanceiro
- [x] FIN-7: Construir tela /financeiro/responsavel (responsavel_financeiro) — unidades vinculadas, médicos, dívida ao sistema
- [ ] FIN-8: Construir tela /financeiro/admin (admin_master) — visão hierárquica de todos os responsáveis → unidades
- [x] FIN-9: Atualizar botão Financeiro no PacsQueryPage para apontar para /financeiro (com redirect por role)
- [ ] FIN-10: Garantir que markDoctorPaid e markSystemPaid são independentes
- [ ] FIN-11: Testar os 3 fluxos e salvar checkpoint

## Correções Módulo Financeiro — Eventos Zeros (12/05/2026)
- [ ] FIN-C1: reports.ts — audit log BILLING_EVENT_FAILED no catch de createBillingVisitEvent
- [ ] FIN-C2: reports.ts — usar report.author_user_id (não ctx.user.id) no doctor_user_id do billing event
- [ ] FIN-C3: financeSimple.ts — procedure financialDiagnostic (admin_master)
- [ ] FIN-C4: FinanceMeuFinanceiro2 — aviso de pricing_status + mensagem "sem laudo" melhorada
- [ ] FIN-C5: financeSimple.ts — procedure repriceMissingEvents
- [ ] FIN-C6: FinanceDashboard2 — UI de configuração explícita + integração com financialDiagnostic

## Reprocessador de Billing Events (13/05/2026)
- [x] FIN-R1: financeSimple.ts — procedure reprocessBillingEvents (dry_run + execução real)
- [x] FIN-R2: AdminPage.tsx — nova aba "Diagnóstico Financeiro" com BillingDiagnosticPanel
- [x] FIN-R3: BillingDiagnosticPanel — cards de diagnóstico (faltantes, zeros, falhas)
- [x] FIN-R4: BillingDiagnosticPanel — botão Reprocessar com modo simulação e modo execução
- [x] FIN-R5: BillingDiagnosticPanel — botão Reprecificar integrado ao painel

## Consolidação do Módulo Financeiro (13/05/2026)
- [x] FIN-C1: db.ts — desacoplar createBillingVisitEvent do ciclo (try/catch não-bloqueante)
- [x] FIN-C2: financeSimple.ts — myFinanceiro usa janela de 3 meses em vez de ciclo global 1-31
- [x] FIN-C3: financeSimple.ts — myResponsavel usa janela de 3 meses em vez de ciclo global 1-31
- [x] FIN-C4: App.tsx — responsavel_financeiro pode acessar /financeiro2 e /financeiro2/pagamentos
- [x] FIN-C5: Remover BillingAdminPage.tsx, BillingDoctorPage.tsx, BillingUnitPage.tsx
- [x] FIN-C6: Remover pasta finance/ (12 arquivos de páginas antigas)
- [x] FIN-C7: Salvar relatorio_ultima_versao_o_que_falta_financeiro.txt em docs/

## Consolidação do Módulo Financeiro (13/05/2026)
- [x] FIN-C1: db.ts — desacoplar createBillingVisitEvent do ciclo (try/catch não-bloqueante)
- [x] FIN-C2: financeSimple.ts — myFinanceiro usa janela de 3 meses em vez de ciclo global 1-31
- [x] FIN-C3: financeSimple.ts — myResponsavel usa janela de 3 meses em vez de ciclo global 1-31
- [x] FIN-C4: App.tsx — responsavel_financeiro pode acessar /financeiro2 e /financeiro2/pagamentos
- [x] FIN-C5: Remover BillingAdminPage.tsx, BillingDoctorPage.tsx, BillingUnitPage.tsx
- [x] FIN-C6: Remover pasta finance/ (12 arquivos de páginas antigas)
- [x] FIN-C7: Salvar relatorio_ultima_versao_o_que_falta_financeiro.txt em docs/

## Consolidação Módulo Financeiro v37 (13/05/2026)
- [x] Salvar relatorio_versao37_o_que_ainda_falta.txt no repositório (docs/)
- [x] Auditar createBillingVisitEvent — desacoplamento do ciclo já estava correto
- [x] Eliminar calcCycleDates(1, 31) global: dashboard, unitSummary, responsibleSummary → janela 3 meses
- [x] myFinanceiro: adicionar cycle_start_day/cycle_end_day ao retorno do summary
- [x] FinanceMeuFinanceiro2: exibir ciclo por unidade (ex: "Ciclo: 15/04 – 14/05")
- [x] myResponsavelSummary: adicionar cycle_start_day/cycle_end_day ao retorno
- [x] FinanceMeuResponsavel: exibir ciclo por unidade na lista de unidades

## Auditoria v38 — Consolidação do Modelo por Eventos (13/05/2026)
- [x] Salvar relatorio_completo_versao38_financeiro.txt em docs/
- [x] Auditar createBillingVisitEvent em reports.ts — criação automática não-bloqueante confirmada
- [x] Auditar createBillingVisitEvent em db.ts — desacoplamento do ciclo confirmado (try/catch)
- [x] Auditar calcCycleDates — todas as 4 ocorrências restantes usam ciclo da unidade (unitRow[0]?.s/e), não (1,31) fixo
- [x] Auditar billing.ts — ainda usa billing_cycles apenas para configuração (UnitFormDialog, AdminPage), não para cálculo financeiro
- [x] Auditar billing_report_items — atualização em reports.ts é legado não-bloqueante, não afeta financeiro principal
- [x] Confirmar: PRIORIDADES 1-4 do relatório v38 já implementadas nas sessões anteriores

## Testes de Integração Financeiro v39 (13/05/2026)
- [x] Salvar relatorio_completo_versao39_financeiro.txt em docs/
- [x] T1 — Assinar laudo cria exatamente 1 billing_visit_event
- [x] T2 — Assinar mesmo laudo 2x não duplica o evento (idempotência)
- [x] T3 — Mesmo paciente em datas diferentes gera eventos separados
- [x] T4 — Unidades com ciclos diferentes usam seus próprios ciclos (calcCycleDates)
- [x] T5 — Médico em várias unidades tem financeiro separado por unidade
- [x] T6 — Responsável financeiro acessa pagamentos e vê apenas suas unidades
- [x] T7 — Root visualiza todos os responsáveis (auditoria correta)
- [x] Auditar dependências de billing_monthly no frontend — nenhuma encontrada
- [x] Confirmar: finance2 é o único módulo financeiro ativo (páginas antigas já removidas)

## CORREÇÕES MÓDULO FINANCEIRO v49

### P1 — CRÍTICO: Ciclo real por unidade (em vez de janela de 3 meses)
- [x] P1A: Criar função resolveFinancialCycle no financeSimple.ts (após calcCycleDates)
- [x] P1B: Corrigir myFinanceiro — ciclo real por unidade do médico
- [x] P1C: Corrigir myResponsavelSummary — ciclo real por unidade vinculada
- [x] P1D: Corrigir unitSummary — ciclo real por unidade em loop
- [x] P1E: Corrigir responsibleSummary e dashboard — mesma abordagem por unidade
- [x] P1F: Atualizar markDoctorPaid e markSystemPaid — usar resolveFinancialCycle

### P2 — GRAVE: Frontend de FinanceConfiguracao usa listAllDoctorPrices
- [x] P2A: Substituir listAllDoctorPrices por listDoctorsForUnit no FinanceConfiguracao.tsx
- [x] P2B: Atualizar 2 invalidates e texto de estado vazio

### P3 — MÉDIO: Tipo incorreto de price_per_report em DoctorPriceRow
- [x] P3: Adicionar Number() nas linhas 20 e 55 do FinanceConfiguracao.tsx

### P4 — MÉDIO: Auditoria de pagamento incompleta
- [x] P4A: Migration SQL — adicionar doctor_received_by_user_id e system_paid_by_user_id
- [x] P4B: Atualizar drizzle/schema.ts com os 2 novos campos
- [x] P4C: markDoctorPaid — gravar ctx.user.id em doctor_received_by_user_id
- [x] P4D: markSystemPaid — gravar ctx.user.id em system_paid_by_user_id

### P5 — MÉDIO: Campo financial_enabled ausente
- [x] P5A: Migration SQL — adicionar financial_enabled BOOLEAN DEFAULT FALSE na tabela units
- [x] P5B: Atualizar drizzle/schema.ts com financial_enabled
- [x] P5C: unitFinancialReadiness — incluir financial_enabled na seleção e retorno
- [x] P5D: isReady — incluir && unit.financial_enabled
- [x] P5E: Criar procedure setFinancialEnabled no backend
- [x] P5F: Adicionar toggle de ativação financeira na FinanceConfiguracao.tsx

### P6 — BAIXO: Subquery → LEFT JOIN em unitFinancialReadiness
- [x] P6: Substituir subquery correlacionada por LEFT JOIN explícito (Drizzle ORM)

### P7 — BAIXO: Tabelas mortas ainda sendo escritas
- [x] P7A: Remover bloco billing_report_items de server/routers/reports.ts
- [x] P7B: Remover chamada updateCycleSummaries de server/db.ts

## CORREÇÕES MÓDULO FINANCEIRO v50

### P1 — CRÍTICO: Migration SQL ausente para novos campos
- [x] P1: Criar drizzle/0040_financial_module_columns.sql (financial_enabled, doctor_received_by_user_id, system_paid_by_user_id, financial_status)
- [x] P1: Aplicar migration financial_status no banco dev (webdev_execute_sql)
- [x] P1: Adicionar financial_status ao schema Drizzle

### P2 — ALTA: setFinancialEnabled sem validação de readiness no backend
- [x] P: Adicionar validação de readiness (isActive, ciclo, responsável, preço) em setFinancialEnabled
- [x] P: Registrar ativação/desativação no audit_log

### P3 — ALTA: Checklist não valida "todos os médicos com preço"
- [x] P: Adicionar total_doctors e doctors_without_price ao retorno de unitFinancialReadiness
- [x] P: Atualizar condição isReady para doctorPriceOk
- [x] P: Atualizar ReadinessChecklist no frontend

### P4 — ALTA: Sem assertCanAccessFinancialUnit
- [x] P: Criar função assertCanAccessFinancialUnit em financeSimple.ts
- [x] P: Aplicar nas 7 procedures prioritárias

### P5 — MÉDIA: financial_enabled não integrado ao fluxo de assinatura
- [x] P: createBillingVisitEvent registra audit_log se unidade inativa

### P6 — MÉDIA: Auditoria de pagamento não exibida na interface
- [x] PA: myFinanceiro retorna doctor_received_by_user_id + paid_by_name
- [x] PB: ExtractModal exibe "por [nome]" ao lado de "Pago"
- [x] PC: DoctorsModal exibe data do pagamento

### P7 — MÉDIA: markSystemPaid — decisão de acesso
- [x] P: Implementar Opção B (responsavel_financeiro + assertCanAccessFinancialUnit)

### P8 — MÉDIA: Política de retificação/cancelamento
- [x] P8A: Migration financial_status aplicada no banco
- [x] P8B: Schema Drizzle atualizado com financial_status
- [x] PC: Criar procedure cancelBillingEvent
- [x] PD: Filtrar financial_status != 'cancelled' em todas as queries de summary

### P9 — BAIXO: updateCycleSummaries dead code em db.ts
- [x] P: Remover função updateCycleSummaries de db.ts

## v51 — Precificação por Modalidade (Opção B — nova tabela)
### M1 — Migration SQL + Schema Drizzle
- [x] M1A: Criar tabela billing_doctor_modality_prices via webdev_execute_sql
- [x] M1B: Adicionar billing_doctor_modality_prices ao drizzle/schema.ts
### M2 — Backend db.ts
- [x] M2A: Estender getActiveDoctorPrice com parâmetro modality? (fallback: modality → unit_price → null)
- [x] M2B: Adicionar modality_snapshot? ao tipo de entrada de createBillingVisitEvent
- [x] M2C: Gravar modality_snapshot no INSERT de billing_visit_events
- [x] M2D: Passar modality_snapshot para getActiveDoctorPrice dentro de createBillingVisitEvent
### M3 — Backend reports.ts
- [x] M3A: Buscar studies_cache.modality pelo study_instance_uid ao assinar laudo
- [x] M3B: Passar modality_snapshot para createBillingVisitEvent
### M4 — Backend financeSimple.ts
- [x] M4A: Procedure getDoctorModalityPrices (lista preços por modalidade de um médico)
- [x] M4B: Procedure setDoctorModalityPrice (cria/atualiza preço por modalidade com vigência)
- [x] M4C: Procedure deleteDoctorModalityPrice (encerra vigência — soft delete)
- [x] M4D: Corrigir repriceMissingEvents para usar modality_snapshot ao represar
### M5 — Frontend DoctorPriceManager.tsx
- [x] M5A: Adicionar seção "Preços por Modalidade" por médico (lista + formulário de adição)
- [x] M5B: Usar constante MODALITIES para dropdown de modalidade
### M6 — Frontend FinanceMeuFinanceiro.tsx
- [x] M6A: Adicionar coluna "Modalidade" na tabela de eventos do extrato
### M7 — Qualidade
- [x] M7A: TypeScript 0 erros
- [x] M7B: Todos os testes passando
- [x] M7C: Commit GitHub + checkpoint Manus

## v52 — Editor de Laudos: Toolbar + Máscaras com Backend

- [ ] v52 — Tabela report_masks (id, unit_id, owner_user_id, scope: personal|unit, name, modality, exam_title, body, created_by, createdAt, updatedAt)
- [ ] v52 — Migration 0043 criada e aplicada no banco sandbox
- [ ] v52 — db.ts: listReportMasks, createReportMask, deleteReportMask
- [ ] v52 — tRPC procedures: masks.list, masks.import (bulk JSON), masks.delete
- [ ] v52 — ReportEditorPage: toolbar de formatação (bold/italic/underline/cor/realce/alinhamento/fonte/undo/redo/linha)
- [ ] v52 — ReportEditorPage: botão Pré-visualizar no header
- [ ] v52 — ReportEditorPage: botão flutuante separado de Laudos Prontos (máscaras)
- [ ] v52 — Botão flutuante: importar JSON (pessoal) + admin pode publicar para unidade
- [ ] v52 — Botão flutuante: busca, agrupamento Pessoais / Unidade, aplicar máscara no editor
- [ ] v52 — Testes + commit + checkpoint
- [x] Refinar a listagem mobile conforme referência: cabeçalho compacto, aviso financeiro, seletor de data amplo e cards minimalistas com ações circulares
- [x] Reorganizar card mobile: priorizar legenda do exame na linha principal e exibir nome completo da paciente na faixa inferior
- [x] Reduzir legenda do exame ao tamanho discreto original e mover status para a faixa do nome no card mobile
- [x] Enviar o checkpoint da correção do card PACS mobile para o repositório GitHub conectado
- [x] Validar e ativar o botão "Escolher data" (filtro de data personalizado) na listagem PACS
- [x] Substituir popover de data por modal explícito com fundo escurecido, título, calendário, botão Fechar e botão Hoje (referência visual QA)
- [x] Validar no celular o modal “Escolher data” e confirmar a busca real após selecionar uma data
- [x] Reutilizar study_metadata para correções locais de nome e legenda, integrando edição e aplicação sem alterar a fonte PACS
- [x] Remover a duplicidade dos ícones de edição no card mobile e manter uma única ação discreta para corrigir o nome do paciente
- [x] Confirmar publicação do controle único de edição no GitHub e deixar a branch pronta para a próxima alteração funcional
- [x] Corrigir rota do clipe (Paperclip) para abrir anexos e fotos do paciente (câmera, múltiplos arquivos) em vez da anamnese, com visualização no DICOM viewer
- [x] Simplificar o modal de anexos: nome do paciente, Fotografar, Anexar arquivo, miniaturas/quantidade e Fechar
- [x] Manter o modal aberto após fotografar, abrir miniaturas em preview ampliado e remover o título textual do cabeçalho do modal
- [x] Nota arquitetural registrada: futura VM3 (MinIO/S3) para armazenamento isolado de anexos de exames e laudos em PDF, evitando sobrecarga em VM1 e VM2
- [x] Reorganizar a experiência mobile do visualizador DICOM: cabeçalho paciente/exame, ações Laudar/Laudo falado/Requisição e área de erro/anamnese conforme referência fornecida
- [x] Reorganizar o editor de laudos no mobile: ocultar composição desktop, usar painel/gaveta para modelos/trechos/carimbo, toolbar compacta, preview em tela útil e ações flutuantes sem remover funcionalidades

- [x] Simplificar a aba mobile de unidades com cartões responsivos, dados essenciais e ações acessíveis
- [x] Organizar a criação e edição de unidades em modal mobile com seções compactas
- [x] Adaptar a aba mobile de usuários para cartões e permissões empilhadas sem quebrar o desktop
- [x] Validar a administração mobile com TypeScript, Vitest e verificação visual
- [x] Sincronizar a melhoria da administração mobile no GitHub
- [x] Simplificar a edição administrativa de layout de laudos no mobile com abas por seção e prévia A4 limpa
- [x] Corrigir a composição mobile do editor de layout: impedir texto verticalizado, overflow horizontal e invasão da prévia A4 pelo painel de controles
- [x] Implementar indicador visual de carregamento durante a atualização da prévia A4 após mudanças no layout mobile
- [x] Reformular a prévia A4 do editor de layout para reproduzir uma folha institucional real de PDF/Android (cabeçalho, logotipos proporcionais, dados do paciente, título do exame, corpo estruturado, assinatura digital, rodapé gráfico e paginação)
- [x] Corrigir TypeError durante o arraste mobile da prévia A4 quando o estado de ponteiro fica nulo
- [x] Restaurar o botão Laudar na tabela desktop da listagem PACS preservando o RBAC e o fluxo mobile
- [x] Adaptar o editor de layout de laudos para incorporar a referência visual do ZIP (painel de logos, controles X/Y/largura/altura, prévia interativa e alternância de modos)
- [x] Transformar a edição de logotipos no LayoutEditorPage em elementos diretamente selecionáveis, arrastáveis e redimensionáveis na folha A4 com barras de ferramentas flutuantes compactas
- [x] Corrigir definitivamente o TypeError de `origX`/`originX` durante arraste ou redimensionamento no LayoutEditorPage
- [x] Ajustar os posicionamentos padrão do LayoutEditorPage para que a logo e os dados do paciente fiquem em faixas separadas (logo no topo esquerdo/centro, dados e título abaixo) sem sobreposição
- [x] Sincronizar o layout personalizado salvo pelo administrador (logos, posições, fundo, rodapé) para ser renderizado exatamente igual no ReportEditorPage e na exportação PDF
- [x] Alinhar rigorosamente a versão desktop do ReportEditorPage para aplicar a posição exata (X, Y, largura, altura) salva pelo administrador para cada bloco (logos, paciente, título, corpo, rodapé)
- [x] Unificar rigorosamente as coordenadas, escalas e IDs de blocos entre o LayoutEditorPage e o ReportEditorPage para que a posição salva no admin seja aplicada 1:1 no editor desktop
- [x] Eliminar a montagem fixa redundante no ReportEditorPage desktop e renderizar exclusivamente a folha A4 com base nos blocos persistidos no LayoutEditorPage
- [x] Criar o componente compartilhado de folha A4 institucional (`SharedReportSheet.tsx`) para unificar a renderização entre o editor administrativo, o editor clínico desktop e a exportação PDF

## AUDITORIA FINAL — FOLHA A4 COMPARTILHADA
- [x] Unificar a prévia real administrativa com `SharedReportSheet`, preservando o modo de edição e o arraste de blocos.
- [x] Unificar o canvas desktop clínico com `SharedReportSheet`, incluindo logos, dados, título, corpo e rodapé nas coordenadas persistidas.
- [x] Ajustar a impressão/PDF de página única para usar a mesma composição percentual da folha A4 compartilhada.
- [x] Atualizar testes de contrato do editor e validar TypeScript + Vitest (181 testes passando).
- [x] Auditar visualmente a prévia administrativa e o editor clínico no navegador, sem erros no console.
- [x] Validar arraste e redimensionamento por Pointer Events com teste automatizado e simulação de toque no sandbox.
- [ ] Revalidar arraste e redimensionamento em dispositivo móvel físico.
- [x] Revisar refinamentos finais de multi-seção após teste com dados reais.
- [x] Confirmar a referência final de branding institucional (logo Instituto Acqua, Arial, título centralizado, dados do paciente e estrutura Técnica/Achados/Conclusão) para o PDF publicado.
- [x] Unificar também o renderer de download/impressão da PacsQueryPage com o contrato percentual do `SharedReportSheet`.

## CORREÇÃO VISUAL REPORTADA — ADMIN x CLÍNICO A4
- [x] Diagnosticar por que a prévia administrativa e o editor clínico exibem logo, dados, título e corpo em posições/composições diferentes na captura enviada.
- [x] Corrigir a fonte única de composição para que o editor clínico corresponda visualmente ao layout salvo no admin.
- [x] Validar a composição no sandbox e atualizar os testes de contrato/exportação.
- [x] Revalidar a correspondência visual com um estudo real carregado no editor clínico.

## REABERTURA DA AUDITORIA VISUAL — CAPTURA DO USUÁRIO
- [x] Reproduzir a divergência mostrada: admin institucional completo versus editor clínico com composição diferente.
- [x] Unificar não apenas o componente, mas também escala, fonte, conteúdo demonstrativo, identificação do paciente, título e estado vazio do corpo.
- [x] Validar lado a lado com dados representativos e atualizar o teste de contrato visual.
- [x] Aplicar a mesma guia institucional de corpo vazio a cada seção do modo multi-exame, sem persistir conteúdo médico fictício.

## CORREÇÃO DO MODO EDITAR BLOCOS — ADMIN x FOLHA CLÍNICA
- [x] Remover a aparência dominante de caixas coloridas no modo de edição e preservar a folha institucional real como base visual.
- [x] Manter controles discretos de seleção, arraste e redimensionamento sobre cada bloco sem alterar a composição final.
- [x] Validar lado a lado o modo de edição administrativo e o editor clínico com o layout salvo da unidade PACS Principal.

## FONTE ÚNICA DEFINITIVA — LAYOUT ADMIN → MÉDICO → PDF
- [x] Rastrear o layout salvo da unidade até o editor médico e confirmar que nenhum fallback substitui posições, logos ou preferências persistidas.
- [x] Fazer o editor médico renderizar exatamente a composição salva pelo administrador, incluindo o estado vazio sem trocar a estrutura por outro modelo.
- [x] Fazer a impressão/PDF usar o mesmo DOM/contrato de blocos do layout salvo, sem HTML paralelo com posições independentes.
- [x] Testar um layout deliberadamente alterado no admin, conferir a reprodução no médico e comparar o contrato do PDF final.

## ROLLBACK CONCLUÍDO — VERSÃO ANTERIOR ÀS ALTERAÇÕES DO SEGUNDO ZIP
- [x] Restaurar o checkpoint `796fa14b`, anterior à camada `ClinicalReportSheet` e às alterações visuais do segundo ZIP.
- [x] Validar TypeScript, suíte Vitest e servidor após o rollback (185 testes passando).
- [x] Confirmar que a visualização médica e a impressão voltaram ao comportamento anterior estável.
- [ ] Não reaplicar a referência do segundo ZIP sem uma nova autorização explícita do usuário.

## NOVA REFERÊNCIA VISUAL — LAUDO CLÍNICO E PDF ORGANIZADOS
- [x] Mapear nome, nascimento, sexo, data do exame, modalidade, unidade, logo, título e dados do médico já disponíveis no editor clínico.
- [x] Organizar exclusivamente no ambiente médico e na impressão/PDF o cabeçalho, dados do paciente, título, seções clínicas, assinatura e rodapé conforme a imagem de referência.
- [x] Preservar o editor administrativo, posições persistidas e banco de dados sem alterações.
- [x] Validar a apresentação desktop e a impressão com dados reais/representativos; a estrutura mobile permanece responsiva pelo mesmo markup clínico.
- [ ] Confirmar a aparência final em um aparelho móvel físico.

## ÚLTIMA TENTATIVA — MESMA COMPOSIÇÃO ADMIN → MÉDICO → PDF
- [x] Comparar as posições efetivas dos blocos na prévia administrativa e no editor clínico da mesma unidade.
- [x] Remover a composição clínica alternativa e fazer médico/PDF usar a mesma estrutura visual da prévia, trocando somente os valores de paciente e exame.
- [x] Validar lado a lado com o estudo real e encerrar este setor sem alterar o admin ou o banco.

- [x] Unificar os botões Visualizar e Baixar na listagem PACS em um único botão Visualizar.
- [x] Exibir o botão Visualizar em estado neutro/transparente quando as imagens ainda não estiverem baixadas.
- [x] Iniciar o download completo das imagens ao clicar em Visualizar quando o estudo não estiver em cache.
- [x] Exibir estado de carregamento durante o download e impedir a abertura do visualizador antes da conclusão.
- [x] Ativar o botão Visualizar após todas as imagens DICOM serem baixadas e permitir acesso ao visualizador/laudo.
- [x] Remover o botão Baixar separado sem alterar o fluxo de pré-download existente.
- [x] Criar ou atualizar testes Vitest para os estados do botão e a proteção contra abertura prematura.
- [x] Validar o fluxo com um estudo real no sandbox e salvar checkpoint.

## CORREÇÃO DA ORDEM DE SLICES DICOM — 16/08/2026
- [x] Reproduzir no sandbox a mistura de instâncias ao navegar pelo slider do visualizador.
- [x] Identificar a ordenação lexicográfica por SOPInstanceUID como causa da sequência incorreta.
- [x] Criar ordenação determinística por SeriesNumber, SeriesInstanceUID, InstanceNumber e posição espacial DICOM.
- [x] Aplicar a ordenação aos endpoints de arquivos, séries, cache SSE, ZIP e viewers externos.
- [x] Remover a reordenação lexicográfica do stack progressivo e final do Cornerstone.
- [x] Validar o estudo real de ANTONIA DE SOUZA BATISTA com 262 imagens no sandbox.
- [x] Criar testes Vitest de regressão para impedir o retorno da mistura de slices.
- [x] Salvar a investigação e o resultado técnico em dicom-order-investigation.md.

## CORREÇÃO DE ACESSO EXTERNO EM NAVEGADOR MÓVEL — 16/08/2026
- [x] Impedir que tradutores automáticos alterem o DOM React da aplicação pública.
- [x] Corrigir o idioma declarado do documento público para pt-BR.
- [x] Recompilar e publicar os assets da correção na VM1.
- [ ] Validar HTTP, HTML público e acesso externo em navegador móvel sem erro removeChild.
- [x] Corrigir a divergência de publicação que mantém o bundle antigo do RadiAnt na VM1 e validar que o botão baixa o ZIP DICOM em vez de usar radiant://
- [x] Pesquisar documentação oficial de integração PACS do RadiAnt (command line e URL protocol)
- [x] Implementar a URL scheme oficial do RadiAnt com StudyInstanceUID e AETitle da unidade
- [x] Validar via Vitest e testar a abertura automática no Windows
- [x] Ajustar parâmetro n=f para arquivos locais no RadiAnt (compatível com estações comerciais sem configuração prévia)
- [x] Configurar o RadiAnt para usar o método DownloadURL com o ZIP do estudo em background (idêntico ao Horos e OsiriX)
- [x] Auditar e consolidar as diretrizes de deploy e infraestrutura do Setor 22 (`docs/PARECER_SETOR_22_DEPLOY.md`)
- [x] Auditar e consolidar as diretrizes de Autenticação e RBAC dos Setores 1+2 (`docs/PARECER_SETOR_01_02_AUTH_RBAC.md`)
- [x] Implementar revalidação de contas inativas/expiradas em cada requisição (`server/_core/context.ts`)
- [x] Implementar bloqueio hierárquico em `admin.updateUser` e `admin.toggleUserActive` contra `admin_master` e `unit_admin`
- [x] Adicionar e aprovar testes de regressão em `server/security.auth.test.ts` (17/17 aprovados)
- [x] Implementar `assertDicomFileAccess` e isolamento por unidade em todas as rotas de cache, stream, arquivos DICOM, miniaturas, exportação ZIP e launch externo (Setores 05-06)
- [x] Adicionar e aprovar testes em `server/dicom-isolation.test.ts` (200/200 testes aprovados no total)
- [x] Implementar hardening de uploads e armazenamento local contra path traversal e validação rigorosa de magic bytes (Setores 19-20, checkpoint `b909223f`)

# Migração VM3 MinIO/RAID1 — escopo iniciado em 17/08/2026

- [x] Revisar a documentação da VM3 e confirmar pré-requisitos operacionais do RAID1, MinIO, bucket e conectividade VM1 → VM3
- [x] Preservar a branch local `backup-local-vm1` e sincronizar a VM1 com o commit remoto `aa45197`
- [x] Validar a conectividade e autenticação MinIO a partir da VM1 (172.16.3.100), pois o sandbox não possui rota para a rede privada da VM3
- [x] Rotacionar a Secret Key da conta de aplicação `pacs-app` na VM3 antes de configurar o Portal
- [x] Descartar a Secret Key exibida no chat e gerar uma nova credencial sem compartilhá-la na conversa
- [x] Corrigir erro TypeScript em `server/authorization.ts` causado por fallback inalcançável após retorno de `assertDicomFileAccess`
- [x] Corrigir carregamento lazy das secrets MinIO para compatibilidade com dotenv/PM2 antes de migrar o backend
- [x] Migrar o backend de storage para usar MinIO VM3 (172.16.3.102:9000, bucket vm3-storage) sem credenciais hardcoded, mantendo estritamente locais na VM1: logos, assinaturas, carimbos, perfis e avatares
- [x] Implementar exportação persistente de laudos assinados na VM3 (`reports.sign` gravando HTML em `laudos/{unit_id}/{report_id}_v{version}.html`)
- [x] Implementar acesso privado com URLs pré-assinadas para logos, assinaturas e carimbos
- [x] Atualizar remoção de logos, assinaturas e carimbos para apagar também o objeto no MinIO
- [x] Migrar uploads de anexos e áudios para o MinIO por meio da camada compartilhada, mantendo referências e metadados existentes
- [x] Normalizar URLs nas listagens de anexos, áudios e logos administrativas para URLs temporárias ou referências locais legadas
- [x] Preservar compatibilidade controlada com uploads locais existentes durante a transição
- [x] Criar testes Vitest para referências privadas, path traversal, configuração e fallback de migração VM3
- [x] Validar build e suíte completa de testes antes do checkpoint da migração VM3 (build com heap 2 GB; 25 arquivos, 206 testes aprovados e 1 integração MinIO pulada por rede privada do sandbox)
- [x] Documentar comandos de homologação na VM1 e VM3, incluindo verificação do RAID, MinIO, firewall e objeto real no bucket (`docs/VM3_HOMOLOGACAO_RUNBOOK.md`)
- [x] Planejar migração dos arquivos locais existentes da VM1 para o bucket da VM3 sem interromper a produção (`docs/VM3_HOMOLOGACAO_RUNBOOK.md`)
- [x] Detalhar formalmente a arquitetura operacional, funções, limites, modelo de dados, segurança e backup por máquina virtual (`docs/ARQUITETURA_3_VMS_PACS.md`)
- [x] Auditar o plano de implementação de código da VM3 e formalizar o parecer técnico (`docs/PARECER_PLANO_IMPLEMENTACAO_VM3.md`)
- [x] Criar documentação completa da estrutura real da VM2, incluindo tabelas, colunas, capacidades, backups e divergências com Drizzle (`docs/ESTRUTURA_BANCO_VM2.md`)
- [x] Confirmar e corrigir a divergência das colunas `reports.export_file_key` e `reports.export_file_url` entre código, VM2 e documentação
- [x] Executar script de validação de backup e DDL idempotente na VM2 para adicionar `export_file_key` e `export_file_url` em `reports` (GZIP/checksum OK; snapshot `reports_backup_20260817` criado)
- [x] Atualizar a documentação oficial da VM2 (`docs/ESTRUTURA_BANCO_VM2.md`) para refletir o schema regularizado
- [x] Consolidar o mapa de auditoria funcional e operacional das VM1 e VM2 no repositório (`docs/MAPA_AUDITORIA_FUNCIONAL_VM1_VM2.md`)
- [x] Executar diagnóstico somente de leitura da VM3 para inventariar RAID1, filesystem, MinIO, bucket e regras de firewall
- [x] Consolidar a documentação oficial de homologação e inventário da VM3 (`docs/VM3_ESTRUTURA_E_HOMOLOGACAO.md`)
- [x] Dimensionar e registrar o consumo de espaço por artefato (cache DICOM, rascunho, laudo assinado HTML, anexos/fotos e áudio) nas VM1, VM2 e VM3 durante um ciclo completo de exame
- [x] Coletar logs de erro e auditar o espaço real ocupado nas VM1 e VM3 após teste real de exame
- [x] Corrigir erro em `reports.sign` (`minioUpload` substituído por `storagePut`) para evitar `Cannot read properties of undefined (reading 'url')`
- [x] Corrigir referências de mídia e miniaturas quebradas no modal de anexos do mobile
- [x] Eliminar o aviso/painel vazio sobreposto após upload de anexo no mobile
- [x] Validar a consistência do modal de anexos na listagem e no visualizador DICOM
- [x] Adicionar controles explícitos de voltar e fechar na prévia de anexos para uso móvel
- [x] Corrigir a reprodução de áudios privados no mobile por rota autenticada da VM1
- [x] Implementar retorno, avanço, barra de progresso interativa e controle de velocidade no player de áudio
- [x] Confirmar e documentar a localização física e metadados dos áudios nas VM1, VM2 e VM3 (`docs/EVIDENCIA_PERSISTENCIA_AUDIO_VM1_VM2_VM3.md`)
- [x] Confirmar o host de banco efetivamente usado pelo Portal e resolver a divergência com o MySQL local da VM1
- [x] Redesenhar o player móvel de áudio com uma única ação de fechamento e controles de reprodução sempre visíveis
- [x] Corrigir a largura, o alinhamento e o espaçamento do player de áudio em telas móveis estreitas
- [x] Corrigir a URL ou rota WADO entregue ao Horos para eliminar a resposta HTTP 404 ao abrir estudos externos
- [x] Documentar e versionar a validação real do Horos após abertura bem-sucedida do estudo (`docs/VALIDACAO_HOROS_DOWNLOADURL.md`)
- [x] Auditar e corrigir os achados P0 de isolamento de laudos, permissões, anexos, áudios e validação de conteúdo do relatório Setor Desempenho v2
- [x] P0: Exigir permissão de unidade para referências privadas no prefixo `laudos/`
- [x] P0: Restringir o fallback legado de permissões às ações seguras de leitura
- [x] P0: Validar acesso ao estudo antes de listar, gravar ou excluir áudios e anexos
- [x] P0: Validar magic bytes e tipos permitidos antes de persistir áudio ou anexo
- [x] Coletar diagnóstico somente de leitura de desempenho nas VM1, VM2 e VM3 antes de priorizar otimizações estruturais
- [ ] Verificar a necessidade do serviço MySQL local ativo na VM1, pois o Portal está configurado para usar a VM2
- [x] Confirmar a identidade por IP e os serviços ativos das VMs, pois a coleta rotulada como VM2 apresentou MinIO e PostgreSQL além do MySQL
- [x] Documentar a divergência confirmada: a VM2 (172.16.3.101) executa MySQL, PostgreSQL e MinIO, com portas 9000 e 9001 expostas (`docs/DESATIVACAO_MINIO_RESIDUAL_VM2.md`)
- [x] Inventariar a VM3 (172.16.3.102) para confirmar RAID, serviços, portas e eventual duplicidade de dados MinIO
- [ ] Inventariar o MinIO residual ativo na VM2 antes de qualquer desligamento, para preservar possíveis objetos e configurações
- [ ] Inventariar os objetos dos buckets residuais `db-lauds` e `lauds` na VM2 antes de migrar, restringir portas ou desativar o MinIO
- [ ] Identificar sem expor segredo a conta raiz configurada no MinIO residual da VM2 para concluir o inventário dos buckets
- [ ] Confirmar o arquivo e o formato efetivo das variáveis carregadas pelo serviço MinIO residual da VM2 antes de nova autenticação de inventário
- [x] Executar teste reversível de parada do MinIO residual da VM2 com logs e rollback imediato preparados
- [x] Desativar permanentemente o serviço MinIO residual da VM2 sem apagar `/data/minio`
- [x] Remover as regras de firewall da VM2 para as portas residuais 9000 e 9001 após desativar o serviço
- [x] Documentar o rollback de contingência e consolidar a VM3 como storage MinIO único do Portal (`docs/DESATIVACAO_MINIO_RESIDUAL_VM2.md`)
- [ ] Restaurar a desativação do MinIO residual da VM2 após a reativação manual do serviço
- [x] Restringir de forma reversível as portas MinIO 9000 e 9001 da VM2 após a preservação e validação dos dados residuais

> Nota: a VM3 física consta como criada no documento técnico, mas a migração lógica dos fluxos do Portal ainda não foi comprovada; o bucket estava vazio no último registro documentado.
> Segurança: credenciais do documento devem ser rotacionadas no ambiente real antes da entrada em produção definitiva e nunca devem ser gravadas no código ou em documentação pública.
> Arquitetura: a VM3 é uma terceira camada de armazenamento; não substitui a VM1 (Portal) nem a VM2 (banco de dados). RAID1 fornece redundância local, mas não substitui backup externo.
> Destrutivo: não executar wipefs, mkfs ou recriação do RAID nos discos /dev/sdb e /dev/sdc sem confirmação explícita de que não existem dados válidos.
> Endpoint: manter a API MinIO 9000 acessível apenas pela VM1; a console 9001 permanece restrita até decisão operacional específica.
> Dados: não armazenar bytes de arquivos no MySQL/MariaDB; o banco deve guardar somente chave, metadados e referências necessárias.
> Rollback: preservar backup dos arquivos locais e das tabelas/referências antes de ativar a escrita no MinIO.
> Responsabilidade: comandos de Proxmox, particionamento, RAID, firewall e systemd são executados na infraestrutura real; o sandbox não representa a VM3 física.
> Pendências da documentação: término da ressincronização RAID1, validação do QEMU Guest Agent, revisão de referências antigas à VM2, validação após reboot e política de backup externo.
> Fase atual: integração lógica implementada e validada no sandbox; autenticação S3 real pelo Portal e migração dos arquivos locais continuam pendentes de execução na VM1/VM3.

## RELATÓRIO TÉCNICO CONSOLIDADO — 18/08/2026

- [x] Reconciliar linha a linha os achados do relatório com o código atual, os checkpoints e as evidências operacionais já coletadas, classificando cada item como corrigido, pendente ou dependente de nova evidência.
- [x] Verificar na VM1 o commit ativo, a existência de `dist/public/index.html` e o estado do PM2 antes de qualquer novo deploy.
- [x] Confirmar após atualização da VM1 que os erros históricos de exportação de laudo e de frontend ausente não voltam a aparecer nos logs.
- [x] Implementar cache curto de autorização por usuário e estudo nas rotas de fatias DICOM, preservando a validação de unidade e cobrindo o comportamento com testes Vitest.
- [x] Otimizar a ordenação de arquivos DICOM para ler cabeçalhos de forma limitada e concorrente, sem alterar a ordem clínica já validada das imagens.
- [x] Cachear a verificação de existência do bucket MinIO e eliminar chamadas de metadados redundantes no fluxo de mídia privada, com testes de regressão.
- [x] Formalizar migrations SQL auditáveis para `study_audio_reports`, `study_attachments` e `reports.export_file_key`/`reports.export_file_url`, incluindo no schema Drizzle os índices existentes no banco real.
- [ ] Investigar somente em leitura a origem e o uso efetivo do PostgreSQL na VM2 antes de considerar qualquer alteração de serviço.
- [ ] Planejar a renomeação segura dos hostnames da VM1 e VM2, com confirmação de impacto em configurações e serviços antes da execução.
- [ ] Confirmar a conclusão da ressincronização RAID1 e validar o fluxo completo de laudo, anexo e áudio no bucket da VM3 após o deploy atualizado.

## RADIANT — QUERY/RETRIEVE DIRETO POR PACS (PILOTO)

- [ ] Confirmar com documentação oficial do RadiAnt a sintaxe `radiant://` aplicável a PACS Query/Retrieve e os significados de `paet` e `pstv`.
- [ ] Corrigir as premissas do guia técnico conforme o código atual, distinguindo o botão RadiAnt de Query/Retrieve do fallback ZIP já existente.
- [ ] Escolher uma única unidade piloto e registrar IP, porta DICOM, AE Title, suporte a Query/Retrieve e rede autorizada sem expor porta DICOM à internet.
- [ ] Validar manualmente no computador de um médico que o RadiAnt consulta e recupera um estudo da unidade piloto antes de alterar o Portal.
- [ ] Implementar no backend o launch RadiAnt por PACS Query/Retrieve somente para unidades explicitamente habilitadas, preservando `assertDicomFileAccess`, auditoria e o fallback ZIP.
- [ ] Atualizar a mensagem de UX do RadiAnt para informar pré-requisitos de configuração local e disponibilizar o fallback quando o piloto não estiver habilitado.
- [ ] Cobrir a montagem da URI, autorização por unidade, unidade não habilitada e preservação dos viewers Horos/Weasis/OsiriX com testes Vitest.
- [ ] Testar no sandbox, documentar a implantação e publicar a integração RadiAnt no GitHub antes de qualquer atualização da VM1.
- [ ] Validar o piloto com dois estudos autorizados e um estudo bloqueado, sem alterar regras de firewall fora da rede autorizada.
- [ ] Investigar mecanismo oficialmente suportado pelo RadiAnt para abrir arquivos remotos temporários ou distribuir a configuração PACS de forma centralizada, sem depender de cadastro manual por médico.
- [ ] Modelar um fluxo em que o Portal autoriza o lançamento e entrega somente referências temporárias, deixando explícito o limite entre sessão web e conexão DICOM do aplicativo desktop.
- [ ] Comparar o fluxo direto Query/Retrieve com o fluxo de arquivos temporários autenticados segundo segurança, configuração operacional, desempenho e compatibilidade real do RadiAnt.
- [ ] Projetar um instalador ou script de preparação única para computadores Windows pessoais, sem exigir cadastro manual de PACS pelo médico a cada uso.
- [ ] Manter Horos como caminho macOS já validado e limitar a integração RadiAnt aos computadores Windows compatíveis.
- [ ] Definir um identificador AE Title exclusivo por estação Windows sem incluir credenciais ou endereços de PACS no botão do Portal.
- [x] Projetar o botão "Ativar RadiAnt" como assistente de primeira utilização, com instalação local única e confirmação visual no Windows durante o piloto.
- [ ] Impedir que uma confirmação de ativação seja forjada pelo navegador, usando desafio temporário vinculado ao usuário e à estação durante o pareamento inicial em uma futura versão assinada.
- [ ] Definir o consentimento e a documentação de que acesso direto Query/Retrieve permite ao PACS reconhecer a estação fora da sessão do Portal.
- [x] Validar o uso documentado de `radiantviewer.exe -f` para arquivos DICOM locais e substituir a hipótese não suportada de `DownloadURL` no RadiAnt.
- [x] Projetar um assistente local do RadiAnt que aceite somente comandos temporários emitidos pelo Portal, baixe o estudo autorizado e o abra por `-f`, sem conhecer o PACS remoto.
- [x] Vincular cada comando temporário à sessão, ao estudo, à expiração curta e a um único uso, evitando que URLs reutilizadas abram outro exame.
- [x] Manter o computador Windows sem credenciais, IP ou AE Title dos PACS das unidades, preservando o Portal como único ponto de autorização clínica.
- [x] Garantir que a ativação e a abertura RadiAnt não leiam, alterem, substituam ou removam o `pacs.xml` e nenhuma configuração hospitalar preexistente.
- [x] Abrir o estudo exclusivamente como arquivos DICOM temporários locais, sem invocar Query/Retrieve, C-FIND, C-GET ou C-MOVE do RadiAnt.
- [x] Avaliar o uso do AE Title padrão `RADIANT` e da porta 11112 apenas como destino DICOM, considerando NAT, firewall, IP público e controle por estação.
- [x] Documentar por que o padrão de listener RadiAnt não basta para entregar estudos a computadores pessoais externos sem conectividade de retorno segura.
- [x] Comparar o modo de listener padrão com o Assistente local, priorizando a preservação da configuração hospitalar e autorização por estudo.
- [x] Implementar somente o fluxo Assistente RadiAnt com arquivos temporários autorizados nesta rodada, sem alterar Horos, PACS, AE Titles, IPs, portas ou `pacs.xml` existentes.
- [x] Preparar um pacote de teste para um computador Windows com RadiAnt já instalado e registrar o resultado antes de ampliar o recurso.
- [x] Remover PowerShell e arquivos `.ps1` da experiência de ativação apresentada a usuários finais.
- [x] Produzir um instalador visual do Assistente RadiAnt, com associação de protocolo local e abertura pelo Windows sem comandos manuais.
- [ ] Definir e aplicar assinatura de código antes de distribuição ampla do instalador Windows.
- [x] Exibir no Portal somente a abertura padrão do Windows após a instalação única, sem instruções técnicas para médicos.
- [x] Corrigir o download bloqueado do instalador `.exe` no navegador, substituindo o redirecionamento externo por entrega compatível pelo mesmo domínio do Portal.
- [x] Validar no navegador Windows que o instalador visual é baixado integralmente antes de repetir a ativação RadiAnt.
- [x] Verificar na VM1 a origem HTTP/HTTPS, os cabeçalhos e o status da resposta do instalador antes de alterar novamente o Portal.
- [x] Corrigir qualquer bloqueio de download inseguro ou incompatível do navegador sem solicitar que médicos desativem proteções locais.
- [x] Produzir e versionar relatório de auditoria externa sobre a arquitetura RadiAnt, o piloto executado, os bloqueios de download e as recomendações de correção.
- [x] Substituir a busca de instalador pelo storage de desenvolvimento, indisponível na VM1, por artefato local controlado com checksum e entrega autenticada.
- [x] Atualizar o relatório de auditoria com a causa raiz confirmada `Storage proxy not configured` e a estratégia de correção local da VM1.
- [x] Validar o checksum SHA-256 do instalador baixado no Windows piloto antes de qualquer execução controlada.
- [ ] Registrar que o aviso do Chrome decorre de instalador não assinado e bloquear a distribuição ampla até obtenção de assinatura de código.
- [x] Localizar o caminho real do executável RadiAnt no computador piloto e ampliar a detecção do Assistente sem modificar configurações locais.
- [x] Validar que a ativação identifica o RadiAnt existente antes de testar a abertura do estudo temporário.
- [x] Incluir o caminho padrão validado `C:\Program Files\RadiAntViewer64bit\RadiAntViewer.exe` na detecção do Assistente RadiAnt.
- [x] Corrigir o instalador para encerrar somente `PacsRadiantAssistant.exe` antes de atualizar arquivos bloqueados, sem interromper `RadiAntViewer.exe`.
- [x] Validar no Windows piloto que a atualização substitui o Assistente antigo sem interrupção do RadiAnt existente.

## CONFIANÇA WINDOWS E ASSINATURA DE CÓDIGO — DISTRIBUIÇÃO COMERCIAL RADIANT

- [x] Distinguir o aviso de abertura do protocolo local do alerta de reputação do executável e registrar os controles aplicáveis a cada um.
- [x] Comparar certificados de assinatura de código OV e EV, incluindo o impacto esperado na confiança inicial do Microsoft SmartScreen.
- [ ] Definir a entidade legal, o domínio oficial e os dados de validação que devem constar no certificado de assinatura do Assistente RadiAnt.
- [x] Documentar o procedimento de aquisição, custódia de chave, assinatura, carimbo de tempo e validação do instalador Windows.
- [ ] Preparar o pipeline de release para assinar, verificar e publicar somente artefatos com assinatura de código válida.
- [ ] Validar em computador Windows limpo a identificação do publicador e a ausência de alerta de editor desconhecido antes de distribuição ampla.

## ASSINATURA INDIVIDUAL PROVISÓRIA — ASSISTENTE RADIANT

- [ ] Confirmar fornecedores que emitam certificado individual público de assinatura de código para residente no Brasil e os documentos exigidos.
- [x] Definir que o certificado provisório mostrará somente o nome civil validado do responsável, sem apresentar `Lauds` ou `StudioBarra7` como entidade verificada.
- [x] Registrar, mediante consentimento expresso, a identidade pública de publicação `Alessandro Lacerda Rocha`, sem incluir identificadores pessoais adicionais.
- [x] Documentar a custódia de chave individual em token/HSM ou serviço gerenciado e proibir armazenamento em GitHub e nas VMs.
- [ ] Preparar a assinatura SHA-256 com carimbo de tempo RFC 3161 dos binários do Assistente e do instalador final.
- [x] Documentar a futura migração do certificado individual para certificado organizacional quando houver entidade empresarial formalizada.

## IMPLEMENTAÇÃO EFETIVA DA CONFIANÇA WINDOWS — ASSISTENTE RADIANT

- [ ] Selecionar emissor de certificado IV que confirme elegibilidade de pessoa física residente no Brasil e assinatura Authenticode pública.
- [ ] Concluir fora do projeto a validação individual e a contratação de custódia não exportável para a chave de assinatura.
- [ ] Integrar o certificado emitido ao processo controlado de assinatura do Assistente e do instalador, com SHA-256 e RFC 3161.
- [ ] Substituir na VM1 somente o instalador cuja assinatura digital e hash tenham sido verificados.
- [ ] Validar em Windows limpo o publicador individual, a integridade do instalador e o comportamento SmartScreen antes de ampliar a distribuição.

## RECONCILIAÇÃO DA AUDITORIA EXTERNA V8 — 18/08/2026

- [x] Reconciliar as afirmações da auditoria externa v8 com o código, o estado de deploy da VM1 e a infraestrutura real das três VMs.
- [ ] Decidir a política de permissão para exclusão de áudios e anexos clínicos, separando leitura de exclusão quando aplicável.
- [ ] Remover ou proteger explicitamente o módulo legado `storageProxy` antes de qualquer eventual reativação.
- [ ] Priorizar os gargalos remanescentes de desempenho e as pendências de infraestrutura confirmadas pela auditoria.

## DESEMPENHO E ESTABILIDADE DE PRODUÇÃO — ROTAS CRÍTICAS

- [ ] Mapear consumo de tempo, memória e tamanho de resposta das rotas DICOMweb, cache DICOM, mídia privada e competência financeira.
- [x] Substituir o buffer completo no proxy DICOMweb por streaming com tratamento de erro e cabeçalhos preservados.
- [x] Remover I/O síncrono das rotas administrativas de cache DICOM e do caminho de cache do visualizador.
- [x] Investigar e reduzir consultas N+1 em `calculateCompetence` sem alterar resultados financeiros.
- [x] Cachear por data, unidade e responsável as consultas repetidas de vigência durante uma única apuração de competência, preservando o preço padrão já usado no cálculo.
- [ ] Cobrir em teste a preservação de preços por modalidade e vigência após reduzir consultas da apuração financeira.
- [ ] Definir limites de concorrência, memória e timeout para C-GET/DICOM e downloads extensos.
- [ ] Executar testes de regressão e carga controlada antes de qualquer atualização da VM1.
- [x] Coletar na VM1 métricas somente-leitura de PM2, Node, CPU, RAM, conexões e latência das rotas críticas.
- [x] Sanitizar a coleta de rotas Nginx para remover parâmetros de consulta antes de apresentar métricas agregadas.
- [x] Validar pós-deploy a abertura de imagens no navegador e no RadiAnt, sem erro técnico nos registros monitorados.

## CACHE DE ORDENAÇÃO DICOM — ROTAS DE MAIOR VOLUME

- [x] Cachear por estudo a ordenação e os metadados de cabeçalho DICOM para evitar releitura repetida das mesmas fatias.
- [x] Invalidar o cache de ordenação ao receber, limpar ou expirar um estudo do cache local.
- [x] Validar que cache de ordenação não altera a autorização por usuário/unidade nem a sequência clínica de fatias.
- [x] Registrar a validação em produção de duas aberturas consecutivas do mesmo estudo com sequência clínica preservada.

## HARDENING DEFENSIVO — NGINX E LINUX

- [x] Inventariar somente por leitura portas expostas, serviços, UFW, Nginx, SSH e atualizações pendentes nas VMs do PACS.
- [x] Restringir a exposição externa da VM1 às portas e rotas estritamente necessárias ao Portal.
- [ ] Configurar cabeçalhos HTTP defensivos, limites de requisição e bloqueios de caminhos indevidos no Nginx sem afetar DICOM, mídia privada ou viewers externos.
- [x] Aplicar cabeçalhos HTTP defensivos, limite conservador de conexões e bloqueio Nginx validado para caminhos sensíveis na VM1.
- [ ] Reforçar SSH, atualizações de segurança, usuários e serviços Linux sem interromper acesso administrativo legítimo.
- [ ] Implementar monitoramento de tentativas de acesso anormais, falhas de autenticação e erros Nginx/Portal.
- [x] Habilitar Fail2Ban para SSH e varreduras Nginx inequivocamente abusivas, excluindo as redes privadas administrativas.
- [ ] Documentar aplicação, validação e reversão de cada controle por VM antes de modificar produção.

## CORREÇÃO DE BLOQUEIO NGINX — CAMINHOS SENSÍVEIS

- [x] Diagnosticar a resposta 200 inicial para `/.git/HEAD` e confirmar na configuração efetivamente carregada o retorno correto 404.
- [x] Concluir que não foi necessária substituição de localização, pois a regra regex efetivamente carregada bloqueia o caminho sensível com 404.
- [x] Confirmar que a regra regex efetivamente carregada retorna 404 para `/.git/HEAD`, sem alteração adicional de localização.

## VALIDAÇÃO DE IDENTIDADE SSH — VM1

- [x] Confirmar pelo console atual a impressão digital SSH da VM1 antes de aceitar ou atualizar entrada no computador administrativo.
- [ ] Validar nova sessão do usuário operacional somente por chave antes de desabilitar senha ou login remoto de root.

## REDUÇÃO DE EXPOSIÇÃO EXTERNA — ACESSO ADMINISTRATIVO

- [x] Confirmar redes privadas administrativas que devem manter acesso SSH à VM1 antes de remover a regra pública da porta 22.
- [x] Remover exposição pública de SSH da VM1, mantendo somente as redes privadas administrativas autorizadas.
- [x] Manter assinatura de código Windows como pendência comercial separada do hardening de rede e servidor.
- [x] Manter assinatura de código Windows como pendência comercial separada do hardening de rede e servidor.

## AJUSTE DE FAIXA SSH INTERNA — VM1

- [x] Registrar a decisão de manter a regra UFW normalizada `172.16.0.0/22` para a rede interna administrativa controlada.
- [x] Manter por decisão aprovada a faixa interna `172.16.0.0/22` e concentrar o hardening em acessos externos à VM1.
- [x] Validar Portal HTTPS, bloqueio de caminho sensível, UFW e Fail2Ban após o hardening externo da VM1.

## HARDENING DEFENSIVO — VM2 E VM3

- [x] Inventariar somente por leitura portas expostas, UFW, MySQL, PostgreSQL, atualizações e serviços residuais da VM2.
- [x] Inventariar somente por leitura portas, UFW, MinIO, RAID e atualizações pendentes da VM3.
- [ ] Restringir cada serviço das VMs 2 e 3 somente às origens internas necessárias ao Portal PACS.
- [x] Documentar as decisões de exposição, validação e reversão por VM.
- [x] Restringir SSH da VM2 às redes privadas aprovadas e habilitar Fail2Ban sem alterar MySQL ou PostgreSQL.
- [x] Instalar o pacote Fail2Ban ausente na VM2 e validar o jail padrão de SSH após a restrição de firewall.
- [x] Restringir SSH da VM3 à rede interna aprovada e habilitar Fail2Ban sem alterar MinIO, RAID ou console fechado.
- [x] Instalar o pacote Fail2Ban ausente na VM3 e validar o jail padrão de SSH após a restrição de firewall.

## AUDITORIA DEFENSIVA — CÓDIGO DO PORTAL

- [x] Revisar autenticação, criação de sessão, atributos de cookies e fluxos de logout do Portal.
- [x] Revisar autorização das rotas clínicas REST e tRPC prioritárias, verificando isolamento por usuário e unidade.
- [x] Revisar uploads, download de arquivos privados, cabeçalhos HTTP e validação de origem.
- [x] Exigir autorização por estudo nas rotas de leitura e gravação de anotações Cornerstone.
- [x] Restringir o módulo de áudio e anexos aos papéis `medico` e `operador`; operador terá apenas consulta e reprodução.
- [x] Permitir gravação e exclusão de áudios e anexos somente ao médico autor do item; bloquear `viewer` e demais papéis.
- [x] Validar em worktree isolado na VM1 a compilação da política clínica de mídia antes do reinício do serviço.
- [x] Atualizar controladamente a VM1 para a política clínica de mídia e validar PM2, HTTP local e erros-alvo.
- [x] Executar auditoria de dependências e classificar vulnerabilidades por impacto no Portal.
- [x] Implementar e testar no sandbox as correções confirmadas de streaming, anamnese, readiness e duração de sessão OAuth.
- [x] Validar build completo do frontend de segurança antes de atualizar a VM1.
- [x] Executar na VM1 uma compilação isolada do commit auditado em `git worktree`, sem modificar o diretório ativo nem reiniciar o PM2.
- [x] Atualizar a VM1 de forma controlada após build isolado aprovado, reiniciando o PM2 somente após a geração dos artefatos.
- [x] Validar pós-deploy na VM1 o commit aplicado, o HTTP local, o estado do PM2 e a ausência de erros-alvo.

## CORREÇÃO P0 — AUTORIZAÇÃO DO STREAMING DICOM

- [x] Exigir autorização explícita por estudo na rota `/api/dicom-stream/:studyUid` antes de reutilizar cache ou iniciar C-GET.
- [x] Cobrir acesso negado, acesso autorizado e troca de unidade na rota de streaming DICOM.

## ACHADOS PRIORITÁRIOS DA AUDITORIA DE CÓDIGO

- [x] Alinhar expiração do cookie e JWT emitidos pelo callback OAuth à duração configurada de sessão.
- [x] Exigir autorização individual por estudo nas rotas de status em lote de anamnese, áudios e anexos.
- [ ] Revisar procedimentos financeiros e de layout que recebem `unitId` do cliente, comparando-os à política de papéis e unidades antes de qualquer alteração.
- [x] Exigir `assertCanAccessFinancialUnit` em `financeSimple.doctorSummaryByUnit` antes de retornar médicos, valores e preços de uma unidade.
- [x] Exigir `assertCanAccessFinancialUnit` em `financeSimple.getPriceConfig` e `financeSimple.getUnitDefaultPrices` antes de retornar configurações financeiras de uma unidade.
- [x] Exigir `view_studies` em `layouts.getByUnit` antes de retornar o layout solicitado por unidade.
- [x] Restringir `financeSimple.dashboard` e `financeSimple.unitSummary` às unidades ativamente vinculadas ao responsável financeiro logado.
- [x] Impedir que um responsável financeiro consulte o painel completo de outro responsável em `financeSimple.getResponsibleFullDashboard`.
- [x] Exigir acesso financeiro por unidade em `financeSimple.getCycleConfig` e `financeSimple.listUnitCycles`.
- [x] Restringir `financeSimple.listTeamMembers`, `addTeamMember` e `removeTeamMember` ao administrador da unidade alvo.
- [x] Remover a rota financeira legada `createVisitEvent`, sem consumidores ativos, para impedir criação manual de eventos de cobrança fora do fluxo de assinatura de laudo.
- [ ] Classificar e atualizar dependências vulneráveis em lote compatível com o visualizador DICOM e o Portal.
- [ ] Atualizar a resolução transitiva de `path-to-regexp` para 0.1.13 e validar as rotas Express sem alterar o visualizador DICOM.
- [x] Atualizar o inventário de produção e separar correções transitivas de baixo risco das cadeias Cornerstone/vtk.js que exigem validação visual.
- [x] Aplicar apenas correções de dependências de baixo risco no sandbox, mantendo o visualizador DICOM inalterado até a validação clínica.
- [x] Migrar os overrides e a permissão de scripts de build do `package.json` para `pnpm-workspace.yaml`, conforme a configuração exigida pelo pnpm instalado.
- [x] Fixar no workspace as correções transitivas compatíveis de `path-to-regexp`, `body-parser`, `follow-redirects`, `form-data`, `lodash` e `lodash-es`, sem atualizar Express, Axios, Archiver ou Cornerstone diretamente.
- [x] Atualizar a fixação do gerenciador pnpm para uma versão que reconheça `pnpm-workspace.yaml` e validar os overrides em cópia temporária antes de alterar o lockfile principal.
- [x] Validar na VM1, em worktree isolado, o pnpm 10.30.1, o lockfile corrigido e o build da atualização transitiva antes de reiniciar o Portal.
- [x] Atualizar controladamente a VM1 para as correções transitivas somente após a validação isolada aprovada.
- [ ] Reavaliar o inventário remanescente e atualizar Mermaid para uma versão corrigida compatível no sandbox, sem alterar Streamdown ou o visualizador DICOM diretamente.
- [ ] Executar regressão de Markdown/diagramas, TypeScript e build após a atualização isolada de Mermaid.
- [x] Diagnosticar a tela em branco relatada após a atualização de dependências, coletando console, rede e estado dos artefatos da VM1 antes de qualquer ação corretiva.
- [x] Recuperar o Portal por atualização corretiva ou reversão controlada somente após isolar a causa da tela em branco.
- [x] Declarar o *shim* seguro de `global` no bootstrap do cliente e cobrir a ausência de `ReferenceError` no bundle de navegador.
- [x] Validar em sandbox, worktree e pós-deploy a recuperação da interface após o erro `global is not defined`.
- [x] Mapear o cache local e a rota atual de carregamento DICOM para invalidar somente o estudo aberto.
- [x] Expor uma invalidação autorizada do cache DICOM por estudo, sem afetar outros exames em carregamento.
- [x] Exigir `view_studies` também na rota existente de exclusão de cache por estudo antes de reutilizá-la para recarga.
- [x] Cancelar o C-GET do estudo quando o cliente encerrar o streaming, evitando concorrência entre limpeza e download ativo.
- [x] Adicionar no visualizador um botão de recarga com confirmação e retorno ao PACS após a limpeza do estudo aberto.
- [x] Preservar o visualizador atual se a invalidação do cache do estudo falhar durante a recarga.
- [x] Cobrir a recarga de cache por estudo com testes de autorização, invalidação e regressão do visualizador.
- [x] Validar, na VM1 e em worktree temporário, o build completo de produção antes de atualizar o Portal com a recarga de cache.
- [x] Atualizar controladamente a VM1 com o commit validado, gerar artefatos no diretório ativo, reiniciar o PM2 somente após build aprovado e executar checagem pós-deploy.
- [x] Avaliar a desativação do relatório de tamanho comprimido do Vite; revertida porque a limitação de memória ocorreu antes da conclusão de chunks e a configuração não seria eficaz.
- [x] Corrigir a recarga DICOM que permanece na tela de carregamento após receber 100% dos arquivos do estudo.
- [x] Validar em worktree temporário da VM1 o build completo da correção de finalização da recarga antes de atualizar o Portal.
- [x] Atualizar controladamente a VM1 com a correção de finalização da recarga e validar o retorno do visualizador após 100% dos arquivos.
- [x] Investigar legendas e nomes de exames exibidos incorretamente, conferindo a origem DICOM, as transformações do Portal e os rótulos da interface antes de alterar dados clínicos.
- [x] Projetar um catálogo global de exames, administrado somente pelo administrador raiz, que defina legenda canônica, quantidade de laudos e regra de evento financeiro.
- [x] Garantir que o catálogo permita múltiplos documentos e assinaturas independentes por exame, com quantidade de eventos financeiros configurável pelo administrador raiz.
- [x] Aplicar um evento financeiro por documento assinado, calculado pelo preço vigente configurado para médico, unidade e modalidade.
- [x] Permitir assinatura clínica sem preço, registrando evento financeiro pendente sem valor e orientando o médico a procurar o administrador quando desejar usar o módulo financeiro.
- [x] Exibir ao médico seu faturamento e seus eventos pendentes de preço separados por unidade.
- [x] Permitir que admin_master e responsável financeiro autorizado configurem preços por médico, unidade e modalidade, sempre com vigência futura por ciclo e sem alterar eventos já assinados.
- [x] Restringir ao admin_master a criação de exames e o mapeamento de descrições PACS para legendas canônicas, exibindo a descrição original quando não houver correspondência.
- [x] Validar em worktree temporário da VM1 o build completo e revisar a migração 0048 antes de aplicar catálogo, documentos e preços históricos em produção.
- [x] Executar diagnóstico somente leitura e aplicar controladamente a migração 0048 na VM2, preservando laudos e eventos existentes.
- [x] Atualizar controladamente a VM1 após a migração 0048 aprovada na VM2 e executar verificação pós-deploy.
- [ ] Redesenhar o módulo financeiro por perfil: administração geral, responsável financeiro por unidade e médico.
- [ ] Integrar gestão de usuários da unidade, preços médicos, produção de laudos e obrigações da unidade em uma jornada administrativa coerente.
- [ ] Exibir ao responsável financeiro usuários, produção médica e eventos devidos à LAUDS somente dentro das unidades vinculadas.
- [ ] Permitir ao responsável financeiro criar e gerir somente médicos, operadores e visualizadores da própria unidade, preservando histórico em desativação ou desvinculação.
- [ ] Restringir ao admin_master a quitação de obrigações da unidade com a LAUDS; o responsável financeiro poderá apenas consultar esse status.
- [ ] Permitir ao responsável financeiro marcar pagamento apenas de médicos que ele próprio cadastrou ou vinculou na unidade autorizada.
- [ ] Restringir o módulo financeiro aos perfis médico e responsável financeiro, apresentando cada unidade como contexto financeiro independente sem consolidação cruzada.
- [ ] Permitir ao admin_master assumir ou trocar o responsável financeiro de qualquer unidade, preservando os vínculos, históricos e poderes operacionais da unidade.
- [ ] Permitir ao responsável financeiro da unidade criar novas contas ou vincular contas existentes somente como médico, operador ou visualizador.
- [ ] Preparar prévias visuais das telas de responsável financeiro, médico e supervisão do administrador geral antes da implementação do novo ambiente.
- [ ] Adotar no painel do médico uma composição operacional com tabela de documentos à esquerda, resumo e preços por modalidade à direita e contexto explícito de uma única unidade.
- [ ] Implementar a tela Meu Financeiro do médico com a composição visual aprovada, usando dados reais e isolados por unidade.

## CORREÇÃO P1 — READINESS POR ESTUDO E UNIDADE

- [x] Exigir autorização por estudo e unidade em `readiness.getByStudy` antes de retornar dados clínicos.
- [x] Filtrar `readiness.getBatchStatus` por estudos autorizados e pela unidade efetivamente relacionada ao estudo.
- [x] Cobrir acesso negado e acesso autorizado nas rotas de readiness individual e em lote.

## IMPLANTAÇÃO CONTROLADA — CATÁLOGO CLÍNICO-FINANCEIRO

- [x] Aplicar a migração 0050 na VM2 a partir do artefato versionado, sem depender de cópia local do repositório.
- [x] Publicar o commit 4fdcda7 no GitHub e confirmar que a VM1 recebe o mesmo hash remoto antes da atualização.
- [x] Atualizar a VM1 para bb11b49 após build isolado aprovado e validar PM2, HTTP local e logs pós-reinício.

## PRÓXIMA ETAPA — TELAS FINANCEIRAS POR PERFIL

- [x] Auditar as rotas, queries e permissões já existentes do responsável financeiro e do administrador geral.
- [x] Definir e documentar o contrato de dados, isolamento por unidade e permissões das telas financeiras por perfil.
- [ ] Completar o ambiente do responsável financeiro com unidade isolada, participantes, preços, produção, pagamentos médicos e obrigação LAUDS somente leitura.
- [ ] Completar a supervisão do administrador geral com troca de responsável, ciclo, preço LAUDS e confirmação de recebimento por unidade.
- [ ] Cobrir as telas financeiras por perfil com regressões de isolamento, RBAC e interface.

## REVISÃO SOLICITADA — FLUXO DE SELEÇÃO DE EXAMES

- [x] Validar com o usuário o papel do modal de seleção múltipla de exames e sua relação com a legenda canônica obrigatória antes de retomar implementações.
- [x] Substituir o seletor suspenso em cada linha pelo acionador e modal visual de seleção de exames solicitado pelo usuário.
- [x] Exibir no modal botões pesquisáveis e agrupados por modalidade, alimentados exclusivamente pelas legendas canônicas ativas cadastradas pelo administrador.

## CORREÇÃO — LEGENDA CANÔNICA NÃO REFLETIDA NA LISTAGEM

- [x] Diagnosticar a divergência entre a seleção persistida da legenda canônica e o nome exibido na página principal.
- [x] Priorizar a legenda canônica selecionada na listagem e manter a descrição PACS somente como alternativa quando não houver seleção.

## REDESENHO — CATÁLOGO DE EXAMES

- [x] Reorganizar a página do catálogo para priorizar busca, filtros, estado dos exames e ações de administração, sem criar dados de exemplo.
- [x] Tornar a configuração de legenda, documentos clínicos, eventos financeiros e mapeamentos PACS mais compreensível e prática.

## CORREÇÃO — FALHA AO SALVAR CATÁLOGO

- [x] Diagnosticar e corrigir a falha de gravação ao editar uma legenda canônica existente.

## CORREÇÃO — MODAL EXIBE POUCAS LEGENDAS

- [x] Diagnosticar por que o modal de seleção mostra apenas duas legendas para o estudo e corrigir o filtro confirmado.

## REESTRUTURAÇÃO — CATÁLOGO SELECIONÁVEL POR MODALIDADE

- [x] Auditar os 213 exames pré-definidos, sua origem e dependências antes de qualquer exclusão.
- [x] Remover somente os exames pré-definidos após validação, preservando os criados pelo administrador e qualquer histórico vinculado.
- [x] Substituir a lista direta por modal de modalidades CT, RM, CR e US, seguido da lista de exames cadastrados pelo administrador.

## DIAGNÓSTICO — CADASTRO DE NOVA LEGENDA

- [x] Monitorar uma tentativa real de cadastro para correlacionar a requisição, os logs do Portal e a persistência no banco.
- [x] Atualizar ou invalidar a consulta de legendas do modal após um novo cadastro para refletir imediatamente o catálogo ativo.

## AJUSTE VISUAL — RESUMO FINANCEIRO DESKTOP

- [x] Compactar ciclo, quantidade de laudos e valor do ciclo em uma única faixa curta no lado esquerdo do desktop, sem alterar a apresentação móvel.

## CORREÇÃO — LOGIN MÓVEL

- [x] Reorganizar a página de login móvel para eliminar a sobreposição entre marca, formulário, suporte e créditos.

## SUSPENSÃO — PROTÓTIPO DE ANAMNESE E MAPA ANATÔMICO

- [x] Suspender a implantação da migração 0052 e da anamnese estruturada experimental, pois o mapa corporal não atingiu o padrão visual solicitado.
- [x] Retornar o sandbox ao checkpoint estável anterior ao protótipo, preservando VM1 e VM2 sem alterações.
- [ ] Retomar o redesenho somente após aprovação visual prévia de um mapa anatômico funcional, antes de qualquer integração clínica.

## CORREÇÃO — SLA CLÍNICO APÓS ANAMNESE

- [x] Mapear a regra existente: o prazo é exclusivo da configuração de SLA da unidade; Urgência e Prioridade máxima são apenas sinalizações clínicas e não alteram a contagem.
- [x] Confirmar na VM2 que a anamnese válida inicia e persiste o SLA conforme a configuração vigente da unidade, sem alterar o questionário existente.
- [x] Reposicionar o indicador de SLA para ficar ao lado da prioridade clínica, preservando o mesmo prazo da unidade e exibindo estado vencido inequívoco.
- [x] Exibir um estado clínico discreto de pronto para laudar ao lado da prioridade quando houver anamnese sem prazo histórico de SLA.
- [x] Cobrir o cálculo, a autorização e a interface com regressões antes de atualizar a VM1.

## AUDITORIA V11 — DIVERGÊNCIAS CLÍNICO-FINANCEIRAS

- [x] Impedir que o reprocessamento financeiro legado crie cobrança duplicada para estudos já cobertos pelo catálogo clínico-financeiro.
- [x] Remover definitivamente o código morto de preços do cadastro de usuários e sua consulta financeira residual.
- [x] Bloquear a alteração de legenda canônica na primeira assinatura, conforme a regra documentada.

## EVOLUÇÃO — COMPOSIÇÃO DE LEGENDAS E DISPONIBILIDADE POR UNIDADE

- [x] Modelar seleção de múltiplas legendas canônicas no mesmo estudo, preservando as seleções e eventos já existentes.
- [x] Permitir marcar várias legendas no modal e confirmar a composição em uma única ação auditável.
- [x] Gerar laudos separados para cada legenda selecionada e para cada documento configurado em sua própria legenda.
- [x] Somar eventos financeiros por legenda concluída, mantendo a origem do valor identificável no extrato e sem consolidar laudos distintos.
- [x] Manter bloqueio individual de cada legenda após a primeira assinatura de um documento dela.
- [x] Permitir ao admin_master definir as unidades autorizadas a visualizar e selecionar cada legenda canônica, inicialmente habilitada para todas as unidades.
- [x] Filtrar o modal clínico para exibir somente as legendas disponíveis na unidade atual.
- [x] Criar migração aditiva, testes de regressão e procedimento seguro para aplicação controlada na VM2.

## IMPLANTAÇÃO CONTROLADA — MIGRAÇÃO 0051 E COMPOSIÇÃO DE LEGENDAS

- [x] Executar diagnóstico e backup consistente na VM2 antes da migração 0051.
- [x] Aplicar e verificar a migração 0051 na VM2 antes de qualquer atualização da VM1.
- [x] Atualizar a VM1 para o commit 0b495d7 somente após a confirmação da VM2.
- [x] Validar serviço da VM1 após a implantação (commit dee1f65, PM2 online, HTTP local 200 e logs aprovados).
- [ ] Validar a composição de duas legendas em estudo clínico controlado após a implantação.

## CORREÇÃO — INDICADOR VISUAL DE NOME DO PACIENTE

- [x] Diagnosticar a divergência entre nomes padrão e nomes com aparência de edição na listagem PACS.
- [x] Uniformizar cor, tipografia e ícone do nome do paciente conforme o estado real de correção persistida.
- [x] Adicionar regressão de interface, validar no sandbox e versionar a correção antes de atualizar a VM1.

## DIAGNÓSTICO — LENTIDÃO GERAL DO PORTAL EM PRODUÇÃO

- [x] Coletar métricas somente leitura da VM1, PM2, Node, Nginx e latência HTTP durante a lentidão reportada.
- [x] Correlacionar os sinais com conexões e espera do banco/PACS sem reiniciar ou alterar serviços.
- [ ] Classificar a causa provável e propor a próxima ação segura com evidências.

## OTIMIZAÇÃO — RENDERIZAÇÃO DE ESTUDOS DICOM GRANDES

- [x] Mapear a preparação de imagens, cache, ordenação e abertura do visualizador após C-GET.
- [x] Eliminar trabalho repetitivo e bloqueio do fluxo principal ao preparar estudos com muitas imagens.
- [x] Implementar carregamento progressivo seguro, sem alterar arquivos DICOM, série clínica ou integrações externas.
- [x] Criar regressões de desempenho, validar build e versionar a otimização antes de atualizar a VM1.

## REVISÃO RESPONSIVA — LISTAGEM PACS POR PERFIL

- [x] Auditar a composição dos cartões móveis e da tabela desktop para operador, atendente, médico e visualizador.
- [x] Separar no mobile os indicadores clínicos, o estado do laudo e os controles de prioridade para evitar sobreposição e quebra de texto.
- [x] Preservar no desktop a tabela completa, com informações clínicas alinhadas e sem alterar permissões por perfil.
- [x] Adicionar regressões de interface para os dois breakpoints e validar build antes de atualizar a VM1.

## REVISÃO MÓVEL — VISUALIZADOR DICOM

- [x] Auditar os contêineres e controles que geram rolagem vertical ou navegação duplicada no visualizador móvel.
- [x] Manter apenas uma navegação de imagens, posicionada na lateral direita e independente da rolagem da página.
- [x] Substituir a instrução de rolagem pelo resumo de anamnese, preservando o acesso clínico e evitando espaço excedente.
- [x] Ajustar o enquadramento da imagem móvel para composição horizontal lateral, sem centralização artificial e sem cortar conteúdo diagnóstico.
- [x] Criar regressões móveis, validar build e versionar antes de atualizar a VM1.

## AJUSTE MÓVEL — FERRAMENTAS E ANAMNESE NO VISUALIZADOR

- [x] Auditar as ferramentas existentes de contraste, zoom, pan, medida e manipulação para reaproveitá-las no rodapé móvel.
- [x] Criar um rodapé móvel compacto e acessível com as ferramentas clínicas, sem recuperar rolagem vertical da página.
- [x] Remover caixa, borda e fundo da anamnese móvel, preservando apenas ícone e texto legíveis sobre o canvas.
- [x] Criar regressões, validar build e versionar a atualização antes de atualizar a VM1.

## AJUSTE MÓVEL — NOME DA UNIDADE NO CABEÇALHO

- [x] Auditar o espaço reservado à unidade e ao menu no cabeçalho móvel.
- [x] Reposicionar e ampliar a área de exibição do nome da unidade, preservando o acesso ao menu.
- [x] Cobrir a apresentação de nomes longos, validar build e versionar antes de atualizar a VM1.

## AJUSTE MÓVEL — CABEÇALHO, UNIDADES E RESUMO FINANCEIRO

- [x] Ajustar o alinhamento do nome da unidade para leitura da direita para a esquerda, sem centralização visual.
- [x] Auditar e habilitar a troca de unidade para médicos vinculados a mais de uma unidade, mantendo as restrições de acesso por vínculo.
- [x] Reduzir em aproximadamente 50% a altura do resumo móvel de Ciclo, Assinados e Receber, sem comprometer a legibilidade.
- [x] Adicionar regressões de interface e autorização, validar build e versionar antes de atualizar a VM1.

## SINALIZAÇÃO CLÍNICA — ALERTA CRÍTICO

- [x] Substituir a terminologia exibida de Prioridade máxima por Alerta Crítico, preservando o valor interno e as permissões atuais.
- [x] Adicionar um indicador visual discreto e pulsante próximo ao nome do paciente apenas para estudos em Alerta Crítico.
- [x] Cobrir desktop e mobile com regressões de interface e validar build antes de atualizar a VM1.

## CORREÇÃO — SINALIZAÇÃO DE ANAMNESE PREENCHIDA

- [x] Auditar a consulta e o mapa de status de anamnese usados pela listagem por unidade.
- [x] Fazer o ícone de anamnese preenchida ficar verde de modo consistente no desktop e no mobile, para todos os perfis autorizados.
- [x] Cobrir o caso de regressão, validar build e versionar antes de atualizar a VM1.

## CORREÇÃO — STATUS DE ASSINATURA E MÉDICO RESPONSÁVEL

- [x] Auditar a origem do status Assinado na listagem, os documentos do estudo e a identificação do médico assinante.
- [x] Corrigir qualquer divergência entre editor, listagem e autoria da assinatura, preservando trilha de auditoria.
- [x] Apresentar claramente o médico responsável pela assinatura quando o estudo estiver concluído, em desktop e mobile.
- [x] Cobrir cenários de regressão, validar build e versionar antes de atualizar a VM1.

## CORREÇÃO — RECONHECIMENTO DE LAUDO NO EDITOR

- [x] Auditar como o estudo selecionado transmite unidade e documento ao editor de laudo.
- [x] Fazer o editor reconhecer o laudo assinado existente e exibir Retificar/Apagar conforme autorização do médico e do admin_master.
- [x] Preservar exclusão auditada, motivo obrigatório do admin_master e bloqueios de permissão existentes.
- [x] Cobrir cenários de regressão, validar build e versionar antes de atualizar a VM1.

## PROPOSTA VISUAL — ORGANIZAÇÃO DE UNIDADE E FINANCEIRO

- [x] Criar e apresentar uma prévia anotada das abas operacionais da unidade e das abas financeiras, com legendas funcionais, antes de alterar o cadastro real.
- [ ] Reorganizar o futuro módulo financeiro para que a cobrança por evento financeiro seja a modalidade principal; cobrança mensal será apenas uma alternativa comercial configurável.
- [x] Simplificar o cadastro de Unidade para dados cadastrais, operacionais e clínicos, removendo moeda e todos os campos financeiros da interface.
- [x] Manter a aba Médicos limitada ao vínculo e à autorização clínica por unidade, sem preços ou custos profissionais.
- [ ] Criar no Financeiro a configuração por unidade para valores de eventos e custos dos médicos vinculados, preservando regras de vigência e auditoria.

## CATÁLOGO CLÍNICO — ORGANIZAÇÃO DO FORMULÁRIO

- [x] Reorganizar o formulário de cadastro e edição de legenda canônica em cartões menores, preservando documentos, eventos, disponibilidade por unidade e mapeamentos PACS.
- [x] Remover o campo Ordem da interface; manter a ordenação automática por modalidade e nome, preservando o valor legado no banco sem migração destrutiva.
- [x] Cobrir a nova organização com testes de regressão e validar o build antes de publicar.

## CATÁLOGO CLÍNICO — LISTAGEM EM CARTÕES

- [x] Substituir as linhas largas da listagem principal do catálogo por cartões compactos e escaneáveis, preservando indicadores, filtros e botão Configurar.
- [x] Tornar visualmente clara a distinção entre os cartões da listagem e o formulário aberto por Configurar.
- [x] Validar a nova listagem no desktop e no mobile, com regressões e build antes de publicar.

## CATÁLOGO CLÍNICO — GRADE DENSA

- [x] Reduzir a altura dos cartões do catálogo e exibir quatro colunas no desktop para acomodar muitas legendas.
- [x] Manter na listagem apenas nome, modalidade, situação, contadores essenciais e acesso a Configurar; detalhes permanecem no formulário.
- [x] Cobrir a grade densa com regressões e validar build antes de publicar.

## CORREÇÃO — ATUALIZAÇÃO DA LISTAGEM EM PRODUÇÃO

- [x] Confirmar por diagnóstico somente leitura o remoto e a disponibilidade do commit 041705e na VM1.
- [x] Aplicar somente após confirmação a atualização controlada da listagem em cartões na VM1 e validar o commit ativo.

## CORREÇÃO — COMPOSIÇÃO DE LEGENDAS

- [x] Permitir remover uma legenda já selecionada diretamente no modal de composição antes da confirmação.
- [x] Preservar as regras de bloqueio clínico e a substituição auditável ao confirmar a nova composição.
- [x] Cobrir remoção, substituição e casos bloqueados por regressões antes de publicar.

## AUDITORIA — AUTORIZAÇÃO DO EDITOR DE LAUDOS

- [x] Revisar onde a permissão de laudar é exibida, gravada e aplicada no editor e nas rotas de laudo.
- [x] Separar a administração de permissões, exclusiva do admin_master, da autorização clínica para redigir, assinar e retificar laudos.
- [x] Apresentar a matriz de acesso proposta antes de alterar regras clínicas já em produção; escopo corrigido pelo solicitante para Modelos de Laudo.

## CORREÇÃO — ADMINISTRAÇÃO DE MODELOS DE LAUDO

- [x] Revisar as rotas, telas e permissões que permitem criar, editar ou excluir Modelos de Laudo.
- [x] Tornar a administração dos modelos exclusiva do admin_master e remover a permissão configurável de outros perfis.
- [x] Preservar integralmente a edição, assinatura e retificação clínica de laudos pelos médicos autorizados.

## REFORMULAÇÃO — MÓDULO FINANCEIRO E LEGENDAS

- [x] Inventariar os dados, regras, rotas e telas financeiras atuais antes de qualquer substituição.
- [x] Mapear como as legendas canônicas, documentos clínicos, eventos financeiros e preços se relacionam hoje.
- [x] Definir uma arquitetura financeira nova, orientada a eventos, preservando laudos e histórico existentes.
- [ ] Implementar a reformulação somente após aprovação explícita do novo fluxo e do plano de migração.

## FINANCEIRO V2 — REGRAS E PROPOSTA VISUAL

- [ ] Registrar que a legenda define composição clínica e quantidade de eventos, mas não determina preços.
- [ ] Modelar a precificação por unidade, modalidade e médico, com vigência contínua até uma alteração autorizada.
- [ ] Criar propostas visuais do painel do admin_master com unidades, médicos, preços por evento, movimentação, pagamentos e margem do sistema.
- [ ] Definir a regra de distribuição de pagamento quando documentos de uma composição forem assinados por médicos diferentes.

## FINANCEIRO V2 — CATÁLOGO E DETALHE POR UNIDADE

- [x] Projetar a entrada do admin_master como caixas de unidades, cada uma com resumo de ciclo, eventos, faturamento do sistema e total de repasses médicos.
- [x] Projetar o detalhe da unidade com preço LAUDS por evento, total de eventos e faturamento do ciclo, preços da unidade por modalidade, tabela editável de médicos por modalidade e total individual do médico no ciclo.
- [x] Gerar mockups revisados desse fluxo antes de qualquer implementação do Financeiro v2.

## FINANCEIRO V2 — IMPLEMENTAÇÃO VISUAL NO SANDBOX

- [x] Implementar a página inicial do Financeiro como catálogo de unidades com métricas resumidas por ciclo.
- [x] Implementar a tela de detalhe por unidade com taxa LAUDS por evento, eventos do ciclo, soma para o sistema, preços por modalidade e tabela de médicos.
- [x] Preservar temporariamente as regras e os dados existentes, sem migração de banco nem mudança de cálculo nesta fase visual.
- [x] Validar o fluxo no sandbox com testes e build antes de apresentar para revisão.

## CORREÇÃO — ROTA FINANCEIRA EM BRANCO

- [x] Garantir que a rota /financeiro aguarde a autenticação e redirecione para login ou catálogo, sem página vazia.
- [x] Revalidar a navegação do sandbox até o Financeiro v2 após a correção.

## CORREÇÃO — BOTÃO PRINCIPAL FINANCEIRO

- [x] Redirecionar todos os botões Financeiro do cabeçalho principal para o catálogo financeiro por unidade, sem encaminhar ao ambiente legado de pagamentos.
- [x] Validar no sandbox que o clique no botão Financeiro abre o Financeiro v2 para admin_master e unit_admin.

## FINANCEIRO V2 — ROTAS POR UNIDADE

- [x] Apontar o botão Financeiro para /financeiro/dashboard como entrada explícita do catálogo de unidades.
- [x] Criar a rota /financeiro/dashboard/:unitSlug para abrir diretamente o detalhe financeiro da unidade escolhida.
- [x] Validar URLs diretas, navegação de retorno e build antes de prosseguir com outras modificações do Financeiro v2.

## FINANCEIRO V2 — DETALHE DA UNIDADE REVISADO
- [x] Retirar do detalhe a referência a mês específico, margem atual, soma individual por médico e total de repasses médicos.
- [x] Manter taxa LAUDS por evento com vigência de ciclo, eventos do ciclo e soma para o sistema em posição de destaque.
- [x] Substituir preço da unidade por valor vigente por modalidade, iniciado em zero e editável como padrão para médicos sem preço individual.
- [x] Redesenhar a tabela de médicos com edição direta por modalidade e métrica de total no ciclo por linha.
- [x] Gerar propostas visuais revisadas antes de alterar a tela do sandbox.

## FINANCEIRO V2 — CONFIGURAÇÃO VIGENTE POR UNIDADE
- [x] Persistir taxa LAUDS por evento com início, término, status de ciclo e autoria auditável.
- [x] Persistir valores padrão da unidade por modalidade, aplicáveis aos médicos sem valor individual, dentro da vigência do ciclo.
- [x] Persistir valores individuais de médicos por modalidade, vinculados à unidade e à vigência ativa.
- [ ] Criar modais para iniciar ciclo, encerrar ciclo e publicar uma nova configuração, sem sobrescrever valores vigentes.
- [x] Aplicar a tela aprovada, com métricas do ciclo e edição em lote no sandbox.
- [x] Criar migração aditiva, testes de autorização e validação completa antes de qualquer publicação externa.

## FINANCEIRO V2 — MODAIS E VIGÊNCIA AUDITÁVEL
- [ ] Criar os modais de iniciar ciclo, encerrar ciclo e publicar nova configuração, com confirmação explícita das datas e do impacto nos preços.
- [ ] Bloquear alterações de taxa LAUDS, valores padrão e preços individuais quando houver ciclo financeiro aberto para a unidade.
- [x] Registrar cada configuração por unidade, modalidade, médico, início de vigência, término e autoria, sem atualizações destrutivas.
- [ ] Calcular no painel apenas métricas derivadas dos fatos geradores do ciclo e das vigências publicadas.
- [x] Corrigir a edição direta de preço individual para publicar a alteração no próximo ciclo, evitando rejeição de valores já vigentes.

## FINANCEIRO V2 — ATUALIZAÇÃO CONTROLADA DO AMBIENTE REAL
- [x] Executar backup lógico e aplicar a migração aditiva 0053 na VM2, verificando a nova tabela e preservando todos os dados existentes.
- [x] Validar o commit 39df0a5 em worktree isolada e atualizar a VM1 com build completo e reinicialização controlada do PM2.
- [x] Confirmar saúde HTTP e PM2 após a atualização real; a verificação funcional autenticada permanece como validação operacional recomendada.
- [x] Reexecutar a pré-verificação da VM2 com a correção de aspas no comando de consulta ao MySQL.
- [x] Identificar o diretório ativo do portal na VM1 e corrigir o comando de atualização sem alterar a aplicação em execução.
- [x] Repetir a validação isolada carregando somente no processo de teste as variáveis locais exigidas pela infraestrutura VM3 e pelos testes de autorização; a credencial MinIO rotacionada manteve um teste legado incompatível.
- [x] Repetir a validação da VM1 com TypeScript, regressão específica do Financeiro v2 e build completo, registrando as três falhas globais externas à alteração publicada.

## FINANCEIRO V2 — DIAGNÓSTICO PÓS-ASSINATURA
- [x] Coletar logs somente leitura do portal após assinaturas recentes e identificar mensagens do fluxo de eventos financeiros.
- [x] Conferir no banco o vínculo entre relatórios assinados, seleções de legenda e eventos financeiros, sem reprocessar dados.
- [x] Documentar a causa confirmada e propor correção segura antes de qualquer alteração em produção.
- [x] Adaptar as consultas do Financeiro v2 para contabilizar os eventos consolidados em `billing_catalog_study_events`, sem reprocessar os registros nem duplicar eventos legados.

## FINANCEIRO V2 — CONSOLIDAÇÃO DE EVENTOS DE CATÁLOGO
- [x] Substituir no novo fluxo a precificação por legenda pelo preço individual vigente por modalidade, com fallback no valor vigente da unidade.
- [x] Registrar no evento de catálogo o preço efetivamente aplicado, a fonte do preço e a modalidade para auditoria.
- [x] Fazer o dashboard contabilizar eventos de catálogo e legados sem soma duplicada, com cálculo consistente de eventos, total do sistema e total médico.
- [x] Produzir relatório de auditoria da transição entre eventos legados e de catálogo, incluindo os limites para eventos históricos já criados.
- [x] Cobrir a consolidação com testes de preço individual, fallback da unidade, ausência de preço e métricas de painel.
- [x] Corrigir a aplicação aditiva da migração 0054 e os diagnósticos TypeScript surgidos durante a integração.
- [x] Publicar no GitHub a correção auditada no commit 3834408.

## FINANCEIRO V2 — BAIXA OPERACIONAL E TESTES COMPORTAMENTAIS
- [x] Confirmar o isolamento atual entre os controles de pagamento dos eventos legados e os eventos de catálogo.
- [x] Projetar e implementar baixa auditável de médico e sistema para eventos de catálogo, preservando RBAC e sem alterar eventos históricos.
- [x] Unificar a listagem operacional por médico para exibir eventos legados e de catálogo com identificação de origem e estado de pagamento.
- [x] Converter também as regressões remanescentes de reprocessamento, múltiplas legendas e painel em testes comportamentais de integração controlada.
- [x] Substituir as regressões críticas de preços, trava de legenda e baixa operacional por testes comportamentais executáveis.
- [x] Corrigir a documentação financeira que ainda descreve uma limitação já resolvida na apuração por médico.
- [x] Produzir relatório de auditoria da baixa operacional do catálogo antes de qualquer atualização de produção.

## FINANCEIRO V2 — VERIFICAÇÃO DE PUBLICAÇÃO REMOTA
- [x] Confirmar o commit e os arquivos efetivamente visíveis na branch `main` do GitHub após o checkpoint auditado.
- [x] Reconciliar e publicar a versão auditada porque a ponta remota não continha a baixa operacional nem a migração 0055; versão final em `c5c7b8f`.

## FINANCEIRO V2 — IDENTIFICAÇÃO CLÍNICA NO CATÁLOGO
- [x] Retornar nome do paciente e data do estudo para eventos de catálogo no drill-down financeiro, usando a seleção clínica e o cache do estudo.
- [x] Conferir outras interfaces que listam eventos de catálogo para não manter linhas sem identificação clínica.
- [x] Substituir conversões `as any` pela tipagem explícita de origem do evento nas interfaces financeiras.
- [x] Cobrir a identificação do paciente no catálogo com teste comportamental e publicar auditoria da correção antes de produção.

## FINANCEIRO V2 — ATUALIZAÇÃO REAL 0054 E 0055
- [x] Fazer backup e aplicar as migrações aditivas 0054 e 0055 na VM2, confirmando todas as novas colunas de evento de catálogo.
- [x] Validar o commit 5529dc1 em worktree isolada e atualizar a VM1 com build, reinicialização do PM2 e verificação HTTP.
- [ ] Confirmar em produção a identificação do paciente no catálogo e a baixa dos eventos por médico e LAUDS.

## FINANCEIRO V2 — TRILHA AUDITÁVEL DE EVENTOS
- [x] Criar consulta unificada de eventos do ciclo por unidade, com paciente, estudo, médico assinante, data, modalidade, legenda, origem e valores.
- [x] Exibir no detalhe da unidade um log pesquisável e ordenado dos eventos que compõem os indicadores do ciclo.
- [x] Permitir que admin_master, responsável financeiro e unit_admin consultem apenas eventos das unidades autorizadas.
- [x] Cobrir a trilha de eventos com testes comportamentais, auditoria técnica e publicação no repositório antes de produção.

## FINANCEIRO V2 — CORREÇÃO DE VISIBILIDADE DO LOG
- [x] Verificar por que o acesso ao log não aparece no detalhe da unidade no sandbox; ele somente é exibido após abrir a unidade pelo botão Abrir financeiro.
- [x] Manter o acesso ao log em área evidente, abaixo de Valor vigente por modalidade, como botão Ver log do ciclo.
- [x] Validar visualmente o acesso e a abertura do log antes de nova publicação.

## FINANCEIRO V2 — SNAPSHOT DE EXAME NO LOG LEGADO
- [x] Retornar `billing_visit_events.exam_name_snapshot` como descrição clínica dos eventos legados no log auditável.
- [x] Cobrir o fallback do snapshot legado com teste comportamental, validando que o cache do estudo não é a única fonte de descrição.
- [x] Documentar e publicar a correção auditada antes de produção.

## FINANCEIRO V2 — ATUALIZAÇÃO REAL DO LOG AUDITÁVEL
- [x] Validar o commit ce83cad em worktree isolada e atualizar a VM1 com build, reinicialização do PM2 e verificação HTTP.
- [ ] Confirmar em produção o botão Ver log do ciclo e a descrição permanente do exame nos eventos legados.

## FINANCEIRO V2 — DIVERGÊNCIA ENTRE INDICADOR E LOG
- [x] Identificar o critério que faz o painel mostrar eventos do ciclo enquanto o log retorna vazio.
- [x] Alinhar o log aos mesmos eventos e ao mesmo intervalo temporal usados nos indicadores da unidade.
- [x] Criar regressão comportamental que exige igualdade entre a contagem exibida e as linhas do log para um ciclo.
- [x] Auditar, validar e publicar a correção antes de nova atualização da VM1.

## FINANCEIRO V2 — CONVERSÃO DA REGRESSÃO DO PAINEL
- [x] Substituir a verificação estática de código do painel por teste comportamental da referência mensal encaminhada ao log.
- [x] Preservar somente testes estruturais que não possam ser expressos por comportamento observável.
- [x] Validar, documentar e publicar a conversão da cobertura antes de qualquer atualização da VM1.

## FINANCEIRO V2 — ATUALIZAÇÃO REAL DA PARIDADE E COBERTURA
- [x] Validar o commit 2c71524 em worktree isolada e atualizar a VM1 após os testes financeiros e o build completos.
- [ ] Confirmar o commit ativo, a saúde HTTP e a listagem de eventos do ciclo após a atualização da VM1.

## INCIDENTE FINANCEIRO — CONTADOR SEM LINHAS AUDITÁVEIS
- [x] Preservar a evidência da unidade Hospital da Criança com 2 eventos no ciclo e log vazio, classificando o indicador como não conciliado.
- [x] Reconciliar em modo somente leitura os dois eventos reais, o intervalo efetivo do ciclo e os filtros do resumo e do log.
- [x] Unificar a fonte de eventos do contador e do log para que seja impossível exibir contagem sem linhas correspondentes.
- [x] Criar regressão com o caso real de ciclo atravessando meses e publicar somente após reconciliação comprovada.

## AUDITORIA EXTERNA — INCIDENTE DE RECONCILIAÇÃO FINANCEIRA
- [x] Elaborar arquivo TXT com evidências, impacto, hipóteses descartadas e escopo objetivo para auditoria independente do código.
- [x] Incluir no arquivo TXT o inventário sanitizado da VM2, o ciclo calculado e os dois eventos de catálogo confirmados no diagnóstico somente leitura.
- [x] Versionar o pedido de auditoria no repositório sem publicar dados de sessão, credenciais ou informações clínicas desnecessárias.

## REVISÃO DA AUDITORIA INDEPENDENTE — INTEGRIDADE DO LOG
- [x] Arquivar a auditoria independente recebida e confrontar seus achados com as evidências já obtidas da VM1 e da VM2.
- [x] Executar a consulta adicional somente leitura sugerida contra os eventos 1 e 2 na VM2 e registrar o resultado.
- [x] Submeter o desenho de fonte única, tratamento explícito de erro e preservação de eventos sem vínculo clínico para aprovação antes de alterar código.

## CORREÇÃO APROVADA — INTEGRIDADE DO LOG FINANCEIRO
- [x] Centralizar a recuperação de eventos do ciclo em uma única fonte reutilizada pelo resumo e pelo log auditável.
- [x] Preservar a linha do evento financeiro quando a seleção clínica ou o estudo não estiverem disponíveis.
- [x] Exibir erro explícito e permitir nova tentativa quando a consulta do log falhar.
- [x] Criar regressões para paridade, evento sem vínculo clínico e estado de erro da consulta.
- [x] Validar, documentar e publicar a correção antes de qualquer atualização da VM1.

## ATUALIZAÇÃO REAL — CORREÇÃO DE INTEGRIDADE FINANCEIRA
- [x] Validar o commit 556de62 em worktree isolada e atualizar a VM1 após testes financeiros e build completos.
- [ ] Confirmar o commit ativo, a saúde HTTP e as duas linhas do log da unidade Hospital da Criança após a atualização.

## INCIDENTE DE REGRESSÃO — CATÁLOGO FINANCEIRO VAZIO
- [x] Preservar a evidência da interface após o commit 556de62 e confirmar que os dados financeiros da VM2 permanecem intactos.
- [x] Diagnosticar em modo somente leitura por que `unitSummary` retorna catálogo vazio após a centralização da consulta.
- [x] Corrigir a regressão e publicar somente após o catálogo e o log retornarem os dois eventos da unidade Hospital da Criança.

## CORREÇÃO DE COMPATIBILIDADE — ONLY_FULL_GROUP_BY
- [x] Remover a dependência de agrupamento implícito da consulta compartilhada de eventos financeiros.
- [x] Validar a consulta compartilhada em ambiente MySQL com `ONLY_FULL_GROUP_BY` ativo.
- [x] Garantir que falhas de `unitSummary` também sejam apresentadas como erro explícito, sem catálogo vazio silencioso.

## ATUALIZAÇÃO CORRETIVA — RECUPERAÇÃO DO CATÁLOGO FINANCEIRO
- [x] Validar o commit 6bf2540 em worktree isolada e atualizar a VM1 após testes financeiros e build completos.
- [x] Confirmar o retorno da unidade Hospital da Criança e dos dois eventos no ciclo após a atualização.

## INCIDENTE DE INTEGRIDADE — EVENTO SEM LAUDO CLÍNICO APARENTE
- [x] Preservar a evidência dos eventos de Lenilson dos Santos Vidal e Antonia de Souza Batista exibidos no log sem laudo concluído na listagem clínica.
- [x] Reconciliar em modo somente leitura os eventos financeiros, seleções de legenda, documentos de laudo e estados clínicos dos dois estudos.
- [x] Definir a correção para impedir que um evento financeiro seja elegível sem o fato clínico assinável correspondente.

## FALHA CONFIRMADA — EXCLUSÃO DE LAUDO ASSINADO
- [x] Completar a trilha do laudo 50 e verificar sua exclusão posterior na auditoria.
- [x] Bloquear a exclusão física de laudo assinado com evento financeiro ativo ou cancelar o evento de forma auditável conforme a regra aprovada.
- [x] Exigir lastro de documento assinado e elegível para que eventos de catálogo componham totais financeiros.

## CANCELAMENTO AUDITÁVEL APROVADO — LAUDO E EVENTO FINANCEIRO
- [x] Criar campos aditivos de cancelamento para eventos financeiros de catálogo e seus responsáveis auditáveis.
- [x] Implementar transação de cancelamento de laudo assinado, evento financeiro e trilha de auditoria.
- [x] Manter exclusão física restrita a rascunhos sem evento financeiro e expor a ação de cancelamento para laudos assinados.
- [x] Excluir eventos cancelados de totais, cobranças e repasses, mantendo-os visíveis no log como cancelados.
- [x] Cobrir cancelamento, bloqueio de exclusão física e manutenção de histórico em regressões comportamentais.
- [x] Publicar a correção e preparar a migração aditiva da VM2 antes de atualizar a VM1.

## INTEGRIDADE DA TELA DE PAGAMENTOS
- [x] Substituir a consulta duplicada `eventsByDoctorUnit` por fonte compartilhada que preserve eventos sem vínculo clínico.
- [x] Exibir erro explícito e nova tentativa no detalhe de laudos usado para pagamentos.
- [x] Garantir que eventos cancelados não possam ser selecionados ou baixados no fluxo de pagamentos.
- [x] Criar regressões de vínculo clínico ausente, erro da consulta e cancelamento no detalhe de pagamentos.
- [x] Documentar e publicar a correção da tela de Pagamentos antes de atualização de produção.

## ATUALIZAÇÃO REAL — INTEGRIDADE DA TELA DE PAGAMENTOS
- [x] Validar o commit c2b3ba0 em worktree isolada e atualizar a VM1 após testes financeiros e build completos.
- [ ] Confirmar o detalhe de pagamentos e a saúde HTTP após a atualização.

## INCIDENTE — PAINEL FINANCEIRO VAZIO APÓS ATUALIZAÇÃO C2B3BA0
- [x] Coletar evidências somente leitura da VM1 para identificar a falha das consultas financeiras em produção.
- [x] Confirmar que o código c2b3ba0 consulta billing_catalog_study_events.financial_status, campo que depende da migração 0056 ainda ausente na VM2.
- [x] Aplicar a migração aditiva 0056 na VM2 com backup lógico e pré-condições aprovadas, preservando os eventos históricos 1 e 2.
- [x] Reproduzir a falha no sandbox e corrigir sem modificar eventos financeiros históricos.
- [ ] Cobrir a causa com regressão, validar e atualizar produção somente após aprovação.

## REGULARIZAÇÃO VISUAL — EVENTOS HISTÓRICOS SEM LASTRO CLÍNICO
- [x] Registrar que os eventos 1 e 2 aparecem no log financeiro enquanto os estudos atuais estão pendentes, pois os laudos assinados originais foram removidos antes da regra de cancelamento auditável.
- [x] Registrar que a taxa LAUDS vigente não pode ser apresentada como valor aplicado aos eventos históricos cujo snapshot system_amount_due é nulo.
- [ ] Auditar os campos de preço, status, vínculo de seleção e laudo dos eventos históricos 1 e 2 somente leitura.
- [ ] Sinalizar no Financeiro eventos históricos sem preço ou laudo vigente como pendentes de regularização, excluídos de cobrança, repasse e baixa.
- [ ] Adicionar regressões que impeçam apresentação de taxa vigente como valor histórico aplicado sem snapshot financeiro.

## AUDITORIA — NOVA ASSINATURA E UNICIDADE DE COBRANÇA
- [ ] Confrontar cada evento financeiro do caso histórico com a assinatura clínica correspondente, sem presumir o estado atual do estudo.
- [ ] Auditar se uma nova assinatura de novo laudo cria novo evento, enquanto revisão e reimpressão preservam o evento existente.
- [ ] Definir e testar a unicidade da cobrança por assinatura final de cada documento clínico.
- [x] Redigir relatório TXT sanitizado sobre as evidências, o comportamento atual e a regra aprovada para nova assinatura.
- [x] Versionar e publicar o relatório TXT de auditoria no GitHub (c5d314c).

## DECISÃO FORMAL — CANCELAMENTO DE LAUDO E NOVA COBRANÇA
- [x] Registrar que somente admin_master cancela laudo signed/revised, preservando o laudo e a auditoria, e cancela o evento financeiro relacionado.
- [x] Permitir nova ocorrência financeira quando uma nova laudagem completa for assinada após evento anterior cancelado, sem reativar ou alterar o evento cancelado.
- [x] Corrigir a chave de unicidade de eventos de catálogo para suportar múltiplas ocorrências financeiras por seleção, mantendo event_index dentro de cada ocorrência.
- [x] Corrigir a legenda do dashboard para descrever soma de valores efetivamente registrados nos eventos do ciclo.
- [x] Criar regressões para cancelamento por admin_master, nova assinatura pós-cancelamento, revisão sem nova cobrança e legenda do total do sistema.
- [x] Documentar a decisão formal e a implementação com a migração 0057 e os critérios de aceite.
- [x] Publicar a decisão formal e a implementação no GitHub (821a01b).

## BLOQUEIO DE IMPLANTAÇÃO — EXAME COMPOSTO E CANCELAMENTO PARCIAL
- [x] Registrar que a ocorrência por documento pode desalinhá-los em seleção composta após cancelamento parcial e bloquear nova cobrança.
- [x] Suspender a implantação da migração 0057 e da atualização da VM1 até definir a política de cancelamento parcial para seleções compostas.
- [x] Aprovar o cancelamento em cascata da seleção inteira quando qualquer documento composto for cancelado.
- [x] Corrigir o fluxo escolhido, alinhar o nome do índice no schema e criar regressão que reproduza o cancelamento parcial real.
- [x] Versionar e publicar a correção do cancelamento em cascata antes de preparar a implantação (744a3b9).

## IMPLANTAÇÃO REAL — OCORRÊNCIAS FINANCEIRAS E EXAME COMPOSTO
- [x] Aplicar a migração aditiva 0057 na VM2 com backup lógico, pré-condições e verificação de preservação dos eventos históricos.
- [x] Validar isoladamente e atualizar a VM1 para o commit e3f8762.
- [ ] Confirmar em produção o painel financeiro e o cancelamento composto sem alterar eventos históricos existentes.

## RECONCILIAÇÃO URGENTE — POSSÍVEL NOVA OCORRÊNCIA EM CASO HISTÓRICO
- [x] Preservar as evidências visuais e interromper novas ações no caso histórico de Lenilson.
- [x] Reconciliar somente leitura os laudos, a seleção, os eventos financeiros e a auditoria do estudo exibido.
- [x] Decidir administrativamente manter o evento histórico 2 cancelado, sem reativação, recálculo, preço, baixa ou substituição.
- [x] Confirmar em leitura que o report 51 foi cancelado em 22/08/2026 às 11:57:33 e que o evento histórico 2 passou para cancelled sem baixa financeira.
- [x] Completar a leitura da auditoria do caso com collation explícita, sem executar qualquer alteração.
- [x] Versionar e publicar a decisão administrativa de manter o evento histórico 2 cancelado (d420380).

## ENCERRAMENTO DA ETAPA — OCORRÊNCIAS FINANCEIRAS
- [x] Encerrar a etapa por decisão do administrador e deixar os testes funcionais manuais sob responsabilidade do usuário.
- [x] Sincronizar a VM1 com a versão documental atual do repositório, sem nova migração ou alteração de dados (7c47e9a, HTTP 200, PM2 online).

## SINCRONIZAÇÃO DOCUMENTAL FINAL DA VM1
- [x] Sincronizar a VM1 do commit 7c47e9a para 361d2c7, sem migração, build ou reinício de serviço (HTTP 200, PM2 online).

## RELATÓRIO DE AUDITORIA — DIVERGÊNCIA ENTRE LAUDO E LOG FINANCEIRO
- [x] Consolidar a evidência de estudo em andamento exibido com identificação de assinatura anterior no log financeiro.
- [x] Redigir relatório TXT sanitizado com fatos, riscos, hipóteses e escopo obrigatório de auditoria.
- [ ] Versionar e publicar o relatório TXT no GitHub.
