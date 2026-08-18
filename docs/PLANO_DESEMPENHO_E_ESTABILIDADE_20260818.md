# Plano de Desempenho e Estabilidade — Portal PACS

**Data:** 18/08/2026  
**Escopo:** reduzir risco de lentidão e travamento em produção sem alterar permissões clínicas, dados de pacientes ou topologia das VMs.  
**Status:** primeira rodada de otimizações seguras concluída e validada no sandbox; coleta de métricas reais da VM1 pendente antes de novos ajustes.

## 1. Princípio de operação

O Portal está em produção. Portanto, a ordem obrigatória de trabalho é: identificar caminho crítico, corrigir apenas o gargalo comprovado no sandbox, executar regressão, compilar, coletar linha de base na VM1 e somente então atualizar o processo PM2. Não se muda PM2 para cluster, limites do C-GET, regras de firewall, banco de dados ou RAID com base apenas em suposição.

## 2. Otimizações concluídas nesta rodada

| Rota ou componente | Problema anterior | Alteração aplicada | Benefício esperado |
|---|---|---|---|
| `/api/dicomweb/*` | O proxy recebia toda a resposta do Orthanc por `arrayBuffer()` antes de responder ao navegador. Estudos WADO-RS grandes podiam ocupar memória proporcional ao tamanho da resposta. | A resposta passou a ser encaminhada por fluxo (`Readable.fromWeb(...).pipe(res)`), preservando cabeçalhos necessários de conteúdo, faixa, cache e integridade. | Reduz pressão de memória do Node e permite que imagens/séries cheguem ao cliente à medida que são recebidas. |
| `/api/dicom-cache-info` | Leitura de diretórios e `stat` usavam chamadas síncronas no processo Node. | Listagem e estatísticas passaram a usar `fs/promises`. | Evita bloquear o *event loop* enquanto a tela administrativa consulta um cache grande. |
| `/api/dicom-cache-clear` | A limpeza manual do cache executava `readdirSync`, `statSync` e `rmSync`. | A mesma rotina agora usa operações assíncronas e mantém exclusividade para `admin_master`. | A limpeza manual continua com o mesmo efeito funcional, sem congelar as demais requisições no processo. |

As alterações preservam a autenticação existente, o isolamento por unidade e o comportamento clínico do visualizador. Nenhum dado DICOM foi alterado e não houve mudança de schema ou migration.

## 3. Validações realizadas no sandbox

| Verificação | Resultado |
|---|---|
| Teste específico de otimização DICOM | 4 testes aprovados, cobrindo leitura parcial de cabeçalho, cache de autorização, streaming DICOMweb e ausência de I/O síncrono nas rotas administrativas de cache. |
| Suíte completa | 35 arquivos Vitest aprovados; 239 testes aprovados e 1 integração MinIO ignorada. |
| TypeScript | `pnpm check` concluído sem erros. |
| Build de produção | Concluído com `NODE_OPTIONS=--max-old-space-size=1024`; `dist/index.js` gerado. |

O build mantém o aviso já conhecido de *chunk* grande do frontend do visualizador. Esse aviso é uma oportunidade futura de carregamento sob demanda, mas não impede a compilação nem está no caminho de streaming do backend corrigido nesta rodada.

## 4. Métricas a coletar antes do próximo lote

As próximas decisões devem ser orientadas pela linha de base da VM1. Devem ser coletados CPU, memória, reinícios, conexões, latência e erros das rotas críticas, sem imprimir identificadores clínicos, URLs completas de estudos ou conteúdo de laudos.

| Área | Métrica necessária | Decisão que a métrica suporta |
|---|---|---|
| Processo Node/PM2 | RSS, CPU, reinícios e tempo ativo | Verificar se há pressão de memória ou instabilidade real antes de avaliar cluster. |
| Nginx/Portal | Códigos HTTP, latência e volume por grupo de rota | Identificar se DICOMweb, mídia, exportação ou trabalho administrativo domina o tempo de resposta. |
| C-GET/DICOM | Duração, número de arquivos e concorrência observada | Definir limites de concorrência e timeout com dados reais. |
| MySQL | Consultas lentas e duração de apuração financeira | Priorizar a redução de N+1 em `calculateCompetence` sem alterar valores. |
| Disco da VM1 | Espaço e I/O em `/tmp/dicom-cache` | Validar se o cache local é causa de lentidão ou risco de esgotamento de espaço. |

## 5. Diagnóstico somente-leitura na VM1

Executar **somente na VM1**. O comando não altera serviço, PM2, banco, firewall ou arquivos clínicos. Ele imprime somente métricas agregadas e agrupamentos de rota, removendo parâmetros de estudo das linhas de acesso quando o log Nginx estiver disponível.

```bash
sudo bash <<'PERF_BASELINE_VM1'
set -uo pipefail
APP='/var/www/pacs-portal'

echo '=== IDENTIDADE E PROCESSO ==='
hostname
date -Is
cd "$APP" && git log -1 --oneline
pm2 status pacs-portal || true
pm2 show pacs-portal 2>/dev/null | grep -E 'status|restarts|uptime|cpu|memory|script path|exec mode' || true

echo
echo '=== CPU, MEMÓRIA E DISCO ==='
uptime
free -h
ps -C node -o pid,%cpu,%mem,rss,etime,args --sort=-rss || true
df -hT / /tmp 2>/dev/null || true
du -sh /tmp/dicom-cache 2>/dev/null || true

echo
echo '=== REDE E CONEXÕES ==='
ss -s
ss -tn state established '( sport = :3000 or sport = :443 )' | tail -n +2 | wc -l | xargs printf 'conexoes_estabelecidas_portal=%s\n'

echo
echo '=== ERROS AGREGADOS DO PORTAL (ÚLTIMAS 24H) ==='
pm2 logs pacs-portal --err --lines 400 --nostream 2>/dev/null \
  | grep -Eo 'DICOMweb Proxy Error|Falha no streaming|timeout|ENOMEM|JavaScript heap out of memory|ECONNRESET|ECONNREFUSED' \
  | sort | uniq -c || true

echo
echo '=== NGINX: ROTAS AGREGADAS (SE DISPONÍVEL) ==='
if [ -r /var/log/nginx/access.log ]; then
  tail -n 3000 /var/log/nginx/access.log \
    | awk '{print $7}' \
    | sed -E \
        -e 's#^/api/dicomweb/.*#/api/dicomweb/*#' \
        -e 's#^/api/dicom-files/.*#/api/dicom-files/*#' \
        -e 's#^/api/media/.*#/api/media/*#' \
        -e 's#^/api/dicom-export[^ ]*#/api/dicom-export/*#' \
    | sort | uniq -c | sort -nr | head -20
else
  echo 'access_log_nginx_indisponivel'
fi
PERF_BASELINE_VM1
```

## 6. Próximas otimizações, condicionadas à medição

1. **`calculateCompetence`:** a função executa consultas de responsável e preços para cada laudo do período. A melhoria deve preservar modalidade, vigência e preços aplicados; por isso será feita somente após teste financeiro com casos de mudança de preço no mesmo mês.
2. **C-GET:** definir concorrência máxima e limites de arquivo/tempo depois de observar duração e uso de RAM em exames grandes. O limite não deve ser reduzido arbitrariamente, pois pode aumentar o tempo de abertura para médicos.
3. **PM2 cluster:** decidir somente se CPU, latência e reinícios comprovarem que uma instância é gargalo. Antes disso, cluster pode complicar cache em memória e diagnósticos sem benefício mensurável.
4. **Frontend do visualizador:** o *bundle* principal ultrapassa 5 MiB. Carregamento dinâmico do Cornerstone é uma otimização futura, mas exige regressão visual e DICOM extensa; não faz parte desta rodada de backend.

## 7. Atualização controlada da VM1

Depois de receber e revisar a linha de base, a atualização deverá seguir o procedimento já versionado para a VM1: sincronizar o commit, instalar dependências travadas, compilar com limite de memória, verificar `dist/public/index.html` e `dist/index.js`, e somente então reiniciar o PM2. Após o reinício, repetir a coleta de métricas e testar um estudo representativo.

> Não publicar esta alteração na VM1 antes de coletar a linha de base e decidir, com as métricas, se há outro gargalo de produção que precise ser tratado no mesmo lote.
