# Legendas de Exames e Editor de Laudos Multi-Página — Documentação Técnica

**Sistema:** PACS v4  
**Data de elaboração:** 07/04/2026  
**Status:** Implementado — pendente de deploy na VM1 e migrations na VM2

---

## 1. Visão geral

Este documento descreve duas funcionalidades implementadas no portal PACS v4 que trabalham em conjunto: o sistema de **legendas personalizadas de exames** (ExamPickerModal) e o **editor de laudos multi-página**. Ambas foram desenvolvidas para resolver o problema de estudos DICOM que contêm múltiplos exames em um único `study_instance_uid`.

---

## 2. Funcionalidade 1 — Legendas Personalizadas de Exames (ExamPickerModal)

### 2.1. Problema que resolve

O PACS envia descrições de exames em formato técnico DICOM (ex: `RX TORAX PA E PERFIL`) sem separação clara quando um estudo contém múltiplos procedimentos. O técnico precisava de uma forma de registrar explicitamente quais exames compõem aquele estudo, com nomenclatura padronizada.

### 2.2. Fluxo de uso

1. Na lista de estudos (`PacsQueryPage`), cada linha exibe um **ícone anatômico SVG** à esquerda do nome do exame. O ícone é colorido em **azul** para exames com descrição original do PACS e em **âmbar** para exames com legenda editada pelo técnico.
2. O técnico clica no ícone anatômico para abrir o **ExamPickerModal**.
3. O modal exibe um catálogo de exames com busca por texto e filtro por modalidade. O técnico seleciona um ou mais exames.
4. Ao confirmar, a legenda é salva na tabela `study_metadata` com o campo `description_override` contendo os nomes concatenados (ex: `RX TÓRAX PA E PERFIL | SEIOS DA FACE`) e o campo `exam_count` com a quantidade de exames selecionados.
5. O ícone anatômico passa a refletir a região do primeiro exame selecionado.

### 2.3. Ícone anatômico — mapeamento de regiões

O ícone é determinado automaticamente pela descrição do exame usando correspondência de palavras-chave:

| Palavras-chave | Ícone exibido |
|---|---|
| TÓRAX, PULMÃO, PLEURA, COSTELA | Pulmões |
| CRÂNIO, SEIOS DA FACE, ÓRBITA, MASTOIDE | Crânio |
| COLUNA, LOMBAR, CERVICAL, TORÁCICA, SACRO | Vértebras |
| ABDOME, FÍGADO, RIM, BAÇO, PELVE, VESÍCULA | Abdome |
| CORAÇÃO, AORTA, CARDÍACO | Coração |
| OMBRO, ÚMERO, COTOVELO, PUNHO, MÃO, DEDO | Membro superior |
| JOELHO, FÊMUR, TÍBIA, TORNOZELO, PÉ, QUADRIL | Membro inferior |
| MAMA, MAMOGRAFIA | Mama |
| PESCOÇO, TIREOIDE, LARINGE | Pescoço |
| Outros | Ícone genérico (raio-x) |

### 2.4. Arquivos envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `client/src/components/ExamPickerModal.tsx` | Modal de seleção de exames com catálogo e busca |
| `client/src/pages/PacsQueryPage.tsx` | Componente `EditableExamName` com ícone anatômico e integração do modal |
| `drizzle/schema.ts` | Campo `exam_count` na tabela `study_metadata` |
| `drizzle/0018_dizzy_moon_knight.sql` | Migration SQL para adicionar `exam_count` |
| `server/routers.ts` | Procedures `studyMetadata.upsert` e `studyMetadata.get` |

### 2.5. Migration pendente na VM2

```sql
-- Executar no MySQL da VM2: mysql -u root -p137946 pacs_portal
ALTER TABLE `study_metadata` ADD `exam_count` int DEFAULT 1;
```

---

## 3. Funcionalidade 2 — Editor de Laudos Multi-Página

### 3.1. Problema que resolve

Quando um estudo contém múltiplos exames (ex: `exam_count = 2`), o laudo deve ser apresentado como **N folhas A4 independentes**, cada uma com cabeçalho completo (logo da unidade, nome do paciente, data de realização), título específico do exame e área editável própria. A solução anterior exibia tudo em uma única folha com separador tracejado, sem replicar o cabeçalho.

### 3.2. Fluxo de uso

1. O médico abre o editor de laudos (`ReportEditorPage`) para um estudo com `exam_count ≥ 2`.
2. O editor detecta automaticamente a quantidade de exames via `sessionStorage` (chave `examNames`) e renderiza N folhas A4 completas em sequência vertical.
3. Cada folha contém:
   - **Cabeçalho:** logo da unidade + nome do paciente + número do prontuário + data de realização
   - **Título do exame:** nome específico do exame daquela seção
   - **Área editável:** `contentEditable div` com suporte a formatação rich text
   - **Rodapé:** nome da unidade + endereço + telefone
4. A **assinatura e carimbo** aparecem apenas na última folha.
5. O médico navega entre as folhas com scroll vertical dentro do painel principal.

### 3.3. Estrutura de dados — salvamento no banco

O laudo continua sendo **1 registro único** na tabela `reports` por `study_instance_uid`. O campo `body` armazena um JSON serializado com a estrutura:

```json
[
  { "title": "RX TÓRAX PA E PERFIL", "body": "<p>Técnica adequada...</p>" },
  { "title": "SEIOS DA FACE", "body": "<p>Seios paranasais...</p>" }
]
```

Para laudos de exame único (legado), o campo `body` continua sendo HTML puro (string), garantindo compatibilidade retroativa. O editor detecta automaticamente o formato ao carregar um laudo existente: se o conteúdo começa com `[`, trata como JSON multi-página; caso contrário, trata como HTML de página única.

### 3.4. CSS de impressão

O arquivo `client/src/index.css` contém a regra de impressão:

```css
@media print {
  .report-page {
    page-break-after: always;
  }
  .report-page:last-child {
    page-break-after: avoid;
  }
}
```

Isso garante que cada folha A4 gere uma página separada ao imprimir ou exportar PDF.

### 3.5. Regra financeira — não impactada

A quantidade de páginas do laudo **não altera a lógica de cobrança**. Um estudo com 2 exames gera exatamente **1 evento faturável**, pois o UNIQUE constraint `(study_instance_uid, unit_id)` garante que há apenas 1 registro na tabela `reports`. O campo `exam_count` é informativo e não entra nos cálculos do módulo financeiro.

### 3.6. Arquivos envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `client/src/pages/ReportEditorPage.tsx` | Renderização multi-página, `collectBody()`, carregamento de laudo existente |
| `client/src/index.css` | CSS de impressão com `page-break-after: always` |
| `server/routers.ts` | Procedures `reports.save` e `reports.get` (sem alteração de contrato) |

---

## 4. Dependências entre as duas funcionalidades

As duas funcionalidades são independentes mas complementares:

- **ExamPickerModal** define `exam_count` e `examNames` para o estudo.
- **ReportEditorPage** lê `examNames` do `sessionStorage` (passado pelo `PacsQueryPage` ao navegar para o editor) e renderiza N páginas.
- Se `exam_count = 1` ou `examNames` não estiver definido, o editor funciona no modo página única (comportamento original preservado).

---

## 5. Checklist de deploy na VM1

Execute na VM1 (`/home/pacs/pacs-portal`) após aplicar a migration na VM2:

```bash
git pull origin main
pnpm install
pnpm build
pm2 restart all
```

---

## 6. Checklist de verificação pós-deploy

```bash
# Na VM2 — verificar se a coluna exam_count foi criada
mysql -u root -p137946 pacs_portal -e "SHOW COLUMNS FROM study_metadata LIKE 'exam_count';"

# Na VM1 — verificar se o build foi bem-sucedido
pm2 logs --lines 20
```

**No browser:**
1. Abrir a lista de estudos — verificar se o ícone anatômico aparece em cada linha.
2. Clicar no ícone de um exame — verificar se o ExamPickerModal abre com o catálogo.
3. Selecionar 2 exames e confirmar — verificar se a legenda é atualizada.
4. Clicar em Laudar — verificar se o editor abre com 2 folhas A4 independentes, cada uma com cabeçalho completo.
5. Assinar o laudo — verificar se a assinatura aparece apenas na última folha.
6. Imprimir/exportar PDF — verificar se cada exame gera uma página separada.

---

*Documento elaborado em 07/04/2026. Funcionalidades implementadas e testadas no ambiente de desenvolvimento.*
