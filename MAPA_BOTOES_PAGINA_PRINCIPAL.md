# Mapa Funcional de Botões e Controles da Página Principal (PacsQueryPage)

**Autor:** Manus AI  
**Data:** 15 de agosto de 2026  
**Projeto:** PACS Portal (`pacs-portal`)  

Este documento detalha cada botão, controle de filtro e ação utilitária presente na página principal do PACS (`PacsQueryPage.tsx`), especificando o destino, a lógica executada, as permissões associadas e o status atual de validação.

---

## 1. Barra Superior e Controles Globais (AppHeader / Seletores)

| Controle / Botão | Destino / Rota | Funcionalidade e Lógica | Permissões / Restrições |
| :--- | :--- | :--- | :--- |
| **Logotipo LAUDS** | Rota `/studies` | Recarrega a listagem de estudos da unidade ativa. | Público para usuários autenticados |
| **Seletor de Unidades (Dropdown)** | N/A (Estado local / `unit_id`) | Permite alternar entre unidades PACS disponíveis. Salva a preferência em sessão e altera o escopo da consulta C-FIND e cache. | Restrito a `admin_master` (demais perfis visualizam apenas sua unidade fixa) |
| **Link "Estudos"** | Rota `/studies` | Direciona para a worklist principal de exames. | Todos os usuários autenticados |
| **Link "Administração"** | Rota `/admin` | Abre o painel administrativo unificado com abas de Unidades, Usuários e Auditoria. | Restrito a `admin_master` |
| **Link "Financeiro"** | Rota `/finance` | Abre o painel de faturamento por unidade e controle de ciclos médicos. | `medico`, `unit_admin`, `responsavel_financeiro`, `admin_master` |
| **Nome do Usuário & Perfil** | N/A | Exibe o nome e o badge de perfil (`admin_master`, `unit_admin`, `medico`, `viewer`). | Todos os usuários autenticados |
| **Botão Sair (Logout)** | Rota `/login` | Invalida a sessão JWT no backend, limpa caches locais e redireciona para o login. | Todos os usuários autenticados |

---

## 2. Barra de Busca e Filtros Rápidos de Período

| Controle / Botão | Ação Executada | Funcionalidade e Lógica | Validação |
| :--- | :--- | :--- | :--- |
| **Campo "Buscar paciente..."** | `onChange` + `runQuery()` | Filtra a lista de estudos por nome ou parte do nome do paciente. | Funcionando (busca textual local e envio ao C-FIND) |
| **Botão "Hoje"** | `handlePeriodChange('today')` | Define o filtro de data para a data atual do servidor (`TODAY`) e executa a busca PACS. | Funcionando |
| **Botão "Ontem"** | `handlePeriodChange('yesterday')` | Define o filtro de data para o dia anterior (`YESTERDAY`) e executa a busca PACS. | Funcionando |
| **Botão "Últimos 7 dias"** | `handlePeriodChange('last7')` | Executa busca de estudos dos últimos 7 dias. | Funcionando |
| **Botão "Data" (Calendário)** | Abre modal `Dialog` | Abre o seletor de data customizado com calendário interativo, botões "Hoje" e "Fechar". | Funcionando (Validado em desktop e mobile) |
| **Botão "Auto-Download"** | Toggle de estado | Alterna o modo de pré-download automático de imagens DICOM ao carregar a lista. | Funcionando |

---

## 3. Tabela Desktop — Ações por Estudo (Linha da Worklist)

| Ícone / Botão | Destino / Handler | Funcionalidade e Lógica | Permissões / Regras |
| :--- | :--- | :--- | :--- |
| **Nome do Paciente + Lápis** | `handleEditPatientName()` | Permite corrigir o nome do paciente localmente na tabela sem alterar a fonte PACS original (salvo na tabela `study_metadata`). | Exige permissão de edição de legenda / nome (`edit_exam_legend`) |
| **Ícone Clipe (Paperclip)** | `PatientAttachmentsModal` | Abre a modal compacta de Anexos e Fotos do Paciente, permitindo captura por câmera nativa, upload múltiplo de arquivos e galeria com visualização ampliada. | Disponível para todos os perfis na unidade |
| **Ícone Olho (Visualizar)** | `handleVisualize()` | Inicia o pré-download DICOM (via SSE ou cache) e abre o visualizador Cornerstone DICOM em nova aba/rota (`/viewer`). | Disponível para perfis autorizados |
| **Ícone Download (Seta Baixo)** | `handlePreDownload()` | Força o download/cache prévio das imagens do estudo do Orthanc para o diretório temporário da VM1. | Disponível para perfis autorizados |
| **Ícone Arquivo / Laudo (Verde)** | Rota `/report/{studyUid}` | Abre o editor de laudos estruturados com suporte a templates e versionamento. | `medico`, `unit_admin`, `admin_master` |
| **Ícone Impressora** | Janela de Impressão (`window.print`) | Gera a versão de impressão formatada do laudo médico assinado ou em rascunho. | Disponível para perfis autorizados |
| **Badge de Status** | Dinâmico (`Pendente` / `Laudado`) | Exibe o estado atual do laudo consultado em lote via `reports.statusByStudyUids`. | Atualizado automaticamente a cada 30s |

---

## 4. Cards Mobile — Ações por Estudo (Visualização Responsiva)

| Botão no Card Mobile | Handler / Destino | Funcionalidade e Lógica | Diferencial Mobile |
| :--- | :--- | :--- | :--- |
| **Botão Lápis (Pencil)** | `handleEditPatientName()` | Edita o nome do paciente no card de forma isolada, mantendo a legenda do exame limpa e priorizada. | Posicionado na faixa inferior junto ao nome completo e status |
| **Botão Clipe (Paperclip)** | `PatientAttachmentsModal` | Abre a mesma modal de anexos e fotos do paciente, otimizada para toque na tela do celular. | Ícone circular rápido no topo do card |
| **Botão Olho (Visualizar)** | `handleVisualize()` | Abre o visualizador DICOM otimizado para telas touch. | Botão de destaque laranja na barra superior do card |
| **Botão Download** | `handlePreDownload()` | Realiza o cache prévio das imagens no servidor. | Ação secundária rápida |
| **Botão Laudo (Verde)** | Rota `/report/{studyUid}` | Abre o editor de laudos em tela cheia no celular. | Botão verde destacado |
| **Botão Impressora** | `window.print()` | Abre o documento formatado para impressão ou salvamento em PDF. | Ícone compacto na barra superior |

---

## 5. Resumo da Sequência de Testes Recomendados

1. **Testes de Navegação Global:** Verificar se os links de Estudo, Administração e Financeiro respondem conforme o perfil logado (`admin_master`, `medico`, `viewer`).
2. **Testes de Filtros de Data:** Alternar entre *Hoje*, *Ontem*, *Últimos 7 dias* e o novo modal *Escolher data* para confirmar a correta conversão de datas para o formato `YYYYMMDD`.
3. **Testes de Edição Local de Nome:** Clicar no ícone de lápis ao lado do nome do paciente e alterar o nome; confirmar que a mudança persiste na listagem sem alterar o PACS original.
4. **Testes de Anexos (Paperclip):** Clicar no ícone de clipe em um estudo, testar a captura por câmera, o envio de múltiplos arquivos e a abertura das miniaturas no visualizador ampliado.
5. **Testes de Visualização e Laudo:** Acionar os botões de Visualizar (Cornerstone) e Laudo para garantir que os redirecionamentos de rota e parâmetros UID estão corretos.
