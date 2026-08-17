# Análise da documentação VM3 / MinIO / RAID1

## Fonte principal

Arquivo fornecido pelo usuário: `/home/ubuntu/upload/VM3_PACS_MINIO_RAID1_DOCUMENTACAO_COMPLETA(1).txt`.

A documentação descreve a **VM3 física já criada**, e não uma pasta ou módulo adicional do Portal. Ela não substitui a VM1 (Portal) nem a VM2 (MySQL/MariaDB); acrescenta uma terceira camada dedicada de armazenamento.

## Fatos documentados

| Item | Valor documentado |
|---|---|
| Hostname | `pacs-vm3` |
| IP | `172.16.3.102/22` |
| Gateway | `172.16.0.1` |
| Sistema | Ubuntu Server 22.04.5 LTS |
| Virtualização | KVM/QEMU em Proxmox VE |
| CPU/RAM | 4 vCPU / 4 GB |
| Disco do sistema | `/dev/sda`, aproximadamente 40 GB |
| Discos de dados | `/dev/sdb` + `/dev/sdc`, aproximadamente 4 TB cada |
| RAID | mdadm RAID1 em `/dev/md0` |
| Filesystem | EXT4, montado em `/data/storage` |
| API MinIO | `http://172.16.3.102:9000` |
| Console MinIO | porta `9001`, restrita pelo UFW no cenário documentado |
| Bucket | `vm3-storage` |
| Conta de aplicação inicial | `pacs-app` |
| Policy | `app-policy` |
| Origem autorizada no firewall | VM1 `172.16.3.100` |

A documentação registra que a API respondeu a testes da VM1, o bucket foi criado e operações de upload, leitura/download e remoção foram testadas com a conta de aplicação. Também registra que o bucket estava vazio no último inventário de objetos, portanto a migração efetiva dos uploads do Portal ainda precisava ser comprovada.

## Pendências operacionais registradas

A ressincronização inicial do RAID1 ainda precisava ser confirmada como concluída; o QEMU Guest Agent precisava ser validado; referências antigas ao storage da VM2 precisavam ser revisadas; a VM3 precisava ser validada após reboot; e uma política de backup externo precisava ser definida. RAID1 não substitui backup contra exclusão, corrupção, ransomware, perda simultânea ou desastre físico.

Os comandos destrutivos `wipefs` e `mkfs` descritos no documento não devem ser repetidos em discos que contenham dados válidos.

## Decisões de segurança para o Portal

O Portal deve usar uma conta de aplicação com privilégio restrito, nunca a conta administrativa do MinIO. A Secret Key registrada originalmente na documentação e qualquer chave que apareça em chat, terminal compartilhado ou repositório devem ser consideradas comprometidas e rotacionadas antes da ativação definitiva.

O banco guarda apenas metadados e referências estáveis. O conteúdo dos arquivos fica no MinIO. O Portal gera URLs pré-assinadas de curta duração no momento da leitura e mantém uma rota privada autenticada para objetos que precisam de uma referência estável.

Uploads locais antigos em `/uploads/` permanecem legíveis durante a transição. Novos uploads usam MinIO quando as variáveis `MINIO_*` estão configuradas. A leitura de URLs legadas não deve reintroduzir fallback para o IP `172.16.3.101` ou bucket `lauds`.

## Validação feita no ambiente informado

O health check executado na própria VM3 respondeu `HTTP/1.1 200 OK`. O mesmo health check executado na VM1 também respondeu `HTTP/1.1 200 OK`, confirmando conectividade VM1 → VM3 e acesso à porta 9000 pelo firewall. O sandbox não possui rota para a rede privada, então o teste autenticado S3 não pode ser concluído a partir dele; deve ser executado pela própria VM1 ou por um upload controlado do Portal.

## Fontes oficiais MinIO consultadas

- [mc admin user](https://docs.min.io/aistor/reference/cli/admin/mc-admin-user/): lista os subcomandos disponíveis para usuários; a versão Community observada não reconheceu `mc admin user passwd`.
- [mc admin accesskey](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/): descreve access keys vinculadas a usuários.
- [mc admin accesskey create](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-create/): descreve a criação de um novo par access key/secret key para usuário existente.
- [mc admin accesskey edit](https://docs.min.io/aistor/reference/cli/admin/mc-admin-accesskey/mc-admin-accesskey-edit/): descreve edição de secret key em versões/edições que oferecem esse subcomando.
- [MinIO multi-user administration](https://github.com/minio/minio/blob/master/docs/multi-user/admin/README.md): referência do modelo de usuários e policies.

## Estado do código desta análise

`server/minio.ts` lê as variáveis de ambiente de forma lazy; `server/storage.ts` usa MinIO para novos objetos e mantém compatibilidade local; `server/routers/medicalData.ts` grava logos, assinaturas e carimbos no storage comum, remove referências antigas depois da substituição e resolve URLs temporárias; `server/_core/index.ts` fornece `/api/media/*` com autenticação, isolamento por unidade/estudo e redirecionamento para URL pré-assinada; `server/mediaProxy.ts` não possui mais fallback hardcoded para a VM2.

A suíte final validada no sandbox apresentou 25 arquivos de teste, 205 testes aprovados e 1 teste de integração MinIO pulado porque o sandbox não alcança a rede privada. O build de produção foi concluído com `NODE_OPTIONS=--max-old-space-size=2048` devido ao tamanho do bundle DICOM/Cornerstone.
