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
