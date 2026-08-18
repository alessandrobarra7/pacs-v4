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
    | sed -E 's/\?.*$//' \
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

> A remoção da *query string* é obrigatória antes da agregação. Ela evita que parâmetros de tRPC, como identificadores técnicos de estudo, sejam impressos no diagnóstico operacional.

## 6. Próximas otimizações, condicionadas à medição

1. **`calculateCompetence`:** a função executa consultas de responsável e preços para cada laudo do período. A melhoria deve preservar modalidade, vigência e preços aplicados; por isso será feita somente após teste financeiro com casos de mudança de preço no mesmo mês.
2. **C-GET:** definir concorrência máxima e limites de arquivo/tempo depois de observar duração e uso de RAM em exames grandes. O limite não deve ser reduzido arbitrariamente, pois pode aumentar o tempo de abertura para médicos.
3. **PM2 cluster:** decidir somente se CPU, latência e reinícios comprovarem que uma instância é gargalo. Antes disso, cluster pode complicar cache em memória e diagnósticos sem benefício mensurável.
4. **Frontend do visualizador:** o *bundle* principal ultrapassa 5 MiB. Carregamento dinâmico do Cornerstone é uma otimização futura, mas exige regressão visual e DICOM extensa; não faz parte desta rodada de backend.

## 7. Atualização controlada da VM1

Depois de receber e revisar a linha de base, a atualização deverá seguir o procedimento já versionado para a VM1: sincronizar o commit, instalar dependências travadas, compilar com limite de memória, verificar `dist/public/index.html` e `dist/index.js`, e somente então reiniciar o PM2. Após o reinício, repetir a coleta de métricas e testar um estudo representativo.

> Não publicar esta alteração na VM1 antes de coletar a linha de base e decidir, com as métricas, se há outro gargalo de produção que precise ser tratado no mesmo lote.

## 8. Linha de base coletada na VM1

**Coleta:** 18/08/2026 às 13:50 UTC.
**Commit em execução na VM1:** `820f23d`.
**Conclusão:** a VM1 não apresenta pressão atual de CPU, memória, swap, disco ou conexões. Ela está saudável para receber as otimizações já validadas, mas ainda executa uma versão anterior ao commit de desempenho.

| Indicador | Resultado observado | Interpretação |
|---|---:|---|
| PM2 | `online`, modo `fork`, uptime de 3 h, 21 reinícios históricos, 0 reinício instável | Não há evidência de ciclo de falha atual. Os reinícios devem continuar sendo acompanhados após cada deploy. |
| Processo Portal | 243,3 MiB de memória, 0% CPU no instante da coleta | Consumo normal para a capacidade de 14 GiB da VM; não justifica cluster neste momento. |
| Carga do sistema | 0,07 / 0,02 / 0,00 | Sem saturação de CPU. |
| Memória e swap | 13 GiB disponíveis; swap em 0 B | Sem pressão de memória. O streaming DICOMweb é preventivo contra picos de estudos grandes. |
| Disco raiz | 80 GiB livres (15% usado) | Sem risco imediato de esgotamento. |
| Cache DICOM local | 133 MiB em `/tmp/dicom-cache` | Baixo para a capacidade atual; manter acompanhamento após exames grandes. |
| Conexões | 13 TCP estabelecidas no host; 0 conexões observadas nas portas 3000/443 no instante | Não há pico de tráfego no momento da coleta. |
| Erros agregados PM2 | Nenhuma ocorrência de timeout, `ENOMEM`, heap esgotado, reset ou recusa nos últimos 400 registros verificados | Não há indício de travamento atual por memória ou rede. |

### 8.1 Perfil de rotas

No recorte de 3.000 acessos Nginx, a rota de maior atividade clínica foi `/api/dicom-files/*`, com 330 ocorrências. Ela é usada na entrega de fatias do estudo que já está em cache local. As rotas de status de laudo e de cache também tiveram atividade repetida, coerente com a listagem e o visualizador.

O registro bruto inicial continha parâmetros de tRPC com identificadores técnicos de estudo. A coleta versionada foi corrigida para remover a *query string* antes da agregação; em coletas futuras, tais identificadores não serão exibidos no diagnóstico.

Foram observadas 10 solicitações para caminho de WordPress (`/wp-admin/install.php`). Elas são varreduras automatizadas comuns na internet e não representam funcionalidade do Portal; não são gargalo de desempenho. Podem ser tratadas futuramente por regra Nginx de retorno rápido ou limitação, sem prioridade sobre as rotas clínicas.

### 8.2 Decisão após a linha de base

1. **Atualizar a VM1 para o commit de desempenho** é apropriado: as mudanças são isoladas em streaming DICOMweb e I/O assíncrono administrativo, com regressão completa aprovada.
2. **Não alterar PM2 para cluster** nesta rodada: não há saturação de CPU ou memória que justifique a complexidade adicional e o cache de autorização atual é local ao processo.
3. **Não alterar limites do C-GET** nesta rodada: a linha de base não contém duração de exames grandes nem pico de uso; limites arbitrários podem piorar a experiência de abertura.
4. **Investigar `calculateCompetence` separadamente** com casos financeiros controlados, pois qualquer otimização deve preservar preço, modalidade, vigência e consolidação.

## 9. Atualização recomendada da VM1

Após revisar este registro, aplicar somente o commit de desempenho com o procedimento abaixo. O build usa limite de 1024 MiB, validado no sandbox, para reduzir risco de pressão de memória durante a compilação.

```bash
sudo bash <<'UPDATE_VM1_PERFORMANCE'
set -euo pipefail
cd /var/www/pacs-portal
git fetch origin main
git merge --ff-only origin/main
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=1024 pnpm build
test -s dist/public/index.html
test -s dist/index.js
pm2 restart pacs-portal --update-env
pm2 save
git log -1 --oneline
pm2 status pacs-portal
UPDATE_VM1_PERFORMANCE
```

Imediatamente após a atualização, repetir a coleta de linha de base e testar uma abertura de estudo com número representativo de imagens. Caso surja erro de streaming ou falha de visualização, interromper o teste e preservar os logs antes de qualquer nova alteração.

## 10. Validação pós-deploy em produção

**Commit validado na VM1:** `4789ffa`.  
**Estado do processo:** PM2 online, HTTP local 200, sem erro de streaming, memória ou conexão nos registros verificados após a atualização.

Foi executado um teste controlado de abertura de um estudo representativo no visualizador do navegador e no RadiAnt já instalado no Windows. Ambos os visualizadores carregaram as imagens corretamente. O monitor técnico não registrou falha de streaming, timeout, memória insuficiente ou reinicialização do processo.

A ausência de mensagens do proxy DICOMweb neste teste é esperada: o visualizador web usou a rota de fatias/cache (`/api/dicom-files/*`), e o RadiAnt usou a exportação temporária autorizada do Assistente local. Portanto, a melhoria de streaming DICOMweb foi implantada e está protegida por teste automatizado, mas a rota específica deve ser medida quando algum cliente efetivamente consumir WADO-RS pelo proxy.

Não foram registrados nomes de pacientes, laudos, identificadores de estudo ou imagens nesta documentação de validação.

## 11. Otimização de apuração financeira no sandbox

A função `calculateCompetence` buscava, para cada laudo do período, o responsável ativo da unidade, o preço do sistema e o preço do médico. Essa repetição transforma uma competência com muitos laudos em dezenas ou centenas de consultas adicionais, mesmo quando as regras de vigência são as mesmas.

A nova implementação carrega antecipadamente as regras de responsável, preço do sistema e preço padrão do médico que podem vigorar no período. Para cada laudo, seleciona em memória o registro aplicável pela mesma regra anterior: `starts_at <= signedAt` e `ends_at >= signedAt` quando houver encerramento, priorizando o início de vigência mais recente. A data de assinatura continua sendo avaliada individualmente; logo, uma alteração de preço ou responsável dentro do mesmo mês continua produzindo valores distintos nos laudos anteriores e posteriores à mudança.

O cálculo anterior não fornecia modalidade a `getActiveDoctorPrice`; portanto, a apuração de competência já usava o preço padrão de unidade/médico. A otimização preserva esse comportamento e não introduz, remove ou altera precificação por modalidade. A evolução para usar modalidade na apuração exige uma decisão funcional separada e testes financeiros específicos.

**Validação no sandbox:** 36 arquivos Vitest aprovados, 241 testes aprovados e 1 integração MinIO ignorada; TypeScript sem erros; build de produção concluído com limite de memória de 1024 MiB. A atualização da VM1 só será preparada após revisão dessa regra financeira e confirmação de que uma competência representativa conclui com os mesmos totais esperados.
