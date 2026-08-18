# Especificação — Assistente RadiAnt para Windows

## Finalidade

O Assistente RadiAnt é um componente Windows pequeno, instalado uma única vez em computadores pessoais que **já possuem o RadiAnt instalado**. Ele não é um visualizador, não é um PACS e não modifica o RadiAnt. Sua única função é receber um comando temporário emitido pelo Portal, baixar o estudo já autorizado para uma pasta temporária local e solicitar que o RadiAnt abra esses arquivos.

> O Assistente não pode ler, alterar, substituir ou remover `pacs.xml`, IP, porta, AE Title, preferências, licença ou qualquer configuração hospitalar existente do RadiAnt.

## Fluxo de ativação

Na primeira utilização, o médico clica em **Ativar RadiAnt**. O Portal fornece o instalador do Assistente, que registra apenas o protocolo próprio `pacs-radiant://`. A execução local localiza o executável RadiAnt sem alterar sua configuração, abre o programa e exibe uma mensagem local de conclusão.

No piloto, o Portal não afirma detectar a instalação pelo navegador. Se o RadiAnt não estiver instalado, o Assistente informa essa condição localmente e não registra a associação de protocolo. Uma confirmação HTTPS de ativação vinculada a dispositivo permanece uma evolução futura, antes de qualquer implantação ampla.

## Fluxo de abertura de estudo

Quando o médico autenticado clica em RadiAnt para um estudo, o Portal verifica sessão, RBAC, unidade e Study Instance UID. Somente depois disso emite um token aleatório de uso único com expiração curta e ativa a URI:

```text
pacs-radiant://open/<token-opaco>
```

O Assistente valida rigorosamente o formato da URI, conecta apenas ao domínio HTTPS permitido do Portal e solicita o pacote temporário associado ao token. O pacote é extraído em diretório temporário por usuário, com proteção contra path traversal. O Assistente abre a pasta resultante no RadiAnt pelo argumento documentado `-d`; o argumento `-f` permanece como alternativa para uma lista de arquivos. [1]

O token não contém Study UID, usuário, caminho, URL do PACS ou qualquer credencial. O Portal mantém os dados no lado servidor e marca o token como consumido após a primeira entrega. Uma URI pode ser chamada por qualquer processo local; por isso, a URI por si só nunca deve representar autorização suficiente.

## Propriedades de segurança

| Controle | Aplicação |
|---|---|
| Autorização | Somente o endpoint autenticado do Portal emite token após `assertDicomFileAccess`. |
| Escopo | Um token corresponde a um estudo, um usuário e uma ativação pendente. |
| Expiração | Tokens de abertura e ativação têm vida curta e são inválidos após uso. |
| Integridade | O Assistente aceita apenas `pacs-radiant://activate/` e `pacs-radiant://open/` com token opaco previsto. |
| Transporte | A entrega do pacote ocorre somente por HTTPS para origem permitida. |
| Isolamento | Não há Query/Retrieve, C-FIND, C-GET, C-MOVE, IP, porta, AE Title ou credencial de PACS na estação. |
| Processos | O Assistente nunca repassa URI, URL ou valor arbitrário a `Process.Start`; ele só chama o executável RadiAnt localizado com diretório temporário controlado. |
| Limpeza | Diretórios temporários devem ser removidos por política explícita e auditável, sem apagar arquivos hospitalares preexistentes. |

As recomendações de tratar parâmetros de URI como entrada não confiável, restringir esquemas/hosts e evitar executar valores diretamente são consistentes com a orientação da Microsoft para aplicativos Windows ativados por URI. [2]

## Limites conhecidos

O Portal não pode detectar de maneira confiável pelo navegador se o RadiAnt ou o Assistente está instalado. O usuário deve iniciar a ativação uma vez. A confirmação confiável é feita pelo callback HTTPS do Assistente, e não por temporizador no navegador.

O pacote de piloto é um script PowerShell por usuário, sem assinatura de código. Ele é adequado apenas para teste controlado em computador consentido. Uma distribuição ampla deve usar um instalador assinado e revisão de segurança do componente Windows.

Como o RadiAnt permanece aberto com arquivos locais, a remoção do diretório temporário não pode ocorrer enquanto o programa ainda precisar das imagens. A política de limpeza será definida e validada no piloto; ela não pode encerrar o RadiAnt do médico, tocar em suas configurações ou remover arquivos fora do diretório exclusivo do Assistente.

## Valores padrão observados e por que não são uma rota de entrega suficiente

Uma captura do RadiAnt recém-instalado confirma os campos padrão **Listener port `11112`** e **My AE title `RADIANT`**, sem PACS location cadastrada. Esses valores podem ser usados por um hospital que faça envio DICOM para aquela estação, mas não fornecem uma rota universal para o Portal alcançar computadores pessoais externos.

Para a VM1 enviar C-STORE diretamente ao listener, ela precisaria conhecer e alcançar o endereço público atual da máquina, com NAT e firewall preparados. Além disso, o AE Title padrão `RADIANT` é compartilhado por instalações novas e não identifica unicamente um médico ou uma estação. Assim, o Portal não pode usar esses valores como autorização clínica ou como destino confiável de entrega para todos os usuários externos.

O Assistente permanece preferível: ele estabelece a conexão de saída para o Portal por HTTPS, evita dependência de IP público, não utiliza o listener DICOM existente e preserva todas as configurações do RadiAnt.

## Referências

1. [Command-line arguments — RadiAnt DICOM Viewer](https://www.radiantviewer.com/dicom-viewer-manual/command-line_arguments.html)
2. [Handle URI activation — Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation)
