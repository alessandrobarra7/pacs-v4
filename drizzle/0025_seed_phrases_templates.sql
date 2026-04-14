-- ============================================================
-- Seed: Grupos e frases padrão do sistema (is_global = TRUE)
-- Estes registros são somente leitura para médicos.
-- O médico pode criar uma cópia pessoal via "Salvar como minha".
-- ============================================================

-- Grupos globais por modalidade
INSERT IGNORE INTO `phrase_groups` (`id`, `name`, `color`, `sort_order`, `is_global`, `created_by_user_id`, `isActive`) VALUES
(1000, 'Padrão — Radiografia (RX)', 'blue',   10, TRUE, NULL, TRUE),
(1001, 'Padrão — Tomografia (TC)',  'purple', 20, TRUE, NULL, TRUE),
(1002, 'Padrão — Ultrassom (US)',   'green',  30, TRUE, NULL, TRUE),
(1003, 'Padrão — Ressonância (RM)', 'orange', 40, TRUE, NULL, TRUE),
(1004, 'Padrão — Geral',           'gray',   50, TRUE, NULL, TRUE);

-- ── Frases RX ──────────────────────────────────────────────
INSERT IGNORE INTO `phrases` (`group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`) VALUES
(1000, NULL, 'Exame dentro dos limites da normalidade para a faixa etária.', TRUE, FALSE, 10, TRUE),
(1000, NULL, 'Não há evidências de consolidação pulmonar, derrame pleural ou pneumotórax.', TRUE, FALSE, 20, TRUE),
(1000, NULL, 'Área cardíaca de dimensões normais (índice cardiotorácico < 0,5).', TRUE, FALSE, 30, TRUE),
(1000, NULL, 'Seios costofrênicos livres bilateralmente.', TRUE, FALSE, 40, TRUE),
(1000, NULL, 'Mediastino de largura normal, sem desvio da traqueia.', TRUE, FALSE, 50, TRUE),
(1000, NULL, 'Trama vásculo-brônquica dentro dos limites normais.', TRUE, FALSE, 60, TRUE),
(1000, NULL, 'Estruturas ósseas visibilizadas sem alterações significativas.', TRUE, FALSE, 70, TRUE),
(1000, NULL, 'Partes moles sem alterações relevantes.', TRUE, FALSE, 80, TRUE),
(1000, NULL, 'Ausência de lesões líticas ou blásticas nas estruturas ósseas avaliadas.', TRUE, FALSE, 90, TRUE),
(1000, NULL, 'Alinhamento vertebral preservado, sem sinais de fratura ou luxação.', TRUE, FALSE, 100, TRUE);

-- ── Frases TC ──────────────────────────────────────────────
INSERT IGNORE INTO `phrases` (`group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`) VALUES
(1001, NULL, 'Exame realizado sem e com administração de contraste iodado endovenoso, sem intercorrências.', TRUE, FALSE, 10, TRUE),
(1001, NULL, 'Parênquima cerebral com densidade e morfologia preservadas, sem evidência de lesão expansiva ou hemorrágica.', TRUE, FALSE, 20, TRUE),
(1001, NULL, 'Sistema ventricular de morfologia e dimensões normais, sem sinais de hidrocefalia.', TRUE, FALSE, 30, TRUE),
(1001, NULL, 'Estruturas da linha média centradas.', TRUE, FALSE, 40, TRUE),
(1001, NULL, 'Espaços subaracnóideos de amplitude normal para a faixa etária.', TRUE, FALSE, 50, TRUE),
(1001, NULL, 'Não há evidências de processo expansivo intra ou extra-axial.', TRUE, FALSE, 60, TRUE),
(1001, NULL, 'Parênquima pulmonar sem consolidações, nódulos ou massas.', TRUE, FALSE, 70, TRUE),
(1001, NULL, 'Ausência de derrame pleural ou pericárdico.', TRUE, FALSE, 80, TRUE),
(1001, NULL, 'Órgãos abdominais de morfologia, dimensões e densidade preservadas.', TRUE, FALSE, 90, TRUE),
(1001, NULL, 'Ausência de linfonodomegalias ou coleções intra-abdominais.', TRUE, FALSE, 100, TRUE);

-- ── Frases US ──────────────────────────────────────────────
INSERT IGNORE INTO `phrases` (`group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`) VALUES
(1002, NULL, 'Exame realizado com transdutor convexo de 3,5 MHz, sem intercorrências.', TRUE, FALSE, 10, TRUE),
(1002, NULL, 'Fígado de dimensões normais, ecotextura homogênea, sem lesões focais.', TRUE, FALSE, 20, TRUE),
(1002, NULL, 'Vesícula biliar de paredes finas, sem cálculos ou espessamento.', TRUE, FALSE, 30, TRUE),
(1002, NULL, 'Vias biliares intra e extra-hepáticas sem dilatação.', TRUE, FALSE, 40, TRUE),
(1002, NULL, 'Pâncreas de ecotextura homogênea, sem dilatação do ducto de Wirsung.', TRUE, FALSE, 50, TRUE),
(1002, NULL, 'Baço de dimensões normais, ecotextura homogênea.', TRUE, FALSE, 60, TRUE),
(1002, NULL, 'Rins de dimensões e ecotextura normais, sem hidronefrose ou cálculos.', TRUE, FALSE, 70, TRUE),
(1002, NULL, 'Ausência de líquido livre na cavidade abdominal.', TRUE, FALSE, 80, TRUE),
(1002, NULL, 'Tireoide de dimensões normais, ecotextura homogênea, sem nódulos.', TRUE, FALSE, 90, TRUE),
(1002, NULL, 'Ausência de linfonodomegalias cervicais.', TRUE, FALSE, 100, TRUE);

-- ── Frases RM ──────────────────────────────────────────────
INSERT IGNORE INTO `phrases` (`group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`) VALUES
(1003, NULL, 'Exame realizado em aparelho de 1,5 Tesla, com sequências T1, T2, FLAIR, DWI e T1 com gadolínio.', TRUE, FALSE, 10, TRUE),
(1003, NULL, 'Sinal do parênquima cerebral preservado nas sequências estudadas.', TRUE, FALSE, 20, TRUE),
(1003, NULL, 'Ausência de restrição à difusão nas sequências DWI/ADC.', TRUE, FALSE, 30, TRUE),
(1003, NULL, 'Não há realce anômalo pelo meio de contraste.', TRUE, FALSE, 40, TRUE),
(1003, NULL, 'Meniscos de morfologia e sinal preservados.', TRUE, FALSE, 50, TRUE),
(1003, NULL, 'Ligamentos cruzados e colaterais íntegros.', TRUE, FALSE, 60, TRUE),
(1003, NULL, 'Cartilagem articular de espessura e sinal preservados.', TRUE, FALSE, 70, TRUE),
(1003, NULL, 'Manguito rotador íntegro, sem sinais de rotura parcial ou total.', TRUE, FALSE, 80, TRUE),
(1003, NULL, 'Discos intervertebrais de altura e sinal preservados.', TRUE, FALSE, 90, TRUE),
(1003, NULL, 'Canal vertebral e foramens neurais de calibre normal.', TRUE, FALSE, 100, TRUE);

-- ── Frases Gerais ──────────────────────────────────────────
INSERT IGNORE INTO `phrases` (`group_id`, `user_id`, `content`, `is_global`, `is_favorite`, `sort_order`, `isActive`) VALUES
(1004, NULL, 'Correlacionar com dados clínicos e laboratoriais.', TRUE, FALSE, 10, TRUE),
(1004, NULL, 'Recomenda-se acompanhamento clínico e radiológico.', TRUE, FALSE, 20, TRUE),
(1004, NULL, 'Sugere-se complementação com exame contrastado para melhor avaliação.', TRUE, FALSE, 30, TRUE),
(1004, NULL, 'Achados inespecíficos; correlacionar com quadro clínico.', TRUE, FALSE, 40, TRUE),
(1004, NULL, 'Exame de qualidade técnica satisfatória.', TRUE, FALSE, 50, TRUE),
(1004, NULL, 'Limitação técnica do exame: artefatos de movimento prejudicam a avaliação.', TRUE, FALSE, 60, TRUE),
(1004, NULL, 'Comparar com exames anteriores quando disponíveis.', TRUE, FALSE, 70, TRUE);

-- ============================================================
-- Seed: Templates padrão do sistema (isGlobal = TRUE)
-- unit_id = NULL, owner_user_id = NULL
-- ============================================================

INSERT IGNORE INTO `templates` (`name`, `modality`, `exam_title`, `bodyTemplate`, `isGlobal`, `isActive`, `unit_id`, `owner_user_id`) VALUES

('Radiografia de Tórax — Padrão', 'RX', 'Radiografia de Tórax PA e Perfil',
'<h3>Técnica</h3>
<p>Radiografia do tórax nas incidências PA e perfil.</p>

<h3>Achados</h3>
<p><strong>Parênquima pulmonar:</strong> Sem consolidações, infiltrados ou nódulos.</p>
<p><strong>Pleura:</strong> Seios costofrênicos livres bilateralmente.</p>
<p><strong>Mediastino:</strong> Área cardíaca de dimensões normais. Mediastino centrado, sem alargamento.</p>
<p><strong>Estruturas ósseas:</strong> Arcos costais, clavículas e escápulas sem alterações.</p>
<p><strong>Partes moles:</strong> Sem alterações relevantes.</p>

<h3>Impressão Diagnóstica</h3>
<p>Radiografia de tórax dentro dos limites da normalidade.</p>',
TRUE, TRUE, NULL, NULL),

('Tomografia de Crânio sem Contraste — Padrão', 'TC', 'Tomografia Computadorizada de Crânio sem Contraste',
'<h3>Técnica</h3>
<p>Tomografia computadorizada do crânio sem administração de contraste endovenoso, com cortes axiais de 5 mm.</p>

<h3>Achados</h3>
<p><strong>Parênquima cerebral:</strong> Densidade e morfologia preservadas, sem evidência de lesão expansiva, hemorrágica ou isquêmica aguda.</p>
<p><strong>Sistema ventricular:</strong> Morfologia e dimensões normais, sem sinais de hidrocefalia.</p>
<p><strong>Espaços subaracnóideos:</strong> Amplitude normal para a faixa etária.</p>
<p><strong>Estruturas da linha média:</strong> Centradas.</p>
<p><strong>Estruturas ósseas:</strong> Sem fraturas ou lesões líticas/blásticas.</p>

<h3>Impressão Diagnóstica</h3>
<p>Tomografia computadorizada do crânio sem contraste sem alterações significativas.</p>',
TRUE, TRUE, NULL, NULL),

('Ultrassom de Abdome Total — Padrão', 'US', 'Ultrassonografia de Abdome Total',
'<h3>Técnica</h3>
<p>Ultrassonografia do abdome total realizada com transdutor convexo de 3,5 MHz.</p>

<h3>Achados</h3>
<p><strong>Fígado:</strong> Dimensões normais, ecotextura homogênea, sem lesões focais. Veias supra-hepáticas e porta de calibre normal.</p>
<p><strong>Vesícula biliar:</strong> Paredes finas e regulares, sem cálculos ou espessamento parietal.</p>
<p><strong>Vias biliares:</strong> Intra e extra-hepáticas sem dilatação.</p>
<p><strong>Pâncreas:</strong> Visualização parcial. Ecotextura homogênea, sem dilatação do ducto de Wirsung.</p>
<p><strong>Baço:</strong> Dimensões normais, ecotextura homogênea.</p>
<p><strong>Rins:</strong> Dimensões e ecotextura normais bilateralmente, sem hidronefrose, cálculos ou lesões focais.</p>
<p><strong>Bexiga:</strong> Paredes regulares, sem lesões intraluminais.</p>
<p><strong>Cavidade abdominal:</strong> Ausência de líquido livre.</p>

<h3>Impressão Diagnóstica</h3>
<p>Ultrassonografia de abdome total sem alterações significativas.</p>',
TRUE, TRUE, NULL, NULL),

('Ressonância de Joelho — Padrão', 'RM', 'Ressonância Magnética de Joelho',
'<h3>Técnica</h3>
<p>Ressonância magnética do joelho realizada em aparelho de 1,5 Tesla, com sequências DP Fat-Sat nos planos coronal, sagital e axial, T1 sagital e T2 coronal.</p>

<h3>Achados</h3>
<p><strong>Menisco medial:</strong> Morfologia e sinal preservados, sem evidência de rotura.</p>
<p><strong>Menisco lateral:</strong> Morfologia e sinal preservados, sem evidência de rotura.</p>
<p><strong>Ligamento cruzado anterior:</strong> Íntegro, com sinal e tensão preservados.</p>
<p><strong>Ligamento cruzado posterior:</strong> Íntegro.</p>
<p><strong>Ligamentos colaterais:</strong> Medial e lateral íntegros.</p>
<p><strong>Cartilagem articular:</strong> Espessura e sinal preservados nos compartimentos femorotibial medial, lateral e femoropatelar.</p>
<p><strong>Ossos:</strong> Sem fraturas, edema ósseo ou lesões focais.</p>
<p><strong>Partes moles periarticulares:</strong> Sem alterações relevantes.</p>

<h3>Impressão Diagnóstica</h3>
<p>Ressonância magnética do joelho sem alterações significativas.</p>',
TRUE, TRUE, NULL, NULL),

('Ressonância de Coluna Lombar — Padrão', 'RM', 'Ressonância Magnética de Coluna Lombar',
'<h3>Técnica</h3>
<p>Ressonância magnética da coluna lombar realizada em aparelho de 1,5 Tesla, com sequências T1 e T2 nos planos sagital e axial.</p>

<h3>Achados</h3>
<p><strong>Alinhamento:</strong> Lordose lombar fisiológica preservada, sem sinais de escoliose.</p>
<p><strong>Corpos vertebrais:</strong> Morfologia, altura e sinal preservados de L1 a S1.</p>
<p><strong>Discos intervertebrais:</strong> Altura e sinal preservados nos níveis estudados.</p>
<p><strong>L3-L4:</strong> Sem alterações significativas.</p>
<p><strong>L4-L5:</strong> Sem alterações significativas.</p>
<p><strong>L5-S1:</strong> Sem alterações significativas.</p>
<p><strong>Canal vertebral:</strong> Calibre normal em todos os níveis.</p>
<p><strong>Foramens neurais:</strong> Pérvios bilateralmente.</p>
<p><strong>Cone medular:</strong> Posicionado em nível habitual (L1), sinal preservado.</p>
<p><strong>Partes moles paravertebrais:</strong> Sem alterações relevantes.</p>

<h3>Impressão Diagnóstica</h3>
<p>Ressonância magnética da coluna lombar sem alterações significativas.</p>',
TRUE, TRUE, NULL, NULL);
