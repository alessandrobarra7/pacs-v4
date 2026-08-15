# Referência visual da prévia A4 institucional

A referência fornecida pelo usuário corresponde a uma folha A4 real exibida pelo Android/Drive, não a um cartão de dashboard. A estrutura esperada é: margem branca limpa; logo pequeno à esquerda; nome da unidade centralizado com subtítulo; linha divisória; dados do paciente em linhas simples; título do exame centralizado; corpo clínico com subtítulos e parágrafos; assinatura centralizada na área inferior; rodapé gráfico opcional e paginação discreta.

A primeira implementação da nova montagem já apresenta essa hierarquia, mas a inspeção visual do preview sandbox identificou que os blocos antigos persistem em posições salvas (`title` em 13% e `body` em 21%), causando sobreposição entre título e corpo. O refinamento deve atualizar os valores padrão para separar identificação/título/corpo, sem remover a possibilidade de arrastar e salvar posições personalizadas.

A segunda inspeção confirmou que os padrões atualizados deixam o cabeçalho, a identificação, o título, o corpo e a assinatura separados, sem a sobreposição observada na primeira versão. O botão Resetar disparou a alteração de estado e exibiu a indicação de alterações não salvas; o indicador de atualização foi mantido como overlay temporizado para a versão mobile, sem bloquear a manipulação.
