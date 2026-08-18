# Assistente RadiAnt para Windows

Este projeto produz um executável Windows e um instalador visual por usuário. O instalador registra apenas o protocolo `pacs-radiant://` em `HKCU` e não lê nem modifica nenhuma configuração preexistente do RadiAnt.

## Compilação

```bash
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H=windowsgui" -o build/PacsRadiantAssistant.exe .
makensis installer.nsi
```

O executável aceita apenas `pacs-radiant://open/<token-opaco>`, baixa um estudo de uso único do Portal por HTTPS e abre a pasta temporária no RadiAnt com `-d`.

> O endereço de produção está deliberadamente compilado no código. Para usar outro domínio, altere `portalBaseURL`, realize revisão de segurança e gere um novo instalador assinado.
