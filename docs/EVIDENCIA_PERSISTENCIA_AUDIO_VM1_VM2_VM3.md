# Evidência de Persistência de Áudio — VM1, VM2 e VM3

**Data da verificação:** 17 de agosto de 2026  
**Escopo:** rastrear um áudio clínico real desde o Portal até o objeto físico no MinIO, sem registrar credenciais.  
**Método:** comandos exclusivamente de leitura executados nas três VMs.

## Conclusão auditável

O áudio clínico validado foi persistido fisicamente na **VM3**, dentro do bucket privado MinIO `vm3-storage`. A **VM2** contém exclusivamente os metadados e a chave do objeto. A **VM1** hospeda o Portal e atua como proxy autenticado para entregar a mídia ao navegador; não é o local de persistência permanente desse arquivo.

> A confirmação cobre o áudio de 17 segundos registrado em 17 de agosto de 2026. Ela não presume que arquivos anteriores a essa migração já tenham saído do armazenamento local legado da VM1.

| Camada | Evidência coletada | Resultado |
|---|---|---|
| **VM1 — Portal** | Ambiente do PM2 apontou `DB_HOST=172.16.3.101`, `DB_PORT=3306` e `DB_NAME=pacs_portal`. | A aplicação não consulta o MySQL local da VM1; utiliza a VM2. |
| **VM2 — MySQL** | Registro `study_audio_reports.id = 3`, duração de 17 s, `file_size = 272090` e `file_key` iniciada por `audio_reports/`. | A VM2 mantém os metadados e a chave de armazenamento, sem bytes do áudio. |
| **VM3 — MinIO** | `mc stat` encontrou o objeto correspondente em `vm3-storage/audio_reports/...` com `Content-Type: audio/webm`. | A VM3 mantém o arquivo físico privado. |

## Registro técnico do objeto validado

| Campo | Valor observado |
|---|---|
| Registro de metadados na VM2 | `study_audio_reports.id = 3` |
| Nome original | `laudo_falado_1787002873198.webm` |
| Duração | 17 segundos |
| Tamanho na VM2 | 272.090 bytes |
| Chave de storage | `audio_reports/<StudyInstanceUID>/audio_1787002874497_e82mpl.webm` |
| Bucket MinIO | `vm3-storage` |
| Nome físico na VM3 | `audio_1787002874497_e82mpl.webm` |
| Tamanho informado pelo MinIO | 266 KiB |
| Tipo MIME informado pelo MinIO | `audio/webm` |
| Data do objeto em UTC | 2026-08-17 21:41:14 UTC |

O valor da VM2 equivale a **265,7128 KiB** (`272090 ÷ 1024`). Portanto, o valor de **266 KiB** exibido pelo MinIO representa o arredondamento normal do mesmo objeto; não há divergência de tamanho.

## Fluxo confirmado

```text
Celular autenticado
    │
    ├─ solicita reprodução pela URL do Portal
    ▼
VM1 — rota autenticada /api/media/...
    │  valida sessão e autorização
    ▼
VM3 — MinIO privado / bucket vm3-storage
    │  lê apenas o intervalo solicitado pelo navegador quando aplicável
    ▼
VM1 transmite o áudio ao navegador

VM2 — somente chave, tamanho, duração, estudo e usuário vinculados
```

## Implicações operacionais

O arquivo `.webm` validado consome a capacidade da **VM3** e do RAID1 subjacente. A VM2 permanece leve, pois armazena somente referências e metadados. A VM1 não deve acumular cópias permanentes dos áudios novos, exceto quando houver registros legados identificados com caminho iniciado por `/uploads/audio_reports/`.

O player do Portal foi atualizado para usar a rota autenticada da VM1, suporte a requisições HTTP `Range`, retorno e avanço de 10 segundos, barra de progresso e velocidades de 1x, 1,25x, 1,5x e 2x. A validação no navegador móvel deve ser repetida após a atualização da VM1 para o commit que contém essas mudanças.

## Procedimento de verificação futura

Para cada áudio, a sequência segura de auditoria é:

1. Consultar a tabela `study_audio_reports` na **VM2** e obter `file_key`, `file_size` e duração.
2. Executar `mc stat` na **VM3** sobre `vm3-storage/<file_key>`.
3. Comparar os bytes da VM2 com o tamanho do objeto da VM3, considerando o arredondamento de KiB exibido pelo MinIO.
4. Confirmar que o navegador acessa o arquivo pelo domínio do Portal, nunca pelo IP privado `172.16.3.102`.

Nenhuma credencial, URL pré-assinada ou segredo de MinIO deve ser gravado neste documento.
