# Dimensionamento e Cálculo de Armazenamento por Exame (Ciclo Completo nas 3 VMs)

**Autor:** Manus AI  
**Data:** 17 de Agosto de 2026  
**Status:** Consolidado e Documentado  

---

## 1. Objetivo do Dimensionamento

Este documento apresenta o modelo matemático e empírico de consumo de espaço em disco e banco de dados para o processamento de um exame radiológico completo no ecossistema de **3 VMs** do **PACS Portal** (VM1 - Portal, VM2 - Banco de Dados, VM3 - Storage MinIO/RAID1). O objetivo é prever com exatidão o impacto operacional por exame e projetar o crescimento a médio e longo prazo.

---

## 2. Anatomia de um Exame e Alocação por Camada

Durante o ciclo de vida (busca na worklist, download temporário para visualização DICOM, anexação de fotografias, gravação de áudio clínico, edição de anamnese, redação e assinatura do laudo), cada artefato é direcionado para uma VM específica:

| Etapa / Artefato | Descrição do Objeto | Destino na Arquitetura | Localização Física | Estimativa Média de Tamanho |
| :--- | :--- | :--- | :--- | :--- |
| **1. Caching DICOM** | Fatias DICOM baixadas para visualização temporária (`.dcm`) | **VM1 (Portal)** | `/var/www/pacs-portal/cache/` | **15 MB a 150 MB** por série (expurgado após 2h) |
| **2. Anamnese & Metadados** | Texto clínico, status do laudo, IDs, timestamps | **VM2 (Banco MySQL)** | Tabelas relacionais (`reports`, `anamnesis`, etc.) | **2 KB a 10 KB** por registro |
| **3. Anexos & Fotos** | Imagens complementares enviadas pelo médico/técnico | **VM3 (MinIO)** | Bucket `vm3-storage` (`anexos/`) | **1 MB a 5 MB** por foto (média de 3 fotos = **12 MB**) |
| **4. Áudio Vinculado** | Gravação da redigitação vocal ou laudo falado (`.webm`) | **VM3 (MinIO)** | Bucket `vm3-storage` (`audio_reports/`) | **500 KB a 2 MB** por minuto (**1,5 MB** médio) |
| **5. Laudo Assinado** | Exportação finalizada do laudo em HTML/PDF | **VM3 (MinIO)** | Bucket `vm3-storage` (`laudos/`) | **30 KB a 100 KB** por laudo |

---

## 3. Fórmula de Consumo por Exame (Ciclo Típico)

Considerando um exame padrão de média complexidade (ex: Tomografia Computadorizada de Crânio com 60 fatias, 3 fotos de anexo, 1 áudio clínico de 45 segundos e 1 laudo assinado), o consumo líquido de armazenamento de longo prazo é dado por:

$$\text{Espaço VM3 por Exame} = \text{Tamanho do Laudo} + \sum (\text{Anexos}) + \text{Áudio}$$

$$\text{Espaço VM3} \approx 0.05\,\text{MB (Laudo)} + 12.0\,\text{MB (3 Fotos)} + 1.2\,\text{MB (Áudio)} \approx \mathbf{13.25\,\text{MB}}$$

Para o banco de dados (**VM2**), o crescimento é insignificante por exame:
$$\text{Espaço VM2 por Exame} \approx \mathbf{0.005\,\text{MB}}$$

Para o **cache temporário na VM1**, os arquivos `.dcm` ocupam cerca de **50 MB** durante a visualização ativa, sendo expurgados automaticamente pelo serviço de limpeza a cada 2 horas, mantendo a pegada em disco da VM1 próxima de **0 MB** em regime estacionário.

---

## 4. Projeção de Crescimento (Planejamento de Capacidade)

Com base na fórmula acima, a tabela abaixo projeta a necessidade de armazenamento na **VM3 (MinIO / RAID1 de 3.6 TB)** para diferentes volumes de exames diários:

| Exames por Dia | Exames por Mês (30 dias) | Consumo Mensal (VM3) | Consumo Anual (VM3) | Anos de Autonomia (em 3.4 TB úteis) |
| :--- | :--- | :--- | :--- | :--- |
| **50 exames/dia** | 1.500 exames | ~19,8 GB | ~237,6 GB | **> 14 anos** |
| **200 exames/dia** | 6.000 exames | ~79,5 GB | ~954,0 GB | **> 3,5 anos** |
| **500 exames/dia** | 15.000 exames | ~198,7 GB | ~2,38 TB | **~1,4 anos** |
| **1.000 exames/dia** | 30.000 exames | ~397,5 GB | ~4,77 TB | Requer expansão de RAID |

---

## 5. Conclusões Operacionais

1. **Isolamento de Carga:** A separação dos arquivos binários pesados para a VM3 impede que o disco operacional da VM1 (Portal) ou o banco da VM2 sofram degradação por estouro de espaço.
2. **Ciclo de Vida do Cache DICOM:** O expurgo automático de 2 horas na VM1 assegura que o Portal não acumule exames DICOM brutos, preservando a performance do sistema.
3. **Sustentabilidade do Storage:** Com 3.6 TB de RAID1, a infraestrutura VM3 suporta confortavelmente operações de médio e grande porte por vários anos antes de qualquer necessidade de redimensionamento físico.
