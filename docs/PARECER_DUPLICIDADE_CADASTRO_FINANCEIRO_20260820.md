# Parecer de Coerência — Cadastro de Usuário e Financeiro

## Conclusão

O pedido é **coerente e recomendado**: o cadastro de usuário deve concentrar identidade, papel, dados clínicos quando aplicáveis e vínculo com unidades. A precificação e a produção financeira devem ficar somente no módulo Financeiro, que é o contexto adequado para vigência, histórico, preços por modalidade e responsáveis financeiros.

## Pontos confirmados

O `UserFormDialog` mostra as abas **Valores** e **Resumo** exclusivamente quando um `admin_master` cria ou edita um médico. Elas consultam `financeSimple.getDoctorFullContext`, alteram preço com `financeSimple.setDoctorPriceDirect` e exibem saldo e ciclos. Portanto, a correção do documento sobre `unit_admin` está correta: esse perfil não vê essas abas.

Há também configuração de preço durante a criação de médico, por meio de `_pendingPrices`, aplicada após a criação na página administrativa. O documento está correto ao identificar duplicidade de interface e uma experiência potencialmente enganosa: o modal cobre preço padrão por unidade, mas não preços por modalidade.

## Ajuste importante no achado de vigência

O problema de vigência existe, mas com causa diferente da descrita no documento. A função `assertCycleAlignedPriceStart` existe e bloqueia alterações fora da abertura de ciclo para **preço por modalidade**. Contudo, as mutações `setDoctorPriceDirect` e `setDoctorPrice`, usadas para o preço padrão, não chamam essa validação hoje. Assim, enviar `startsAt` com a data atual não tende a produzir o erro citado; o risco real é permitir alteração do preço padrão no ciclo corrente sem a proteção de vigência desejada.

## Escopo recomendado

1. Remover do `UserFormDialog` as abas, hooks, estados e fluxos financeiros, preservando CRM, carimbo, assinatura e vínculo de unidade.
2. Remover o fluxo `_pendingPrices` da criação de médico para que não exista precificação embutida no cadastro.
3. Manter a precificação padrão e por modalidade em uma única área financeira por unidade, com histórico e responsável financeiro visíveis.
4. Aplicar a política de vigência no **servidor**, em uma regra compartilhada para preço padrão e por modalidade; a interface deve oferecer a primeira data válida do próximo ciclo quando já houver preço ativo.
5. Avaliar e remover também os demais atalhos administrativos de preço fora do módulo financeiro, incluindo `UnitDoctorsTab`, para que a centralização seja efetiva.

## Segurança e dados

A remoção proposta é de interface e fluxo; não requer apagar histórico de preços, eventos financeiros ou usuários. Antes da implementação, devem ser acrescentados testes de RBAC, preservação de histórico e bloqueio de alteração de preço fora da data de vigência permitida.

## Implementação autorizada

O cadastro passou a exibir somente as abas **Dados** e **Unidades**. O caminho de preços pendentes durante a criação foi removido, e a aba de médicos por unidade preserva apenas o vínculo, a listagem e a remoção de médicos. A precificação permanece no módulo Financeiro.

As mutações de preço padrão `setDoctorPrice` e `setDoctorPriceDirect` agora verificam, no servidor, se já existe preço ativo antes de aceitar uma nova vigência. Quando existe, a nova data deve coincidir com a abertura de um ciclo futuro. A tela de Configuração Financeira passou a exibir a data de início e sugere a primeira abertura de ciclo disponível para uma alteração de preço já vigente.
