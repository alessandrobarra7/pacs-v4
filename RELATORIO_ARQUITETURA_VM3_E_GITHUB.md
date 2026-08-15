# Relatório Técnico: Arquitetura Futura VM3 e Sincronização do Repositório

**Autor:** Manus AI  
**Data:** 15 de agosto de 2026  
**Projeto:** PACS Portal (`pacs-portal`)  
**Repositório:** [alessandrobarra7/pacs-v4](https://github.com/alessandrobarra7/pacs-v4) (Branch: `integracao/login-mobile`)

---

## 1. Visão Geral e Decisão Arquitetural

Com o avanço da integração do fluxo de anexos fotográficos e documentos em PDF vinculados aos exames dos pacientes, levantou-se a preocupação operacional sobre o impacto do crescimento do volume de arquivos binários nas VMs existentes. Atualmente, o sistema opera sob a arquitetura de duas máquinas virtuais principais: **VM1**, responsável pelo portal web, API Express/tRPC e serviços de interface, e **VM2**, dedicada ao banco de dados MySQL.

Para evitar a sobrecarga de armazenamento e backup na VM1 (onde os uploads eram inicialmente gravados em diretórios locais de desenvolvimento), foi estabelecida a diretriz de planejar e implementar futuramente uma **VM3 dedicada exclusivamente ao armazenamento de objetos (Object Storage)**.

| Camada | Função Principal | Tecnologias / Estratégia |
| :--- | :--- | :--- |
| **VM1 (Portal & API)** | Execução do Node.js, Express, tRPC e frontend React | Sem acúmulo de binários de longo prazo; encaminhamento seguro |
| **VM2 (Banco de Dados)** | Armazenamento relacional de metadados, usuários, permissões e referências (`study_attachments`) | MySQL/TiDB otimizado sem blobs binários |
| **VM3 (Armazenamento Futuro)** | Repositório isolado para fotos de exames, laudos em PDF e anexos | MinIO compatível com S3, disco dedicado e backup externo |

---

## 2. Impacto e Benefícios da VM3 para a Operação

A adoção futura de uma VM3 baseada em MinIO ou armazenamento compatível com S3 traz vantagens cruciais para a estabilidade e escalabilidade do PACS Portal:

1. **Isolamento de Recursos:** O disco da VM1 não sofrerá esgotamento por acúmulo de fotografias e PDFs de exames ao longo dos meses e anos de operação.
2. **Segurança e Conformidade:** O acesso aos arquivos binários será intermediado exclusivamente pela VM1 mediante autenticação e verificação de permissões RBAC e unidades, impedindo exposição direta de documentos médicos.
3. **Estratégia de Backup Modular:** Os backups de banco de dados na VM2 (leves e rápidos) ficam desacoplados dos snapshots e políticas de retenção de arquivos pesados na VM3.
4. **Preservação da Fonte PACS:** O PACS/Orthanc original permanece intacto, pois o acervo complementar de fotografias clínicas e documentos do paciente reside em infraestrutura controlada pelo portal de laudos.

---

## 3. Confirmação de Sincronização com o GitHub

Todas as melhorias desenvolvidas até o momento — incluindo a página de login pixel-perfect LAUDS, a listagem PACS mobile otimizada com edição local de nomes de pacientes, a modal de seleção de data, a rota e a interface simplificada de anexos com suporte à câmera e visualização ampliada — encontram-se devidamente validadas por 171 testes Vitest e sincronizadas com o repositório remoto.

* **Branch Sincronizada:** `integracao/login-mobile`
* **Último Commit:** `1e88863` — *Checkpoint: Registro arquitetural: a futura VM3 será criada posteriormente para armazenar fotos, anexos e laudos em PDF...*
* **Status no Repositório Remoto:** Atualizado e verificado com sucesso via GitHub CLI (`gh`).

---

## 4. Próximos Passos na Integração

Mantendo a ordem rigorosa de integração item por item a partir do `SET_LIST_INTEGRACAO.md`, as próximas etapas planejarão e refinarão os itens pendentes de configuração de relatórios e layouts, garantindo que a base de código permaneça íntegra, testada e aderente à separação de responsabilidades entre VM1 e VM2, com a nota arquitetural da VM3 formalizada no projeto.
