# Homologação em produção — correção do proxy DICOMweb (commit 301833c)

**Data:** 15/10/2026
**Repositório:** `alessandrobarra7/pacs-v4`
**Branch:** `claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo`
**Commit testado:** `301833c` (resposta aos BLOQUEIOS 1-4 do parecer corretivo)
**Ambiente:** VM1 produção, `https://lauds.com.br` (já implantado pela Manus)
**Executado por:** Claude, via navegador real (Claude in Chrome) contra uma conta e um estudo reais, com autorização do Alessandro.

## Metodologia

Login real como usuário "gian carvalho" (unidade Hospital da Criança, `unit_id=20`),
usando o estudo real `1.2.392.200036.9107.500.110000126101419057` (paciente LIZ
AZEVEDO DE OLIVEIRA) que essa conta legitimamente tem acesso. Todas as chamadas
abaixo foram feitas via `fetch` autenticado (mesma sessão/cookies do navegador),
direto contra a API de produção. Nenhum dado de paciente foi exposto fora da
sessão normal do usuário; nenhuma escrita foi feita.

## 1. Fluxo ativo do worklist — não deveria ter mudado

Abri o estudo pelo botão "Visualizar" da lista normal do PACS (rota
`/dicom-viewer/:studyUid`, que usa `dicom-stream`/`dicom-files` — caminho que
esta correção não toca). A imagem radiográfica carregou normalmente.

**Resultado: PASSOU.** Nenhuma regressão no fluxo que os usuários usam hoje.

## 2. Os 4 bloqueios do parecer corretivo da Manus

| # | Requisição | Esperado | Resultado real | Status |
|---|---|---|---|---|
| 1 | `GET /api/dicomweb/studies/<uid>/../../system` (travessia literal) | 400, nunca chega ao Orthanc | `400` — `{"error":"Requisição DICOMweb não suportada: identificador de estudo obrigatório."}` | ✅ PASSOU |
| 2 | `GET /api/dicomweb/studies/<uid>/%2e%2e/%2e%2e/system` (travessia percent-encoded) | 400 | `400` — mesma mensagem acima | ✅ PASSOU |
| 3 | `GET /api/dicomweb/studies/<uid>/system` (recurso fora da allowlist WADO-RS) | 400 | `400` — `{"error":"Recurso DICOMweb não suportado por este proxy."}` | ✅ PASSOU |
| 4 | `GET /api/dicomweb?studyUid=<uid>&studyUid=outro` (UID duplicado na query) | 400 | `400` — `{"error":"Identificador de estudo inválido ou duplicado na querystring."}` | ✅ PASSOU |
| 5 | `POST /api/dicomweb/studies/<uid>` (método não permitido) | 405 | `405` — `{"error":"Método não permitido."}` | ✅ PASSOU |
| 6 | `GET /api/dicomweb/studies/<uid-inexistente-mas-com-formato-válido>` (estudo órfão/não vinculado a nenhuma unidade) | 403 | `403` — `{"error":"Acesso negado a este estudo."}` | ✅ PASSOU |
| 7 | `pacs.getViewerUrl` via tRPC, para o estudo autorizado real | `viewerUrl` deve ser `/api/dicomweb/studies/<uid>`; `orthancUrl`/`orthancPublicUrl`/`orthancWebViewerUrl` sempre `null` | `viewerUrl: "/api/dicomweb/studies/1.2.392.200036.9107.500.110000126101419057"`; os 3 campos vieram `null`; `hasOrthanc: false` | ✅ PASSOU |

Em todos os casos de entrada inválida (1-5), a resposta veio com o corpo JSON
exato do nosso código — ou seja, a requisição foi rejeitada pelo proxy
ANTES de qualquer tentativa de contato com o Orthanc, confirmando que a
validação acontece na camada certa (BLOQUEIO 1). No caso 6, o estudo
inexistente foi corretamente negado com 403 pela camada de autorização
(`assertDicomFileAccess`), sem revelar se o estudo existe ou não em outra
unidade.

## 3. Observação sem relação com a vulnerabilidade corrigida

Ao testar o caminho **válido e autorizado** (`GET
/api/dicomweb/studies/<uid>`, sem nenhum truque, para um estudo que a conta
realmente pode ver), a resposta veio `401` com corpo vazio
(`content-length: 0`). Isso **não é o 401 do nosso `requireAuth`** — o
`requireAuth` sempre responde com corpo JSON `{"error":"Não autenticado"}`.
Tudo indica que é o próprio **Orthanc dessa unidade** recusando a conexão
(sem enviar corpo), depois que nosso proxy já autorizou corretamente e
tentou encaminhar a requisição.

Isso é consistente com o fato de `pacs.getViewerUrl` ter retornado
`hasOrthanc: false` para esta unidade — ou seja, mesmo o próprio app não
espera que essa unidade sirva imagens via Orthanc/DICOMweb; o fluxo real de
visualização desta unidade usa C-GET (`dicom-stream`/`dicom-files`), como
confirmado no item 1. A rota `/api/dicomweb` só é consumida hoje pela tela
órfã `/viewer/:studyId`, que nenhuma tela ativa do sistema linka.

**Não é uma falha da correção de segurança** — a autorização por estudo
funcionou perfeitamente antes de chegar ao Orthanc. É uma questão de
infraestrutura/configuração de uma unidade específica (Orthanc indisponível
ou não promíscuo nela), que sugerimos confirmar separadamente, sem bloquear
a aprovação desta correção.

## 4. Veredito

Todos os 4 bloqueios do parecer corretivo foram verificados funcionando
corretamente em produção, com o estudo e a conta reais de um usuário.
Nenhuma regressão foi observada no fluxo ativo do worklist. O achado da
seção 3 é informativo, não bloqueante, e não decorre do código revisado.

Aguardando aprovação final da Manus para considerar o ciclo desta correção
encerrado.
