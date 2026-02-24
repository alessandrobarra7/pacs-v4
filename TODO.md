# PACS Portal - Roadmap de Funcionalidades

## 🎯 Objetivo
Implementar todas as funcionalidades do frontend Lovable no PACS Portal, mantendo compatibilidade total com o backend tRPC existente.

---

## ✅ Funcionalidades Básicas (Implementadas)

- [x] Dashboard principal
- [x] Listagem de estudos DICOM
- [x] Templates de laudos básicos
- [x] Gerenciamento de unidades médicas
- [x] Autenticação OAuth
- [x] Sistema de auditoria básico

---

## 🚀 Funcionalidades a Implementar

### 1. Visualizador DICOM (ViewerPage)
- [ ] Visualizador de imagens DICOM integrado
- [ ] Navegação entre séries e instâncias
- [ ] Ferramentas de medição (distância, ângulo, área)
- [ ] Ferramentas de anotação
- [ ] Ajuste de windowing (brilho/contraste)
- [ ] Zoom e pan
- [ ] Rotação de imagens
- [ ] Exportação de imagens

### 2. Query PACS (PacsQueryPage)
- [ ] Interface de busca avançada no PACS
- [ ] Filtros por data, modalidade, paciente, médico
- [ ] Integração com Orthanc Query/Retrieve
- [ ] Visualização de resultados em grid
- [ ] Download de estudos do PACS
- [ ] Cache local de estudos

### 3. Conexões PACS (PacsConnectionsPage)
- [ ] Gerenciamento de múltiplas conexões Orthanc
- [ ] Configuração de credenciais por unidade
- [ ] Teste de conectividade
- [ ] Status de conexão em tempo real
- [ ] Logs de conexão
- [ ] Configuração de AE Title

### 4. Editor de Laudos Avançado (ReportEditorPage)
- [ ] Editor de texto rico (WYSIWYG)
- [ ] Sistema de templates dinâmicos
- [ ] Versionamento de laudos
- [ ] Assinatura digital
- [ ] Histórico de revisões
- [ ] Comparação de versões
- [ ] Exportação para PDF
- [ ] Impressão de laudos

### 5. Sistema de Anamnese Inteligente
- [ ] Anamnese de Abdomen
  - [ ] Formulário estruturado
  - [ ] Campos dinâmicos
  - [ ] Validação de dados
- [ ] Anamnese de Coluna
  - [ ] Formulário estruturado
  - [ ] Campos dinâmicos
  - [ ] Validação de dados
- [ ] Anamnese de Crânio
  - [ ] Formulário estruturado
  - [ ] Campos dinâmicos
  - [ ] Validação de dados
- [ ] Anamnese de Tórax
  - [ ] Formulário estruturado
  - [ ] Campos dinâmicos
  - [ ] Validação de dados
- [ ] Integração com templates de laudos
- [ ] Auto-preenchimento baseado em anamnese

### 6. Administração Completa (admin/)

#### 6.1 Gerenciamento de Usuários (UsersAdminPage)
- [ ] Listagem de usuários
- [ ] Criação de novos usuários
- [ ] Edição de usuários existentes
- [ ] Desativação/ativação de usuários
- [ ] Atribuição de roles (admin_master, admin_unit, radiologist, referring_doctor)
- [ ] Atribuição de unidades
- [ ] Histórico de atividades do usuário

#### 6.2 Gerenciamento de Unidades (UnitsAdminPage)
- [ ] Listagem de unidades médicas
- [ ] Criação de novas unidades
- [ ] Edição de unidades existentes
- [ ] Configuração de Orthanc por unidade
- [ ] Upload de logo da unidade
- [ ] Desativação/ativação de unidades

#### 6.3 Gerenciamento de Permissões (PermissionsAdminPage)
- [ ] Matriz de permissões por role
- [ ] Configuração de permissões granulares
- [ ] Permissões por módulo
- [ ] Permissões por ação (criar, editar, deletar, visualizar)

#### 6.4 Gerenciamento de Templates (TemplatesAdminPage)
- [ ] Listagem de templates de laudos
- [ ] Criação de novos templates
- [ ] Edição de templates existentes
- [ ] Templates globais vs. por unidade
- [ ] Templates por modalidade
- [ ] Campos dinâmicos em templates
- [ ] Preview de templates

#### 6.5 Auditoria Completa (AuditAdminPage)
- [ ] Listagem de logs de auditoria
- [ ] Filtros avançados (usuário, ação, data, unidade)
- [ ] Exportação de logs
- [ ] Visualização detalhada de ações
- [ ] Gráficos de atividade
- [ ] Alertas de atividades suspeitas

### 7. Melhorias de UI/UX
- [ ] Design system consistente
- [ ] Componentes shadcn/ui completos
- [ ] Tema escuro/claro
- [ ] Responsividade mobile
- [ ] Animações e transições
- [ ] Loading states
- [ ] Error boundaries
- [ ] Toast notifications
- [ ] Confirmação de ações destrutivas

### 8. Integrações
- [ ] Integração completa com Orthanc
- [ ] Integração com HL7/FHIR (futuro)
- [ ] Integração com sistemas HIS/RIS (futuro)
- [ ] API REST para integrações externas (futuro)

---

## 📋 Prioridades

### Fase 1 (Crítica) - 2-3 semanas
1. Visualizador DICOM básico
2. Query PACS
3. Conexões PACS
4. Editor de Laudos Avançado

### Fase 2 (Importante) - 2-3 semanas
1. Sistema de Anamnese completo
2. Gerenciamento de Usuários
3. Gerenciamento de Unidades
4. Gerenciamento de Templates

### Fase 3 (Desejável) - 1-2 semanas
1. Gerenciamento de Permissões
2. Auditoria Completa
3. Melhorias de UI/UX

### Fase 4 (Futuro)
1. Integrações avançadas
2. Mobile app
3. IA para auxílio diagnóstico

---

## 📝 Notas de Implementação

- Todas as funcionalidades devem usar tRPC para comunicação com backend
- Manter compatibilidade com backend existente
- Testes unitários para cada funcionalidade
- Documentação inline no código
- Commits atômicos e descritivos
- Code review antes de merge

---

**Última atualização:** 23/02/2026
**Status:** Frontend original restaurado e funcionando
**Próximo passo:** Implementar Visualizador DICOM

---

## 📝 Changelog de Implementações

### 23/02/2026 - Visualizador DICOM (Estrutura Base)
- [x] Criada página ViewerPage.tsx com estrutura para integração OHIF
- [x] Adicionada rota `/viewer/:studyId` no App.tsx
- [x] Integrado botão de visualização na listagem de estudos
- [x] Documentação das funcionalidades planejadas na página do visualizador
- [ ] Pendente: Configurar instância OHIF Viewer
- [ ] Pendente: Integrar com backend Orthanc via DICOMweb

### 23/02/2026 - PACS Query & Retrieve (Interface Implementada)
- [x] Criar endpoint tRPC para query PACS (estrutura base)
- [x] Implementar PacsQueryPage com filtros (nome, modalidade, data, ID paciente, accession, descrição)
- [x] Criar tabela de resultados similar ao visualizador de referência
- [x] Integrar botão de visualização com OHIF Viewer
- [x] Adicionar auditoria de queries PACS (PACS_QUERY, PACS_DOWNLOAD)
- [ ] Pendente: Implementar C-FIND real no Orthanc (179.67.254.135:11112 - PACSML)
- [ ] Pendente: Implementar C-MOVE para download de estudos

### 23/02/2026 - Redesign de Login e Fluxo Principal (Concluído)
- [x] Redesenhar página de login com layout 50/50 (formulário + imagem médica)
- [x] Adicionar imagem médica profissional no lado direito
- [x] Melhorar design do formulário de login (campos, botões, logo)
- [x] Ajustar rota inicial (/) para redirecionar para /pacs-query após login
- [x] Remover Dashboard como tela principal
- [x] Testar fluxo: Login → Busca de Exames PACS

### 23/02/2026 - Redesign PACS Query - Layout Compacto Profissional (Concluído)
- [x] Redesenhar PacsQueryPage com layout compacto (estilo software, não website)
- [x] Filtros em linha horizontal grid 12 colunas
- [x] Tabela densa com linhas menores (py-2) e tipografia xs
- [x] Reduzir espaçamentos e paddings (h-8 inputs, h-9 headers)
- [x] Tipografia menor e mais profissional (text-xs, text-[11px])
- [x] Cores neutras (gray-50 bg, gray-700 text)
- [x] Header compacto com contador de resultados
- [x] Botões de ação compactos (h-7 w-7)

### 23/02/2026 - Implementação C-FIND DICOM Real (Concluído ✅)
- [x] Atualizar schema units com campos PACS (pacs_ip, pacs_port, pacs_ae_title)
- [x] Gerar e aplicar migration para novos campos (0003_black_luckman.sql)
- [x] Criar script Python dicom_query.py usando pynetdicom
- [x] Instalar pynetdicom e pydicom no servidor
- [x] Criar bash wrapper dicom_query.sh para isolar Python 3.11
- [x] Integrar script Python no backend tRPC (pacs.query)
- [x] Criar unidade de teste (Orthanc 179.67.254.135:11112 - PACSML)
- [x] Testar busca real no Orthanc (44 estudos encontrados com sucesso!)
- [x] Implementar tratamento de erros DICOM
- [x] Logs de auditoria já implementados (PACS_QUERY action)

### 23/02/2026 - Tentativa OHIF Viewer (Descontinuado)
- [x] Criar endpoint tRPC pacs.getViewerUrl para gerar URL OHIF
- [x] Implementar ViewerPage.tsx com redirecionamento para OHIF
- [x] Conectar botão "Visualizar" ao endpoint
- [x] Testar integração - **Resultado**: OHIF requer DICOMweb no Orthanc
- **Decisão**: Implementar visualizador integrado no portal (cornerstone.js) ao invés de OHIF externo

### 23/02/2026 - Redesign Interface Busca PACS (Concluído ✅)
- [x] Redesenhar PacsQueryPage com layout baseado na imagem de referência
- [x] Adicionar ações coloridas por linha:
  - 🟪 Visualizar (ícone olho roxo)
  - 📁 Arquivar (ícone pasta cinza)
  - 💖 Laudar (ícone edição rosa)
  - 🔴 Excluir (ícone lixeira vermelho)
  - 🟢 Aprovar (ícone check verde)
  - 🔵 Compartilhar (ícone share azul)
  - ⋯ Mais opções, Info paciente, Segurança
- [x] Implementar coluna de Ações com 9 ícones coloridos
- [x] Reorganizar colunas: Ações | Data de Realização | Nome do Paciente | Descrição do Exame
- [x] Adicionar filtros avançados no topo (Período, Status, Modalidades)
- [x] Corrigir formatação de nomes (remover caracteres ^)
- [x] Simplificar colunas conforme solicitado

### Próxima Fase - Visualizador Integrado
- [ ] Implementar visualizador cornerstone.js integrado no portal
- [ ] Buscar imagens DICOM via WADO do Orthanc
- [ ] Criar componente DicomViewer com cornerstone-core
- [ ] Adicionar ferramentas básicas (zoom, pan, windowing)
- [ ] Testar visualização de imagens reais do PACS

### 23/02/2026 - Reorganização Interface Busca PACS (Concluído ✅)
- [x] Alterar barra de título: remover dados PACS, adicionar boas-vindas com nome da unidade
- [x] Simplificar filtros: manter apenas Nome do Paciente e Data
- [x] Adicionar botões rápidos: Exames de Hoje, Período (dropdown: Hoje/7dias/30dias/Todos), Plantão
- [x] Remover filtros: ID do Paciente, Modalidade, Accession Number
- [x] Reordenar colunas da tabela:
  1. Data de Realização (com horário)
  2. Nome do Paciente (com descrição do exame e modalidade)
  3. Visualizador (botão "Ver" roxo)
  4. Laudar (botão "Laudar" rosa)
  5. Médico (nome + CRM)
  6. Status de Laudo (Pendente/Em Andamento/Concluído com cores)
- [x] Remover botões de ações não utilizados (Arquivar, Excluir, Aprovar, Compartilhar, etc.)

### 23/02/2026 - Visualizador DICOM Cornerstone.js com Cache Temporário (Em Andamento)
- [x] Criar script Python para C-MOVE (dicom_move.py)
- [x] Criar bash wrapper para isolar Python 3.11 (dicom_move.sh)
- [x] Instalar bibliotecas Cornerstone.js (cornerstone-core, cornerstone-tools, cornerstone-wado-image-loader, dicom-parser)
- [x] Criar endpoint backend para servir arquivos DICOM do cache (GET /api/dicom-files/:studyUid/:filename)
- [x] Criar endpoint para listar arquivos DICOM (GET /api/dicom-files/:studyUid)
- [x] Implementar endpoint tRPC pacs.startViewer (C-MOVE + retornar cache info)
- [x] Criar componente DicomViewer.tsx com Cornerstone.js
- [x] Adicionar ferramentas básicas (zoom, pan, rotate, reset)
- [ ] **PENDENTE**: Adicionar type definitions para Cornerstone.js
- [ ] **PENDENTE**: Integrar DicomViewer na página de busca PACS (botão Ver)
- [ ] **PENDENTE**: Testar C-MOVE real com Orthanc
- [ ] **PENDENTE**: Testar visualização de imagens DICOM
- [ ] **PENDENTE**: Implementar limpeza automática de cache
- [ ] **PENDENTE**: Adicionar indicador de progresso durante C-MOVE
- [ ] **PENDENTE**: Implementar navegação entre séries/instâncias

### 23/02/2026 - BUG: Consulta de Exames Parou de Funcionar
- [ ] Diagnosticar problema (verificar logs, erros TypeScript, endpoint tRPC)
- [ ] Corrigir erro identificado
- [ ] Testar consulta novamente (buscar "TESTE")
- [ ] Verificar se retorna 44 estudos como antes

### 23/02/2026 - BUG: Busca por Data Não Funciona (RESOLVIDO ✅)
- [x] Diagnosticar por que botão "Exames de Hoje" não retorna resultados
- [x] Verificar se filtro de data está sendo enviado corretamente ao backend
- [x] Identificar problema: navegador em UTC enviava data 24/02 enquanto servidor em EST estava em 23/02
- [x] Corrigir lógica: frontend envia "TODAY" e backend calcula data no timezone do servidor
- [x] Testar busca por data: 48 estudos encontrados com sucesso!
- **Causa raiz**: Diferença de timezone entre navegador (GMT+0) e servidor (EST/GMT-5)
- **Solução**: Backend interpreta valor especial "TODAY" e calcula data local do servidor

### 23/02/2026 - BUG: Campo de Data Manual Não Funciona
- [ ] Diagnosticar por que campo de data manual não retorna resultados
- [ ] Verificar formato da data sendo enviado ao backend (deve ser YYYYMMDD)
- [ ] Corrigir conversão de formato YYYY-MM-DD para YYYYMMDD
- [ ] Testar busca com data manual (ex: 20/02/2026)

### 23/02/2026 - Implementar Busca por Período (CONCLUÍDO ✅)
- [x] Implementar botão "Hoje" para buscar exames de hoje
- [x] Implementar botão "7 dias" para buscar exames dos últimos 7 dias
- [x] Implementar botão "30 dias" para buscar exames dos últimos 30 dias
- [x] Implementar botão "Todos" para buscar todos os exames sem filtro de data
- [x] Remover campo de data manual problemático
- [x] Adicionar indicador visual do período selecionado (botão azul)
- [x] Backend interpreta valores especiais: TODAY, LAST_7_DAYS, LAST_30_DAYS
- [x] Testar todas as opções: Hoje (1 estudo), 7 Dias (9 estudos), 30 Dias (16 estudos), Todos (16 estudos)
- **Solução**: Interface simplificada com botões de período ao invés de campo manual

### 24/02/2026 - Melhorar Interface de Exibição de Exames (CONCLUÍDO ✅)
- [x] Remover número de acesso (Patient ID) da exibição do nome
- [x] Adicionar botão de edição ao lado da descrição do exame
- [x] Reorganizar botões de ação na ordem: Ver → Laudar → Imprimir → Médico
- [x] Consolidar botões em coluna "Ácões" única
- [x] Adicionar cores distintas para cada botão (roxo, rosa, azul, verde)
- [x] Testar interface atualizada: nome limpo, botões organizados
- **Solução**: Regex remove Patient ID do nome, botões consolidados em coluna única

## FASE 2: Criação de Módulos Essenciais do Sistema

### Módulo 1: Administração de Unidades (CONCLUÍDO ✅)
- [x] Criar página de listagem de unidades (/units) - já existia
- [x] Criar formulário de cadastro de nova unidade - melhorado
- [x] Criar formulário de edição de unidade existente - melhorado
- [x] Implementar configuração de PACS por unidade (IP, porta, AE Title, AE Title Local)
- [x] Implementar configuração de Orthanc por unidade (URL, credenciais)
- [x] Adicionar campo URL do logo da unidade
- [x] Implementar ativação/desativação de unidades - já existia
- [x] Melhorar tabela com badges coloridos para status Orthanc/PACS
- [x] Adicionar exibição de logo na listagem
- [x] Testar CRUD completo de unidades (testado e funcionando)

### Módulo 2: Templates de Laudos (CONCLUÍDO ✅)
- [x] Criar página de listagem de templates (/templates)
- [x] Criar formulário de criação de template com textarea
- [x] Implementar botões de variáveis dinâmicas (11 variáveis disponíveis)
- [x] Adicionar seleção de modalidade (CR, CT, MR, US, XA, MG, DX, RF, NM, PT, etc.)
- [x] Implementar templates globais vs. templates por unidade (switch)
- [x] Criar sistema de variáveis: patientName, patientId, studyDate, studyTime, modality, studyDescription, accessionNumber, referringPhysician, radiologist, currentDate, currentTime
- [x] Adicionar preview do template com variáveis destacadas
- [x] Implementar edição de templates (botão editar)
- [x] Implementar exclusão de templates (botão excluir)
- [x] Criar hook use-toast para notificações
- [x] Testar criação, visualização e listagem de templates (testado e funcionando)

### Módulo 3: Sistema de Laudos (CONCLUÍDO ✅)
- [x] Criar página de criação de laudo (/reports/create/:studyInstanceUid)
- [x] Integrar seleção de template ao criar laudo (dropdown com templates por modalidade)
- [x] Implementar editor de texto para corpo do laudo (textarea)
- [x] Implementar substituição automática de variáveis do template
- [x] Implementar salvamento como rascunho (status: draft)
- [x] Integrar botão "Laudar" na listagem de exames
- [x] Criar procedures tRPC para reports (create, getByStudyId)
- [x] Adicionar validação de campos obrigatórios
- [x] Implementar sistema de notificações (toast)
- [x] Testar fluxo completo de criação de laudo (testado e funcionando)
- [x] Verificar persistência no banco de dados (confirmado)
- [ ] Adicionar botão de finalizar laudo (assinatura digital) - pendente
- [ ] Criar página de visualização de laudo (/reports/:id) - pendente
- [ ] Adicionar histórico de revisões do laudo - pendente

### Módulo 4: Visualizador DICOM
- [ ] Corrigir erros de TypeScript no DicomViewer.tsx
- [ ] Implementar carregamento de imagens DICOM via C-MOVE
- [ ] Integrar Cornerstone.js com dados do PACS
- [ ] Adicionar ferramentas básicas: zoom, pan, scroll
- [ ] Implementar window/level (brilho/contraste)
- [ ] Adicionar navegação entre séries
- [ ] Implementar medições básicas (distância, ângulo)
- [ ] Adicionar anotações nas imagens
- [ ] Implementar captura de screenshot para incluir no laudo
- [ ] Testar visualização com diferentes modalidades (CR, CT, MR, etc.)

### Módulo 5: Impressão de Laudos
- [ ] Criar template PDF profissional para laudos
- [ ] Incluir cabeçalho com logo da unidade
- [ ] Adicionar dados do paciente e exame
- [ ] Incluir imagens selecionadas do visualizador
- [ ] Adicionar rodapé com assinatura digital
- [ ] Implementar geração de PDF no backend
- [ ] Adicionar botão de download/impressão
- [ ] Testar geração de PDF com diferentes templates

### Módulo 6: Seleção e Atribuição de Médico
- [ ] Criar dropdown de seleção de médico responsável
- [ ] Implementar filtro de médicos por unidade
- [ ] Adicionar notificação ao médico quando exame é atribuído
- [ ] Implementar reatribuição de médico
- [ ] Adicionar histórico de atribuições
- [ ] Criar dashboard de produtividade por médico
- [ ] Testar fluxo de atribuição e notificações

### Módulo 7: Melhorias de Interface
- [ ] Criar menu de navegação principal
- [ ] Adicionar breadcrumbs para navegação
- [ ] Implementar notificações toast para ações do usuário
- [ ] Adicionar loading states em todas as operações
- [ ] Implementar empty states informativos
- [ ] Adicionar confirmação para ações destrutivas
- [ ] Melhorar responsividade mobile
- [ ] Testar usabilidade geral

### Módulo 8: Integração e Testes
- [ ] Testar fluxo completo: busca → visualização → laudo → impressão
- [ ] Validar permissões de acesso em todos os módulos
- [ ] Testar com múltiplas unidades simultâneas
- [ ] Verificar auditoria de todas as ações
- [ ] Testar performance com grande volume de dados
- [ ] Validar integração com PACS externo
- [ ] Documentar APIs e fluxos implementados

### 24/02/2026 - Melhorias de UX: Barra Lateral e Persistência de Busca (CONCLUÍDO ✅)
- [x] Implementar persistência do estado de busca usando localStorage
- [x] Ao voltar da tela de laudos, restaurar automaticamente a última busca realizada
- [x] Criar barra lateral no editor de laudos (layout 3 colunas + 9 colunas)
- [x] Adicionar seção de 10 nomes de exames pré-definidos na barra lateral
- [x] Adicionar seção de 16 frases pré-definidas organizadas por categoria
- [x] Implementar botões de inserção rápida (botão + ao lado de cada item)
- [x] Organizar frases por categoria com cores: Normal (verde), Leves (amarelo), Moderadas (laranja), Graves (vermelho)
- [x] Testar fluxo completo: buscar 42 exames → laudar → usar sidebar → voltar → 42 exames mantidos ✅
- **Resultado**: Experiência do usuário significativamente melhorada, fluxo de trabalho mais eficiente

## FASE 3: Funcionalidades Avançadas de Laudo e Anamnese

### Módulo: Sistema de Anamnese com CID (Indicações)
- [ ] Criar botão "CID - Indicações" na listagem de exames (entre nome do paciente e botão "Ver")
- [ ] Implementar modal de anamnese em camadas (6 camadas progressivas)
- [ ] CAMADA 1: Seleção de área do exame (Tórax, Abdome, Coluna, Crânio, Membros)
- [ ] CAMADA 2: Sintoma principal (ex: tosse, dor, febre)
- [ ] CAMADA 3: Caracterização do sintoma (duração em dias, intensidade)
- [ ] CAMADA 4: Sintomas associados (febre, falta de ar, dor ao respirar)
- [ ] CAMADA 5: Histórico clínico rápido (hipertensão, diabetes, medicação contínua)
- [ ] CAMADA 6: Finalidade do exame (preventivo ou por sintomas)
- [ ] Implementar sugestão automática de CID baseado nas respostas
- [ ] Salvar dados de anamnese vinculados ao estudo (study_instance_uid)
- [ ] Criar tabela `anamnesis` no banco de dados
- [ ] Exibir dados de anamnese no editor de laudos
- [ ] Testar fluxo completo de anamnese em camadas

### Módulo: Presets Personalizados de Laudos por Médico
- [ ] Criar tabela `report_presets` no banco de dados (id, user_id, name, body, category, isActive)
- [ ] Criar página de gerenciamento de presets (/my-presets)
- [ ] Implementar CRUD de presets personalizados por médico
- [ ] Adicionar categorização de presets (Normal, Alterações Leves, Moderadas, Graves)
- [ ] Implementar funcionalidade de arrastar e soltar presets no editor de laudos
- [ ] Adicionar botão de edição rápida de preset no editor
- [ ] Implementar salvamento de novo preset a partir do texto atual do laudo
- [ ] Adicionar barra lateral de presets pessoais no editor de laudos
- [ ] Testar criação, edição, exclusão e uso de presets

### Módulo: Personalização de Laudos com Logo e Assinatura
- [ ] Adicionar campo `signature_image_url` na tabela `user`
- [ ] Criar página de perfil do médico (/profile)
- [ ] Implementar upload de imagem de assinatura do médico
- [ ] Adicionar campo `logo_url` na tabela `units` (já existe)
- [ ] Modificar geração de laudo para incluir logo da unidade no cabeçalho
- [ ] Modificar geração de laudo para incluir assinatura do médico no rodapé
- [ ] Criar template de laudo com logo, nome da unidade e assinatura
- [ ] Implementar preview de laudo com personalização
- [ ] Testar geração de laudo completo com logo e assinatura

### Módulo: Melhorias no Editor de Laudos
- [ ] Implementar funcionalidade de arrastar presets para o editor
- [ ] Adicionar indicador visual de área de drop no editor
- [ ] Melhorar feedback visual ao inserir textos (animação, highlight)
- [ ] Adicionar atalhos de teclado para inserção rápida
- [ ] Implementar histórico de ações (undo/redo)
