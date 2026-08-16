# Investigação da ordem das imagens DICOM

## Reprodução no sandbox — 16/08/2026

O estudo real de ANTONIA DE SOUZA BATISTA, com StudyInstanceUID `1.2.840.113619.2.415.3.2831193700.534.1786793198.951`, abriu no sandbox com 262 imagens e três séries: SCOUT (2), AXIAL CORRIGIDO PM (130) e AXIAL CORRIGIDO OSSO (130).

O visualizador mostra o contador inicial `1 / 262` e apresenta três controles HTML `input[type=range]`. O controle principal de slice tem `min=0`, `max=261` e começa em `value=0`; o controle vertical também tem `min=0`, `max=261`; há ainda um slider inferior com aria-label `Navegar entre imagens`.

Foi movido programaticamente o controle principal para a posição 55, disparando eventos `input` e `change`. O elemento continuou com o título `Slice 1 de 262`, indicando que o título não é atualizado pelo evento sintético ou que o listener depende de outra interação. A reprodução visual precisa ser complementada com inspeção do stack e dos metadados DICOM para confirmar a ordem real.

## Hipóteses técnicas a verificar

1. O backend lista os arquivos com ordenação lexicográfica pelo SOPInstanceUID (`.sort()`), que não representa necessariamente a ordem anatômica ou `InstanceNumber`.
2. O frontend inicialmente ordena os imageIds com `.sort()` em `addImageToStack`, o que pode reordenar UIDs e misturar séries.
3. A ordem correta deve ser derivada de metadados DICOM, prioritariamente `SeriesInstanceUID`, `InstanceNumber` e, quando necessário, posição espacial (`ImagePositionPatient`), preservando a separação das séries.
4. O carregamento progressivo pode inserir imagens fora de ordem e depois reordenar o stack apenas por nome de arquivo.

## Confirmação pelos metadados

A análise do cache confirmou a causa. O estudo tem 262 arquivos em três séries: SCOUT com 2 imagens, AXIAL CORRIGIDO PM com 130 e AXIAL CORRIGIDO OSSO com 130. A ordem de chegada do C-STORE também é intercalada entre séries.

A listagem lexicográfica atual dos nomes começa intercalando arquivos com `InstanceNumber` 130, 18, 129, 17, 128, 16, 127, 15, ... dentro da mesma série, porque o nome é um SOP Instance UID variável e não possui relação com a sequência clínica. A ordenação correta por `SeriesNumber` e `InstanceNumber` começa em SCOUT 1, SCOUT 2, depois série 300 com instâncias 1, 2, 3, 4, ... .

Conclusão: o problema relatado pelo usuário é real e está no uso de `.sort()` sobre nomes de arquivo/SOPInstanceUID no backend e no frontend. O stack precisa ser construído com ordenação determinística por metadados DICOM e sem misturar séries na sequência principal.

## Validação após a correção

Após reiniciar o servidor e reabrir o mesmo estudo no sandbox, o visualizador carregou novamente 262 imagens. As miniaturas das séries passaram a apontar para arquivos terminados em `.2.dcm` para as séries axiais, em vez de `.10.dcm`, confirmando que o primeiro arquivo de cada série agora corresponde à instância 1/primeira posição.

O visualizador permaneceu em `1 / 262` com as três séries carregadas, sem erro de conexão. A validação seguinte deve consultar diretamente `/api/dicom-files/:studyUid` e mover o slider para posições intermediárias e finais para conferir que a lista entregue ao Cornerstone segue 1, 2, 3, ..., 130 dentro de cada série.

## Resultado da validação funcional

A chamada autenticada à API `/api/dicom-files/1.2.840.113619.2.415.3.2831193700.534.1786793198.951` retornou `count=262`. Os primeiros arquivos retornados foram SCOUT instâncias 1 e 2, seguidos pela série axial PM nos arquivos `.2.dcm`, `.3.dcm`, `.4.dcm`, `.5.dcm`, `.6.dcm`, `.7.dcm`, `.8.dcm`, `.9.dcm`, `.10.dcm` e `.11.dcm`. Os últimos arquivos retornados foram a série axial OSSO terminando nas instâncias 120 a 130, em ordem crescente.

Ao mover o slider para 55%, o viewer exibiu `132 / 262` e manteve as miniaturas das séries iniciando na instância 1. Não foi observada a alternância anterior entre instâncias como 56, 40, 5 e 6 na lista fornecida ao stack.
