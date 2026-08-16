# Auditoria visual A4 — 16/08/2026

A captura enviada pelo usuário compara a prévia real administrativa com o editor clínico. A estrutura canônica deve manter a mesma origem percentual para `logo1..logo3`, `patientInfo`, `patientName`, `title`, `body` e `footer`; o conteúdo textual pode variar conforme o exame e o estado do laudo.

Durante a validação no sandbox, a prévia real administrativa exibiu a folha A4 com identificação em linha (`Realizado em`, `Nasc.`, `Sexo`), nome do paciente, título, corpo e rodapé nas posições persistidas, sem erro no console. O editor clínico aberto sem um estudo carregado permaneceu em estado de carregamento/placeholder e não permitiu uma comparação de dados reais; isso não foi tratado como divergência de layout.

As correções aplicadas nesta sessão padronizaram a identificação e a tipografia do conteúdo demonstrativo no admin, adicionaram limite físico `210mm` e centralização na folha compartilhada, e expandiram layouts legados com a chave única `logo` para `logo1..logo3`. O fluxo multi-seção clínico também passou a instanciar `SharedReportSheet` por exame.

A validação automatizada relevante foi executada com TypeScript sem erros e 184 testes Vitest passando. Ainda é necessário validar com um estudo real carregado no editor clínico e, se necessário, ajustar somente conteúdo/estado do laudo sem duplicar a composição visual.

## Revalidação após a correção

Com o servidor reativado, o editor clínico renderizou a mesma faixa de corpo institucional da prévia: título `LAUDO RADIOLOGICO` e linhas orientativas de `Técnica`, `Achados` e `Conclusão`. As linhas são apenas guia visual, não são inseridas no `contentEditable` nem persistidas como conteúdo médico. O sandbox carregou o editor sem um estudo plenamente resolvido nessa rota, portanto os campos reais de paciente/título permaneceram como placeholders; a estrutura visual foi confirmada.

## Teste representativo com dados da captura

Foi carregado no sandbox um estudo representativo com `ANTONIA DE SOUZA BATISTA`, exame `CRANIO`, data, nascimento e sexo. O editor clínico exibiu o nome completo, o título do exame na faixa própria e a mesma estrutura de corpo institucional (`LAUDO RADIOLOGICO`, `Técnica`, `Achados`, `Conclusão`) dentro da área persistida do bloco `body`. A guia permanece visual e não é conteúdo clínico salvo.

## Fluxo real da listagem

A listagem PACS chegou a exibir um estudo real de Antonia e o botão `Laudar`, mas a consulta foi atualizada logo depois e retornou `Nenhum estudo encontrado`; por isso não foi possível abrir a rota clínica pelo clique normal sem assumir um UID. A validação representativa anterior continua válida, e a limitação de dados intermitentes do sandbox foi registrada em vez de mascarada.

## Validação com UID real do PACS

O UID real recuperado da listagem foi aberto no fluxo clínico. A folha exibiu a logo institucional `INSTITUTO ACQUA`, o paciente `ANTONIA DE SOUZA BATISTA`, o título `CRANIO`, os dados do estudo e a estrutura visual do corpo com `LAUDO RADIOLOGICO`, `Técnica`, `Achados` e `Conclusão`. A composição corresponde à referência administrativa em escala e ordem de blocos; o corpo permanece orientativo até que um modelo ou texto clínico seja inserido.

## Teste multi-seção

Com duas seções temporárias (`CRANIO` e `TORAX`) no mesmo estudo, o editor renderizou duas folhas A4 com a logo, dados do paciente e título de cada exame. O modo multi-seção preservou a separação por exame e não inseriu achados fictícios. A guia de corpo vazio desta validação multi-seção continua usando o placeholder de edição da seção, enquanto a página única usa a guia institucional completa; esse é um refinamento futuro caso se queira igualar também o estado vazio de cada seção.

## Correção de fonte única — 16/08/2026

A partir desta revisão, o layout persistido em `model_layouts.block_positions` é consumido como a única fonte de geometria pelo editor clínico e pela impressão. O PDF de página única e o PDF multi-seção passaram a chamar `renderSharedReportSheetHtml`, que renderiza o próprio `SharedReportSheet`; não existe mais uma montagem manual independente de `logo1`, `patientInfo`, `patientName`, `title`, `body` e `footer` nesses caminhos. Logos, fundo e rodapé são convertidos para dados embutidos antes da abertura da janela de impressão, preservando o resultado quando a janela não possui a sessão original.

A regressão automatizada utiliza um layout deliberadamente alterado — logo em 71%/60%, paciente em 33%/3%, título em 0%/19%, corpo em 1%/32% e rodapé em 1%/73% — e confirma que as mesmas coordenadas, dados e blocos aparecem no HTML estático. TypeScript e 185 testes Vitest foram executados com sucesso.

## Referência visual de paciente organizada — validação real

Na rota clínica real, a folha exibiu nome do paciente em linha própria, unidade em destaque, data de nascimento e sexo agrupados, data de realização e modalidade em linha própria, título centralizado e guia de corpo com Técnica, Achados e Conclusão. O estudo multi-seção exibiu folhas separadas para CRANIO e TORAX. A logo Instituto Acqua permaneceu visível no rodapé conforme a posição persistida do layout. Dados confirmados no sandbox: Antonia de Souza Batista, nascimento 16/08/1972, sexo F, realização 15/08/2026 e modalidade CT.

A validação visual posterior confirmou no editor clínico os dados organizados de Antonia e as duas seções CRANIO/TORAX. O botão Imprimir permaneceu disponível no fluxo clínico; o sandbox abriu a rota sem erro de console, embora a visualização do diálogo nativo de impressão dependa do navegador do usuário. A composição usada para a impressão recebe os mesmos componentes `ClinicalPatientName` e `ClinicalPatientDetails` da folha médica.


## Última revisão — 16/08/2026

A divergência restante não estava no banco nem nas coordenadas persistidas. O último caminho paralelo era o renderer de impressão do `ReportEditorPage`: ele ainda montava `patientInfo` como uma linha única (`Realizado em · Nasc. · Sexo`), enquanto a folha clínica usa `ClinicalPatientName` e `ClinicalPatientDetails`. Esse caminho foi corrigido tanto para laudo multi-seção quanto para página única. O PDF agora recebe o mesmo nome do paciente em linha própria e o mesmo bloco organizado de unidade, nascimento, sexo e data do exame usado no editor clínico.

A prévia administrativa da unidade #1 foi aberta no sandbox e confirmou as posições persistidas atualmente: logo em 2%,2%; dados do paciente em 2%,15%; nome em 2%,25%; título em 2%,31%; corpo em 2%,38%; rodapé em 2%,88%. O editor clínico mantém a mesma folha A4 compartilhada e consome essas posições. A listagem PACS oscilou durante a validação e o endpoint retornou zero estudos em uma nova consulta, embora o mesmo UID real de Antonia/CRANIO já tenha sido validado em auditorias anteriores; isso é uma indisponibilidade momentânea de dados do sandbox, não uma divergência visual do renderer.

Validação de código concluída: TypeScript sem erros e 186 testes Vitest passando. A validação em aparelho móvel físico continua pendente e não foi simulada como concluída.

## Contrato final

- Admin, editor clínico e PDF usam `SharedReportSheet` e `block_positions` persistidos.
- Editor clínico e PDF usam `ClinicalPatientName` + `ClinicalPatientDetails`.
- O admin continua focado na geometria; nenhuma alteração de banco foi necessária.
- A composição clínica alternativa não é usada nos caminhos corrigidos.

A composição admin → médico → PDF foi encerrada no código. Refinamentos futuros de fonte, rótulos ou branding devem ser tratados como nova solicitação, sem reabrir a fonte única de layout.

Evidência: `pnpm check` concluído sem erros; `pnpm test -- --run`: 18 arquivos, 186 testes aprovados.

Limitação remanescente: a confirmação de arraste/redimensionamento em dispositivo móvel físico ainda depende de um aparelho real conectado ao usuário. A compatibilidade por Pointer Events foi preservada e coberta por teste automatizado no sandbox.


## Atualização — Remoção do nome da unidade e reorganização do cabeçalho do paciente
Conforme solicitado pelo usuário, o nome da unidade (`unitName`) foi removido do cabeçalho do laudo. Os dados do paciente e do exame foram reorganizados em duas linhas limpas e estruturadas:
1. Linha superior: Data de realização do exame e Modalidade.
2. Linha inferior: Data de nascimento e Sexo.
O nome do paciente permanece isolado em linha própria (`ClinicalPatientName`). Esta alteração foi aplicada no `ClinicalPatientDetails.tsx` e refletida em todas as visualizações clínicas e exportações PDF, mantendo a geometria persistida pelo administrador intacta.
Testes: 186 testes Vitest aprovados com sucesso.


## Atualização — Unificação total do cabeçalho de demonstração (Admin) e clínico (Médico)
Para atender à observação detalhada do usuário sobre a divergência visual entre a prévia administrativa e a tela do médico:
1. O preview administrativo no `LayoutEditorPage.tsx` passou a utilizar exatamente os mesmos componentes `ClinicalPatientName` e `ClinicalPatientDetails`.
2. O nome do paciente agora aparece em linha própria, seguido pelas linhas estruturadas de data de realização, modalidade, data de nascimento e sexo (sem o nome da unidade).
3. A geometria persistida (`block_positions`) e o banco de dados permaneceram inalterados; apenas a renderização dos dados do paciente foi uniformizada entre os dois lados.
Testes: 186 testes Vitest aprovados com sucesso.


## Correção Final — Ordem de renderização no DOM do SharedReportSheet
Para garantir que a ordem visual dos blocos `patientName` e `patientInfo` seja exatamente idêntica em todas as instâncias (admin, editor médico e PDF) sem alterar as coordenadas persistidas no banco:
1. A ordem dos nós JSX no componente `SharedReportSheet.tsx` foi invertida para renderizar `patientName` antes de `patientInfo` no fluxo do DOM.
2. Desta forma, mesmo que um layout legado ou padrão deixe as coordenadas próximas, a ordem de empilhamento e fluxo respeitará rigorosamente o padrão visual solicitado (nome em linha própria acima, seguido pelos detalhes do exame e do paciente).
Testes: 186 testes Vitest aprovados com sucesso.


## Atualização — Remoção do rótulo "Nome do paciente:"
Conforme instrução direta do usuário, a legenda "Nome do paciente:" foi removida do componente `ClinicalPatientName`. Agora o nome completo do paciente é exibido isolado em linha própria, em letras maiúsculas e com destaque tipográfico limpo, sem nenhum texto de rótulo redundante.
Testes: 186 testes Vitest aprovados com sucesso.


## Atualização — Mapeamento de nascimento/sexo e rótulo "Data"
Conforme solicitado:
1. O carregamento do estudo no editor clínico (`ReportEditorPage.tsx`) foi normalizado para mapear `patientBirthDate` e `patientSex` salvos na sessão para as propriedades canônicas `birthDate` e `sex`, resolvendo o problema de dados em branco ("—").
2. O rótulo "Data de realização do exame:" foi alterado para "Data:" em `ClinicalPatientDetails.tsx`.
3. Todos os testes unitários (186 testes) e checagens TypeScript passaram com sucesso, mantendo total paridade entre admin, editor clínico e PDF.


## Atualização — Alinhamento da Impressão PDF com Modalidade
Após a inspeção do PDF de teste fornecido (`testesaaaaa.pdf`), o gerador de impressão estática do editor clínico (`handlePrint` em `ReportEditorPage.tsx`) foi ajustado para repassar a `modality` do estudo para o componente `ClinicalPatientDetails`. Desta forma, a impressão PDF gerada reflete exatamente o mesmo layout estruturado em duas linhas (Data + Modalidade e Nascimento + Sexo) exibido na tela do editor e na prévia administrativa.
Testes: 186 testes Vitest aprovados com sucesso.
