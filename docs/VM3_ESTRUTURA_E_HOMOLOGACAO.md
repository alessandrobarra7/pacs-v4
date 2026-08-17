# Homologação e Inventário da Infraestrutura VM3 (Storage & MinIO)

**Autor:** Manus AI  
**Data:** 17 de Agosto de 2026  
**Status:** Concluído e Validado  

---

## 1. Visão Geral e Objetivo

A **VM3 (`172.16.3.102`)** constitui a terceira camada da arquitetura de alta disponibilidade do **PACS Portal**, operando estritamente como o repositório de armazenamento de objetos pesados (laudos fechados em HTML, anexos de exames e áudios vinculados) [1]. Este documento consolida os resultados do diagnóstico de leitura executado na VM3, validando a integridade do RAID1, a montagem do sistema de arquivos, a prontidão do serviço MinIO e as políticas de segurança.

---

## 2. Inventário de Infraestrutura e Hardware (VM3 Real)

Com base na coleta de dados realizada diretamente no ambiente de produção da VM3, o estado físico e lógico da máquina encontra-se formalizado na tabela abaixo.

| Componente | Especificação Observada | Estado / Validação |
| :--- | :--- | :--- |
| **Endereço IP** | `172.16.3.102` | Acessível exclusivamente pela rede interna (VM1). |
| **Discos Físicos** | `/dev/sdb`, `/dev/sdc` | Configurados em par de espelhamento RAID1. |
| **Dispositivo RAID** | `/dev/md0` (`active raid1`) | Sincronização ativa (`[UU]`), velocidade estável (~41 MB/s). |
| **Sistema de Arquivos** | `ext4` (com opção `noatime`) | Montado corretamente no ponto `/data/storage`. |
| **Capacidade Total** | `3,6 TB` | Espaço disponível de `3,4 TB` (apenas 1% utilizado). |
| **Serviço MinIO** | `minio.service` (`active / running`) | Operando na porta TCP `9000`. |
| **Bucket Principal** | `vm3-storage` | Alocado no armazenamento persistente do MinIO. |

---

## 3. Análise de Integridade do RAID1

O monitoramento do kernel (`/proc/mdstat`) e do utilitário `mdadm` confirmou que o espelhamento de discos (`/dev/md0`) está íntegro e em operação contínua. Os dois discos membros (`sdb` e `sdc`) estão ativos e sem falhas de setor. 

> **Aviso Operacional:** Nenhuns comandos destrutivos (como `wipefs`, `mkfs.ext4` ou recriação do array `mdadm --create`) devem ser aplicados sobre os discos da VM3, sob pena de perda total dos dados armazenados no storage.

---

## 4. Camada de Aplicação de Objeto (MinIO)

O servidor de objetos MinIO configurado na VM3 atende às diretrizes de isolamento de rede do projeto:
1. **Endpoint Interno:** `http://172.16.3.102:9000` (utilizado exclusivamente pela VM1 do Portal via credenciais restritas de aplicação).
2. **Isolamento de Console:** A porta administrativa `9001` permanece restrita para impedir exposição indesejada na rede corporativa.
3. **Compatibilidade S3:** O bucket `vm3-storage` está mapeado para receber os objetos pesados gerados pelas rotinas de laudos, anexos e áudios.

---

## 5. Referências

[1] Arquitetura de 3 VMs do PACS Portal (`docs/ARQUITETURA_3_VMS_PACS.md`).  
[2] Runbook de Homologação da VM3 (`docs/VM3_HOMOLOGACAO_RUNBOOK.md`).  
