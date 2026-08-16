# Auditoria visual A4 — 16/08/2026

A captura enviada pelo usuário compara a prévia real administrativa com o editor clínico. A estrutura canônica deve manter a mesma origem percentual para `logo1..logo3`, `patientInfo`, `patientName`, `title`, `body` e `footer`; o conteúdo textual pode variar conforme o exame e o estado do laudo.

Durante a validação no sandbox, a prévia real administrativa exibiu a folha A4 com identificação em linha (`Realizado em`, `Nasc.`, `Sexo`), nome do paciente, título, corpo e rodapé nas posições persistidas, sem erro no console. O editor clínico aberto sem um estudo carregado permaneceu em estado de carregamento/placeholder e não permitiu uma comparação de dados reais; isso não foi tratado como divergência de layout.

As correções aplicadas nesta sessão padronizaram a identificação e a tipografia do conteúdo demonstrativo no admin, adicionaram limite físico `210mm` e centralização na folha compartilhada, e expandiram layouts legados com a chave única `logo` para `logo1..logo3`. O fluxo multi-seção clínico também passou a instanciar `SharedReportSheet` por exame.

A validação automatizada relevante foi executada com TypeScript sem erros e 184 testes Vitest passando. Ainda é necessário validar com um estudo real carregado no editor clínico e, se necessário, ajustar somente conteúdo/estado do laudo sem duplicar a composição visual.
