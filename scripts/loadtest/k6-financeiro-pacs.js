/**
 * Teste de carga — PACS Portal / LAUDS
 *
 * IMPORTANTE: este script foi escrito no sandbox do Claude, que não tem
 * MySQL real, PACS real nem acesso às VMs — por isso NUNCA foi executado.
 * Foi construído lendo o código real (server/_core/index.ts,
 * server/routers.ts, server/auth.service.ts, server/routers/pacs.ts,
 * server/routers/reports.ts), não inventado. Quem roda primeiro, e valida
 * se bate com o comportamento real do servidor, é o Manus — contra
 * VM1/VM2/VM3, nunca contra produção com usuários reais.
 *
 * O QUE ESTE SCRIPT COBRE (3 níveis de peso, propositalmente diferentes):
 *   1. auth.me       — leve: só sessão + 1 leitura de usuário.
 *   2. financeSimple.listMyResponsibles — médio: agregação real no MySQL.
 *   3. pacs.query     — pesado: chama o PACS de verdade via processo
 *      externo (execFileAsync em server/routers/pacs.ts) — é o candidato
 *      mais provável a ser o gargalo real do sistema, então merece ser o
 *      foco principal da leitura dos resultados.
 *
 * RESTRIÇÃO CRÍTICA — RATE LIMITER DE LOGIN (server/_core/index.ts):
 *   /api/trpc/auth.login tem rate limit de 10 tentativas / 15 min por IP,
 *   com skipSuccessfulRequests: true (login que dá certo não conta contra
 *   o limite). Por isso este script loga UMA VEZ por VU, no início da
 *   execução (não a cada iteração), e reaproveita o cookie de sessão
 *   depois disso. Não altere esse padrão sem entender essa trava, ou o
 *   próprio teste de carga vai se autobloquear.
 *
 * COMO RODAR (na VM, com k6 instalado — https://k6.io/docs/get-started/installation/):
 *
 *   k6 run \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e LOGIN=usuario_de_teste \
 *     -e PASSWORD=senha_de_teste \
 *     -e VUS=20 \
 *     -e DURATION=2m \
 *     scripts/loadtest/k6-financeiro-pacs.js
 *
 * Use uma conta de teste dedicada, nunca uma conta clínica real — o
 * script faz login de verdade e gera linhas reais de audit_log (ação
 * LOGIN) a cada VU.
 *
 * PARÂMETROS OPCIONAIS:
 *   STUDY_UID    — se definido, adiciona um 4º cenário chamando
 *                  reports.getByStudyUid com esse UID (query real de
 *                  laudo). Sem isso, o cenário é pulado — não inventamos
 *                  um UID falso, porque reports.getByStudyUid faz parte
 *                  do caminho de acesso a dado clínico e um UID
 *                  inexistente só mediria o caminho de "não encontrado",
 *                  não o caminho real.
 *   PACS_MODALITY — modalidade usada na busca do cenário 3 (padrão: "CT").
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOGIN = __ENV.LOGIN;
const PASSWORD = __ENV.PASSWORD;
const STUDY_UID = __ENV.STUDY_UID || '';
const PACS_MODALITY = __ENV.PACS_MODALITY || 'CT';

if (!LOGIN || !PASSWORD) {
  fail('Defina LOGIN e PASSWORD (conta de teste dedicada) via -e LOGIN=... -e PASSWORD=...');
}

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    // Ajuste estes limiares depois da primeira rodada exploratória —
    // valores iniciais conservadores, não são SLA formal do produto.
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:auth_me}': ['p(95)<500'],
    'http_req_duration{endpoint:finance_summary}': ['p(95)<1500'],
    'http_req_duration{endpoint:pacs_query}': ['p(95)<4000'],
  },
};

// Estado por VU (k6 isola variáveis de módulo por VU — não é global entre VUs).
let sessionCookie = null;

function trpcMutation(procedure, input, tag) {
  const res = http.post(
    `${BASE_URL}/api/trpc/${procedure}`,
    JSON.stringify({ json: input }),
    {
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie || '' },
      tags: { endpoint: tag },
    }
  );
  return res;
}

function trpcQuery(procedure, input, tag) {
  const qs = encodeURIComponent(JSON.stringify({ json: input ?? {} }));
  const res = http.get(`${BASE_URL}/api/trpc/${procedure}?input=${qs}`, {
    headers: { Cookie: sessionCookie || '' },
    tags: { endpoint: tag },
  });
  return res;
}

function login() {
  const res = trpcMutation('auth.login', { login: LOGIN, password: PASSWORD }, 'auth_login');
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: sem erro tRPC': (r) => {
      try {
        return !JSON.parse(r.body)?.error;
      } catch {
        return false;
      }
    },
  });
  if (!ok) {
    fail(`Login falhou (VU ${__VU}). Verifique LOGIN/PASSWORD e se o rate limiter de auth.login não está ativo por tentativas anteriores. Corpo: ${res.body}`);
  }
  const setCookie = res.headers['Set-Cookie'];
  if (!setCookie) {
    fail('Login retornou 200 mas sem Set-Cookie — verifique se COOKIE_NAME (shared/const.ts) ainda é "app_session_id".');
  }
  // Extrai só "nome=valor" do primeiro cookie do Set-Cookie (ignora Path/HttpOnly/etc.)
  sessionCookie = setCookie.split(';')[0];
}

export default function () {
  if (!sessionCookie) {
    login();
    sleep(0.3);
  }

  // 1) leve — sessão
  const meRes = trpcQuery('auth.me', undefined, 'auth_me');
  check(meRes, { 'auth.me: status 200': (r) => r.status === 200 });
  sleep(0.5);

  // 2) médio — agregação financeira real (ajuste o procedure se o papel
  // da conta de teste não for responsavel_financeiro; para admin_master,
  // troque por financeSimple.responsibleSummary, por exemplo).
  const financeRes = trpcQuery('financeSimple.listMyResponsibles', undefined, 'finance_summary');
  check(financeRes, { 'finance: status 200': (r) => r.status === 200 });
  sleep(0.5);

  // 3) pesado — consulta real ao PACS (é uma mutation no código atual,
  // não query, apesar do nome "query" — ver server/routers/pacs.ts).
  const pacsRes = trpcMutation('pacs.query', { modality: PACS_MODALITY }, 'pacs_query');
  check(pacsRes, { 'pacs.query: status 200': (r) => r.status === 200 });
  sleep(1);

  // 4) opcional — laudo real, só roda se STUDY_UID foi passado
  if (STUDY_UID) {
    const reportRes = trpcQuery(
      'reports.getByStudyUid',
      { studyInstanceUid: STUDY_UID, documentKey: 'primary' },
      'reports_get'
    );
    check(reportRes, { 'reports.getByStudyUid: status 200': (r) => r.status === 200 });
    sleep(0.5);
  }
}
