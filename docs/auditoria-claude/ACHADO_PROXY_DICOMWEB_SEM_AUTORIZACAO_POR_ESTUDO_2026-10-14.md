# Achado de segurança: proxy `/api/dicomweb` sem autorização por estudo/unidade

Data: 2026-10-14
Branch: `claude/seguranca-proxy-dicomweb-sem-autorizacao-por-estudo`
Base: `origin/main` (commit `182b357`)
Autor: Claude (sandbox, sem acesso a VM1/VM2/VM3)
Destinatário: Alessandro / Manus (para revisão e, se aprovado, implementação)

**Status deste branch: SOMENTE DOCUMENTAÇÃO DO ACHADO E DO PLANO. Nenhum
código foi alterado ainda.** O Alessandro pediu explicitamente para registrar
o achado e o plano de correção antes de qualquer implementação, para revisar
com calma — ele manifestou receio de que a correção mude o funcionamento
atual do visualizador DICOM em produção. Este documento existe para permitir
essa revisão sem pressa, com o código-fonte exato citado, antes de qualquer
`git commit` de correção.

---

## 1. Como este achado foi encontrado

No dia 14/10/2026, a pedido do Alessandro ("vamos fazer uma varredura no
repositório e ver possíveis erros ou incoerências"), foi feita uma auditoria
somente-leitura em 5 subagentes paralelos, cada um cobrindo um setor do
sistema (PACS/DICOM, Laudos/PDF/Masks, Financeiro, Catálogo/SLA/Anamnese,
Unidades/Admin/Storage). O achado de maior gravidade, descrito aqui, veio do
setor PACS/DICOM.

Depois do relatório inicial, o Alessandro pediu esclarecimento adicional
porque o modo promíscuo do Orthanc (sem autenticação própria) é uma decisão
de arquitetura conhecida e intencional, não um erro — então era preciso
separar com precisão o que é esperado (Orthanc sem senha, por VM1 ser a
única porta de entrada) do que é de fato um bug (o proxy Node.js que deveria
compensar essa ausência de autenticação do Orthanc não faz a checagem que
deveria fazer).

## 2. Contexto arquitetural (não é o bug — é o pano de fundo necessário)

`server/orthanc.ts:1-15` documenta explicitamente o desenho:

```
 * Integração com Orthanc em modo promíscuo (sem autenticação).
 * O Orthanc atua como gateway DICOM → DICOMweb:
 *   - Recebe exames de equipamentos externos via DICOM (C-STORE)
 *   - Faz C-FIND/C-GET para PACS remotos via REST API
 *   - Expõe DICOMweb (QIDO-RS, WADO-RS) para o viewer
 *
 * Configuração esperada do Orthanc:
 *   - RemoteAccessAllowed: true
 *   - AuthenticationEnabled: não definido (sem senha)
 *   - UnknownSopClassAccepted: true (modo promíscuo)
 *   - DicomWeb plugin ativo em /dicom-web/
```

E `docs/ARQUITETURA_3_VMS_PACS.md:74` confirma que cada unidade tem o
próprio Orthanc ("Orthancs das Unidades", no plural) — não existe um único
Orthanc compartilhado por todas as unidades. Isso é relevante porque limita
(mas não elimina) o raio de dano do bug abaixo: por padrão, um usuário só
consegue alcançar, através deste proxy, o Orthanc da própria unidade dele —
EXCETO nos dois cenários específicos descritos na seção 4.

O Orthanc em si não checa nada — e está correto que não checque, porque
quem deveria checar é a camada Node.js antes de encaminhar a requisição.
Esse é exatamente o papel que o proxy `/api/dicomweb` deveria cumprir e,
hoje, não cumpre.

## 3. O código do proxy hoje (`server/_core/index.ts:949-965`)

```ts
app.use('/api/dicomweb', requireAuth, async (req, res) => {
  try {
    // F2-1: Resolver Orthanc pela unidade do usuário autenticado
    const dicomUser = (req as any).dicomUser;
    const userUnitId: number | null = dicomUser?.unit_id ?? null;
    const orthancBaseUrl = await getOrthancUrl(userUnitId);

    // Constrói a URL de destino: /api/dicomweb/studies/... → http://172.16.3.241:8042/dicom-web/studies/...
    const targetPath = req.path;
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `${orthancBaseUrl.replace(/\/$/, '')}/dicom-web${targetPath}${queryString}`;
    ...
    const response = await fetch(targetUrl, fetchOptions);
    ...
    // encaminha a resposta do Orthanc, inclusive o corpo (streaming), de volta ao navegador
```

`requireAuth` (`server/_core/index.ts:511-521`) só confirma que existe uma
sessão autenticada válida (`ctx.user`) — não valida unidade, nem estudo, nem
nenhuma permissão específica. É o único portão desta rota.

`getOrthancUrl` (`server/_core/index.ts:903-934`) resolve qual Orthanc
chamar assim:
- Se `unitId` foi passado, busca no banco a unidade com esse id e usa o
  `pacs_ip` dela como host do Orthanc.
- **Se a busca falhar ou `unitId` for nulo, cai num fallback que pega
  "qualquer unidade ativa" no banco (`eq(units.isActive, true)`, sem
  filtrar pela unidade do usuário, `.limit(1)`)** — ou seja, nesse caso a
  escolha do Orthanc não tem relação nenhuma com quem está pedindo.

Nenhum ponto deste handler lê o `studyInstanceUid` da requisição para
confirmar que o estudo pedido realmente pertence à unidade cujo Orthanc
está sendo consultado. Ele simplesmente encaminha qualquer caminho
(`req.path`) para o Orthanc escolhido e devolve a resposta — seja ela
metadado, imagem (frame) ou qualquer outro recurso WADO-RS/QIDO-RS.

## 4. Por que isso é um bug real, com precisão sobre o alcance

**Ponto 1 — a unidade usada para escolher o Orthanc vem do usuário, não do
estudo pedido.** O handler usa `dicomUser.unit_id` (a unidade "de casa" do
usuário, uma coluna legada e singular) para decidir A QUAL Orthanc se
conectar, e depois nunca confere se o `studyInstanceUid` da URL realmente
pertence a essa unidade. Rotas irmãs, que servem exatamente o mesmo tipo de
dado (imagem/metadado DICOM), fazem essa checagem corretamente:

| Rota | Linha | Checagem usada |
|---|---|---|
| `GET /api/dicom-cache-status/:studyUid` | `server/_core/index.ts:643-648` | `assertDicomFileAccess` |
| `GET /api/dicom-files/:studyUid/:filename` | `server/_core/index.ts:666-672` | `assertCachedDicomFileAccess` |
| `GET /api/dicom-files/:studyUid` (lista) | `server/_core/index.ts:685-691` | `assertDicomFileAccess` |
| `GET /api/dicom-stream/...` | `server/_core/index.ts:~1038-1056` | `assertDicomFileAccess` |
| `GET /api/dicom-export/...` | `server/_core/index.ts:~1260-1268` | `assertDicomFileAccess` |
| `POST /api/dicom-viewer-launch` (pacs.ts, `startViewer`) | `server/routers/pacs.ts:391` | checagem anti-IDOR explícita no cache-hit |
| **`ALL /api/dicomweb/*`** | **`server/_core/index.ts:950`** | **nenhuma** |

**Ponto 2 — mesmo corrigindo o ponto 1, há uma segunda inconsistência já
presente hoje:** `server/routers/pacs.ts:565-567` (dentro de `startViewer`,
depois de já ter validado a unidade pedida via `assertUnitPermission`)
monta a URL do visualizador assim:

```ts
const viewerUrl = orthancInternalUrl
  ? ...
  : `/api/dicomweb?studyUid=${encodeURIComponent(input.studyInstanceUid)}&unitId=${targetUnitIdForViewer}`;
```

Ou seja: o backend JÁ calculou e JÁ validou qual é a unidade correta
(`targetUnitIdForViewer`) e já colocou essa informação na URL. Mas o
handler do proxy (`server/_core/index.ts:953`) nunca lê
`req.query.unitId` — ele ignora esse parâmetro completamente e usa só
`dicomUser.unit_id`. Isso afeta dois perfis de usuário:

- **admin_master**, que pode legitimamente abrir estudos de qualquer
  unidade — mas o proxy sempre tenta rotear pela unidade "de casa" dele
  (que pode nem existir, já que admin_master não depende de `unit_id`).
- **Usuário com permissão em mais de uma unidade**, abrindo um estudo de
  uma unidade que não é a "principal" dele — o proxy roteia para o Orthanc
  errado.

Nesses dois casos, hoje a funcionalidade já está incorreta na prática (o
viewer abre e não encontra o estudo, ou — dependendo de como os `pacs_ip`
estão cadastrados — conecta num Orthanc que não tem relação com a
autorização que foi de fato concedida).

**Ponto 3 — o fallback "qualquer unidade ativa" descrito na seção 3** é
alcançado sempre que a unidade do usuário (ou a unidade pedida, depois da
correção do ponto 2) não tiver `pacs_ip` cadastrado. Nesse caso, o Orthanc
escolhido não tem nenhuma relação com o usuário — é a primeira unidade
ativa que o `SELECT` sem filtro encontrar.

**O que isto NÃO é, para não superdimensionar:** não é "qualquer usuário
autenticado consegue, de forma geral e deliberada, escolher ver dado de
qualquer unidade do sistema" — porque cada unidade tem seu próprio Orthanc,
e o roteamento de hoje (mesmo errado) ainda amarra a maioria dos usuários
(de unidade única) ao próprio Orthanc deles. O problema real e comprovável
é mais preciso: **o proxy nunca confirma que o estudo pedido pertence à
unidade cujo Orthanc ele está consultando, e ignora a unidade que o resto
do sistema já validou corretamente** — o que expõe os casos descritos nos
pontos 1 (alguém trocando o UID na URL manualmente, dentro do próprio
Orthanc da unidade dele — ainda assim um bypass de autorização por estudo
dentro da unidade), 2 (admin_master/multiunidade mal roteados) e 3
(fallback sem relação com o usuário).

## 5. Plano de correção (ainda NÃO implementado — para revisão)

### 5.1 Ideia central

Reaproveitar a função que já existe e já está em produção, usada pelas 6
rotas irmãs listadas na tabela acima: `assertDicomFileAccess(user,
studyInstanceUid, permission)`, definida em `server/authorization.ts:76-116`.

Ela resolve a unidade DONA do estudo a partir do banco (`studies_cache`,
com fallback para `study_metadata`) — não a partir de nenhuma coluna do
usuário — e confirma que o usuário logado tem a permissão pedida
(`view_studies`) nessa unidade, via `canAccessUnit` (que já trata
corretamente admin_master, permissões granulares por unidade, e o
fallback legado). Se a unidade do estudo não for encontrada, ou se o
usuário não tiver permissão, ela lança `TRPCError({ code: "FORBIDDEN" })`.
Se tudo estiver certo, devolve o `unitId` correto.

### 5.2 Mudança proposta em `server/_core/index.ts`, dentro do handler de
`/api/dicomweb` (linha 950)

1. **Extrair o `studyInstanceUid` da requisição**, cobrindo os dois
   formatos que acontecem hoje:
   - Da URL de caminho, quando presente: `/studies/<uid>/...` (ex.:
     `/studies/1.2.840.../metadata`, `/studies/1.2.840.../series/...`).
     Usar uma regra simples: pegar o primeiro segmento de path depois de
     `/studies/`.
   - Da query string, quando a requisição é a URL-raiz que o
     `pacs.ts:567` monta (`?studyUid=...&unitId=...`), via
     `req.query.studyUid`.
2. **Validar o formato do UID** com `isValidStudyInstanceUid`
   (`server/routerUtils.ts:11`), a mesma função já usada nas 6 rotas
   irmãs — evita processar lixo/injeção antes mesmo de bater no banco.
3. **Chamar `assertDicomFileAccess(dicomUser, studyUid, 'view_studies')`**.
   Se lançar, responder `403` imediatamente (mesmo padrão de tratamento
   de erro já usado nas rotas irmãs: `try { await assertDicomFileAccess(...)
   } catch { return res.status(403)... }`), sem encaminhar nada ao Orthanc.
4. **Usar o `unitId` DEVOLVIDO por `assertDicomFileAccess`** (não
   `dicomUser.unit_id`) na chamada a `getOrthancUrl(unitId)` — isso resolve
   ao mesmo tempo o ponto 1 (checagem por estudo) e o ponto 2 (roteamento
   correto para admin_master/multiunidade), porque a unidade agora vem do
   próprio estudo, não de uma coluna do usuário.
5. **Se nenhum `studyInstanceUid` puder ser identificado** na requisição
   (nem no path, nem na query) — hoje não há nenhum uso legítimo conhecido
   desse formato — responder `403` em vez de cair no fallback de "qualquer
   unidade ativa" (elimina o ponto 3 por completo: sem UID, sem acesso).

### 5.3 Por que isto não deve mudar o comportamento de quem já usa
corretamente

- A única chamada conhecida no código atual (`pacs.ts:567`) já manda o
  `studyUid` na query string — não é preciso mudar nada no frontend nem na
  construção dessa URL.
- Para um usuário de unidade única abrindo um estudo da própria unidade
  (o caso comum hoje), `assertDicomFileAccess` devolve a mesma unidade que
  `dicomUser.unit_id` já devolvia — o Orthanc escolhido é o mesmo de hoje,
  o comportamento observável não muda.
- Os dois casos que DEIXAM de funcionar como hoje são exatamente os dois
  que hoje já não funcionam corretamente (admin_master/multiunidade mal
  roteado) ou que não deveriam funcionar (UID de outra unidade) — ou seja,
  não há regressão de um caso que funcionava, só a correção de dois casos
  que já estavam quebrados/abertos.

### 5.4 Risco residual e pontos a confirmar com a Manus antes do deploy

- Confirmar nos logs reais da VM1 se existe, na prática, algum outro
  formato de requisição a `/api/dicomweb` além de `/studies/<uid>/...` e
  da chamada-raiz com `?studyUid=` — por exemplo, se o viewer externo que
  abre essa URL (`window.open(viewerUrl)`, em
  `client/src/pages/ViewerPage.tsx`) faz alguma chamada QIDO-RS de busca
  (`/studies?PatientID=...`, sem UID no path) que ainda não foi mapeada
  aqui. Se existir, essa correção bloquearia esse formato — precisa ser
  tratado à parte (ex.: decidir se essa busca deveria existir, e se sim,
  restringi-la à unidade do usuário em vez de simplesmente negar).
- Validar manualmente em homologação, antes do merge em `main`: abrir um
  estudo de uma unidade comum (deve continuar funcionando exatamente como
  hoje) e, se possível, testar com uma conta admin_master abrindo um
  estudo de uma unidade que não é a "de casa" dela (deve passar a
  funcionar corretamente, o que hoje não acontece).

### 5.5 Teste de regressão planejado

Seguir o padrão já existente em `server/dicom-study-uid-security.test.ts`
(que testa `isValidStudyInstanceUid` e confirma, por leitura de código-fonte,
quantas rotas a usam). Adicionar:
- Um teste de autorização real (não só leitura de texto) para o handler do
  `/api/dicomweb`, mockando `assertDicomFileAccess` para simular (a) estudo
  da própria unidade → prossegue e chama `getOrthancUrl` com o unitId certo;
  (b) estudo de outra unidade → responde 403, nunca chama `fetch` para o
  Orthanc; (c) usuário admin_master pedindo estudo de unidade que não é a
  dele → prossegue com o unitId do estudo, não o do usuário.
- Prova de regressão real: reverter a correção via `git stash`, confirmar
  que o teste novo falha, restaurar, confirmar que volta a passar — mesmo
  processo usado em todas as correções anteriores deste projeto.

## 6. Escopo explicitamente fora deste branch

- Nenhuma mudança de schema, migration, ou dado em produção.
- Nenhuma mudança no frontend — a URL que `pacs.ts` já monta continua
  igual.
- Não cobre aqui os achados 3 (exclusão de unidade sem guarda — correção já
  pronta e testada na branch `claude/bloqueia-exclusao-unidade-orfa`,
  commit `54b5b0d`, ainda não mesclada), nem o achado de corrupção cruzada
  em `studies_cache` por UID global sem `unit_id` — cada um deve virar seu
  próprio branch dedicado, para não misturar revisões de naturezas
  diferentes num só diff.

## 7. Próximo passo

Aguardando aprovação do Alessandro para implementar exatamente o plano da
seção 5 neste mesmo branch, com os testes da seção 5.5, e rodar a
validação completa (`pnpm check`, suíte de testes, `pnpm build`) antes de
qualquer push.
