# Guia de Teste — Assistente RadiAnt em Windows

## Objetivo do piloto

Este teste verifica se o Portal abre um estudo autorizado no **RadiAnt já instalado**, sem alterar qualquer configuração hospitalar existente. O piloto não configura PACS, não cadastra IP, não altera porta, AE Title ou licença e não usa Query/Retrieve.

> O Assistente é um script PowerShell de teste sem assinatura de código. Execute-o somente em computador Windows autorizado para este piloto.

## Pré-requisitos

O computador precisa executar Windows, possuir o RadiAnt instalado e ter acesso HTTPS ao Portal. O estudo escolhido deve estar previamente carregado no visualizador web do Portal, para que as imagens estejam no cache temporário da VM1.

## Ativação única

No visualizador DICOM do Portal, clique em **Ativar RadiAnt**. O navegador baixará `PacsRadiantAssistant.ps1`. Abra o PowerShell e execute, ajustando o caminho caso o navegador tenha usado outra pasta de download:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\PacsRadiantAssistant.ps1"
```

Quando o RadiAnt for encontrado, ele será aberto e será exibida a mensagem **Ativação concluída**. O script cria apenas:

| Local | Finalidade |
|---|---|
| `HKCU:\Software\Classes\pacs-radiant` | Associação do protocolo local do Assistente. |
| `%LOCALAPPDATA%\PacsRadiantAssistant` | Script e diretório temporário dos estudos baixados. |

O teste não deve modificar qualquer arquivo ou configuração pertencente ao RadiAnt.

## Abertura de estudo

Após a ativação, volte ao visualizador web com um estudo carregado e clique em **RadiAnt**. Autorize a abertura do protocolo `pacs-radiant://` se o navegador solicitar confirmação. O Assistente baixa um pacote temporário de uso único, extrai os arquivos DICOM em seu diretório próprio e chama o RadiAnt para abrir a pasta.

## Critérios de aceitação

O piloto será considerado bem-sucedido se o RadiAnt abrir o estudo escolhido e as configurações hospitalares preexistentes — PACS locations, listener port e AE Title — permanecerem inalteradas. O botão deve falhar de forma controlada quando o token expirar, for reutilizado, o RadiAnt não existir ou o estudo não estiver mais disponível no cache da VM1.

## Coleta de evidência

Em caso de falha, registre somente a mensagem do Assistente Windows e execute na VM1 o comando abaixo. Ele filtra eventos técnicos do Assistente sem pedir credenciais nem imprimir conteúdo clínico.

```bash
pm2 logs pacs-portal --lines 120 --nostream 2>/dev/null | grep -Ei 'RadiAnt Assistant|radiant-assistant|DICOM Export Token' || true
```

Não envie o estudo, o ZIP, token, credenciais, endereços de PACS ou capturas com dados identificáveis de pacientes.
