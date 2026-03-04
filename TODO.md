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
