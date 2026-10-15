# Homologação em produção — escopo por unidade em removeDoctor/listDoctors/listAllDoctors

**Data:** 2026-10-15
**Branch:** `claude/achado-removedoctor-sem-escopo-unidade` (commit `6bb740f`)
**Ambiente:** produção (`https://lauds.com.br`), implantado pela Manus
**Metodologia:** chamadas tRPC reais, autenticadas, feitas pelo navegador do Alessandro (sessão real, cookies httpOnly), sem acesso a dados clínicos, imagens DICOM ou laudos de pacientes. Nenhum dado real foi apagado.

---

## 1. Preparação do cenário de teste

Produção tinha, no momento do teste, duas unidades cadastradas (`HOSPITAL DA CRIANÇA`, id 20, e `UNIDADE 1T`, id 23) e nenhuma conta com role `unit_admin`. Para exercitar a guarda de escopo foi criada, pelo Alessandro (root/`admin_master`), uma conta de teste:

- usuário `teste` (nome "teste2"), role `unit_admin`, vinculada **somente** à unidade 20 (`HOSPITAL DA CRIANÇA`).

Confirmado via `admin.listUsers` (sessão root) antes do teste:

```json
{
  "id": 13340,
  "username": "teste",
  "role": "unit_admin",
  "unit_id": 20,
  "linked_units": [{ "unit_id": 20, "unit_name": "HOSPITAL DA CRIANÇA" }]
}
```

O Alessandro fez login com essa conta; a sessão foi confirmada via `auth.me` antes de cada rodada de teste.

## 2. Confirmação preliminar: contrato novo está no ar

Antes de ter a conta `unit_admin` pronta, foi feita uma checagem adicional (com sessão de um usuário `medico` comum) provando que o código novo já estava implantado:

- `units.listAllDoctors` sem `unitId` no input → `400 BAD_REQUEST` ("expected object, received undefined"). Isso só ocorre com o schema novo (`z.object({ unitId: z.number() })`); a versão antiga não exigia nenhum input.

## 3. Cenários testados (sessão `unit_admin`, id 13340)

Todos os quatro testes abaixo foram feitos por leitura (`listDoctors`/`listAllDoctors`), que exercitam exatamente a mesma função de guarda (`assertUnitAdminScope`) usada em `removeDoctor` — sem precisar executar a ação destrutiva de remoção contra dados reais.

| # | Chamada | Esperado | Resultado |
|---|---|---|---|
| 1 | `units.listDoctors({ unitId: 23 })` — unidade de fora (UNIDADE 1T) | `403 FORBIDDEN`, "Unit admin não tem acesso a esta unidade" | **PASSOU** — `403`, mensagem exata |
| 2 | `units.listAllDoctors({ unitId: 23 })` — unidade de fora | `403 FORBIDDEN`, mesma mensagem | **PASSOU** — `403`, mensagem exata |
| 3 | `units.listDoctors({ unitId: 20 })` — própria unidade | `200`, lista de médicos vinculados | **PASSOU** — `200`, retornou `gian carvalho` e `Dr(a) Claudia Cipriano` |
| 4 | `units.listAllDoctors({ unitId: 20 })` — própria unidade | `200`, lista de médicos disponíveis para vincular | **PASSOU** — `200`, mesma lista |

Respostas brutas dos casos negativos:

```json
{
  "status": 403,
  "body": [{
    "error": {
      "json": {
        "message": "Unit admin não tem acesso a esta unidade",
        "code": -32003,
        "data": { "code": "FORBIDDEN", "httpStatus": 403, "path": "units.listDoctors" }
      }
    }
  }]
}
```

(idêntico para `units.listAllDoctors`, trocando apenas `path`.)

## 4. Por que isso valida `removeDoctor` também

`removeDoctor`, `listDoctors` e `listAllDoctors` chamam a mesma função `assertUnitAdminScope(user, unitId)` logo após a checagem de cargo, antes de qualquer consulta ao banco. Os testes 1 e 2 provam que, para a conta `unit_admin` de teste, a função nega corretamente o acesso à unidade 23 com o código e a mensagem exatos especificados no parecer da Manus. Como o `removeDoctor` usa a mesma função, com a mesma assinatura e o mesmo ponto de chamada, o comportamento de bloqueio é idêntico — sem necessidade de executar a remoção de verdade contra um vínculo real em produção.

## 5. Limpeza

A conta de teste `teste` (id 13340) deve ser removida pela equipe (ação de exclusão de conta não executada pela Claude, por restrição própria). A unidade `UNIDADE 1T` (id 23) não foi criada para este teste — já existia em produção antes dele; nenhuma ação foi tomada sobre ela.

## 6. Veredito

Os 4 cenários testados em produção, mais a checagem preliminar de contrato, confirmam que a correção de `claude/achado-removedoctor-sem-escopo-unidade` (commit `6bb740f`) está implantada corretamente e funcionando como especificado: `unit_admin` é bloqueado com `403` e a mensagem padronizada ao tentar acessar uma unidade fora do seu escopo, e continua operando normalmente dentro da própria unidade. Nenhuma regressão observada no fluxo normal de gestão de médicos.

Aguardando aprovação final da Manus para considerar o branch pronto para merge.
