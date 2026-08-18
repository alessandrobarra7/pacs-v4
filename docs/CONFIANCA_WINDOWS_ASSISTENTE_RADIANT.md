# Confiança do Windows para o Assistente RadiAnt

**Status:** recomendação técnica para distribuição comercial.  
**Data:** 18/08/2026.  
**Escopo:** `PacsRadiantAssistantSetup.exe` e `PacsRadiantAssistant.exe`.

## 1. Conclusão executiva

Os avisos observados no piloto correspondem a dois mecanismos diferentes do Windows e do navegador. O aviso que autoriza a abertura de `pacs-radiant://` é uma confirmação de segurança do navegador para iniciar um aplicativo local por protocolo personalizado. Ele é esperado, deve permanecer e não é removido por mais downloads ou por assinatura de código.

O alerta comercialmente prejudicial é o aviso de aplicativo ou publicador desconhecido associado ao arquivo `.exe`. Para tratá-lo, o Portal deve publicar **todas as versões** do instalador e do Assistente com assinatura Authenticode válida, emitida para a entidade legal responsável pelo produto e com carimbo de tempo RFC 3161. A assinatura mostra um publicador identificável, assegura a integridade do arquivo e permite que a reputação seja acumulada sob uma mesma identidade. Authenticode foi concebido exatamente para provar a autoria e que o binário não mudou após a publicação.[1]

> **Não há número de downloads que garanta a retirada automática de um alerta.** O SmartScreen usa reputação do hash específico e do certificado/publicador. Para binários sem assinatura, cada versão começa sem reputação; para binários assinados continuamente pela mesma identidade, a reputação pode se consolidar também no certificado. A Microsoft não divulga um limiar fixo e informa que a consolidação pode exigir semanas e centenas de instalações limpas distribuídas de forma ampla.[2]

## 2. Dois avisos, duas respostas

| Evento | Finalidade | Pode ser removido por assinatura? | Tratamento correto |
|---|---|---:|---|
| Navegador pergunta se pode abrir `PacsRadiantAssistant` | Impede que um site inicie silenciosamente um aplicativo local pelo protocolo `pacs-radiant://`. | Não. | Manter a confirmação padrão, usar nome claro do aplicativo e orientar o usuário a autorizar apenas após iniciar o exame no Portal. |
| Windows/SmartScreen indica aplicativo não reconhecido ou editor desconhecido | Avalia origem, assinatura, reputação do arquivo e do publicador. | A assinatura substitui **editor desconhecido** por publicador verificável, mas a reputação inicial ainda pode mostrar alerta. | Assinar cada release, preservar a mesma identidade de assinatura, aplicar carimbo de tempo e fazer distribuição oficial consistente. |

O primeiro controle protege o computador do médico contra abertura silenciosa por uma página web; removê-lo exigiria alterar proteções locais, o que não é aceitável. O segundo é o controle que precisa ser melhorado comercialmente.

## 3. O que realmente cria confiança

A confiança deve ser construída em duas camadas. A primeira é a **identidade criptográfica**: uma autoridade certificadora valida a entidade legal e o Windows exibe o nome dessa entidade como publicador. A segunda é a **reputação do SmartScreen**: instalações e execuções sem sinais de comportamento malicioso, mantendo o mesmo certificado de assinatura, contribuem ao longo do tempo para a reputação. O SmartScreen também avalia a URL de origem e hashes de arquivos conhecidos.[2] [3]

Downloads repetidos feitos artificialmente, reinstalações em uma única máquina, alteração do arquivo depois de assinado, mudança frequente de certificado ou tentativas de contornar alertas não são uma estratégia de confiança. Além de não fornecerem garantia, tais práticas podem prejudicar a reputação. A distribuição deve permanecer no domínio HTTPS oficial do Portal, com checksum publicado para auditoria, e sem modificações após a assinatura.

## 4. Opções de assinatura avaliadas

| Opção | Vantagem | Limite relevante | Adequação atual |
|---|---|---|---|
| Certificado público de assinatura de código **OV** | Publicador validado e exibido; processo amplamente aceito para software Windows; permite reputação contínua da mesma identidade. | Não elimina necessariamente o primeiro alerta de SmartScreen. A chave exige custódia rigorosa, em token/HSM ou serviço gerenciado. | **Recomendação principal** para o Assistente distribuído fora da Microsoft Store. |
| Certificado público **EV** | Processo de validação mais rigoroso e pode atender exigências específicas de compras corporativas. | A Microsoft informa que EV não ignora mais o SmartScreen; pagar mais somente para eliminar alertas não se justifica.[2] | Considerar somente se exigido por política contratual ou de cliente corporativo. |
| Microsoft Artifact Signing | Serviço gerenciado, certificados protegidos em HSM FIPS 140-3 nível 3, integração de pipeline e sem expor chave privada ao repositório.[4] | A identidade pública deve ser elegível e validada. A lista oficial atual de localidades para identidade pública não inclui o Brasil; é necessário confirmar a elegibilidade jurídica antes de adotá-lo.[5] | Alternativa preferível se a entidade legal for elegível e já houver assinatura Azure paga. |
| Microsoft Store | A assinatura da Microsoft evita os avisos de download do SmartScreen para apps distribuídos pela Store.[2] | Implica empacotamento, política de Store e canal de distribuição diferente; não substitui automaticamente o fluxo atual. | Alternativa futura, não pré-requisito do piloto atual. |

## 5. Decisão recomendada

Para o Portal PACS, a decisão recomendada é obter um **certificado público OV de assinatura de código** em nome da entidade legal que comercializa e mantém o produto, com validação pública de endereço, cadastro empresarial e domínio. O certificado deve manter a mesma identidade de publicador nas versões futuras do Assistente.

O certificado não deve ser emitido apenas para um nome de produto informal. Antes da aquisição, é necessário definir a grafia jurídica que aparecerá no Windows, por exemplo `CN=<razão social validada>, O=<razão social validada>`. O domínio `lauds.com.br` deve hospedar página institucional, canal de suporte e política de privacidade coerentes com a entidade; uma caixa de e-mail corporativa desse domínio deverá receber a validação da autoridade certificadora.

Esta escolha remove o cenário de **editor desconhecido** assim que a assinatura válida for distribuída. Ela não promete eliminar todo aviso na primeira versão assinada: a própria Microsoft esclarece que uma aplicação assinada recentemente ainda pode ser considerada não reconhecida até formar reputação. A abordagem correta é iniciar a assinatura agora, manter o mesmo publicador e liberar a distribuição comercial gradualmente depois de validar em instalações Windows limpas.

## 6. Procedimento seguro de implementação

| Etapa | Responsável | Controle obrigatório |
|---|---|---|
| Definir entidade publicadora | Proprietário do produto | Informar razão social, identificador empresarial, endereço e domínio corporativo consistentes. |
| Obter certificado público OV | Proprietário do produto | Contratar diretamente de autoridade certificadora reconhecida; não compartilhar senhas, tokens ou chaves no repositório, chat ou VM. |
| Custodiar chave de assinatura | Responsável técnico | Preferir token criptográfico, HSM ou serviço gerenciado; acesso mínimo e registro de uso. A chave privada nunca deve residir na VM1 nem no GitHub. |
| Assinar os binários | Pipeline controlado | Assinar `PacsRadiantAssistant.exe` antes de compilar o instalador e assinar `PacsRadiantAssistantSetup.exe` como artefato final. |
| Aplicar carimbo de tempo | Pipeline controlado | Usar SHA-256 e RFC 3161. Sem carimbo de tempo, a assinatura pode passar a ser tratada como inválida quando o certificado expirar.[6] |
| Verificar antes de publicar | Responsável técnico | Executar `signtool verify /pa /v` e registrar hash SHA-256, sujeito, emissor e resultado no release. |
| Validar em Windows limpo | Controle de qualidade | Confirmar o publicador exibido, assinatura válida, download pelo domínio oficial e abertura funcional no RadiAnt sem alterar configurações. |

Um comando de assinatura de referência, a ser parametrizado **somente no ambiente seguro que contém o certificado**, utiliza SHA-256 e carimbo de tempo RFC 3161:

```powershell
signtool sign /fd SHA256 /tr <URL_DO_CARIMBO_DE_TEMPO> /td SHA256 /a PacsRadiantAssistant.exe
signtool sign /fd SHA256 /tr <URL_DO_CARIMBO_DE_TEMPO> /td SHA256 /a PacsRadiantAssistantSetup.exe
signtool verify /pa /v PacsRadiantAssistantSetup.exe
```

Os valores do certificado, do token, da URL específica de carimbo de tempo e de autenticação do serviço de assinatura não devem ser incluídos neste repositório. Eles serão configurados como segredos do pipeline após a contratação e validação da entidade.

## 7. Critérios de liberação comercial

A distribuição ampla somente deverá começar quando todos os critérios abaixo forem verdadeiros:

1. O instalador e o Assistente tiverem assinatura Authenticode válida emitida para a entidade publicadora aprovada.
2. O `signtool verify /pa /v` e `Get-AuthenticodeSignature` validarem a cadeia e o carimbo de tempo.
3. A validação em Windows limpo mostrar o nome do publicador esperado, sem a condição de editor desconhecido.
4. O instalador for baixado apenas por HTTPS no domínio oficial, sem redirecionamento a storage público externo.
5. O fluxo `pacs-radiant://` continuar exigindo a autorização explícita padrão do navegador e respeitar o token temporário por estudo.
6. O release tiver hash SHA-256, versão, data e resultado de verificação registrados para auditoria.

## 8. Próxima decisão necessária

Para iniciar a contratação e configurar o pipeline, o proprietário deve escolher entre as opções abaixo.

| Escolha | Quando escolher | Resultado esperado |
|---|---|---|
| Certificado OV público | A entidade brasileira distribuirá diretamente pelo Portal. | Publicador identificado; reputação acumula com versões assinadas. |
| Artifact Signing | A entidade for elegível para identidade pública e possuir assinatura Azure paga. | Custódia gerenciada e integração de pipeline, sem chave privada local. |
| Microsoft Store | A estratégia comercial aceitar empacotamento e publicação pelo ecossistema Microsoft. | Melhor mitigação de aviso de download, com mudança de canal. |

Nenhuma senha, chave privada, certificado PFX, token USB, código de ativação ou segredo de pipeline deve ser enviado pelo chat, salvo no GitHub ou copiado para a VM1, VM2 ou VM3.

## 9. Estratégia provisória: assinatura individual

Enquanto não houver entidade empresarial formalizada, a alternativa tecnicamente adequada é uma assinatura de código com **validação individual (IV)**. Nesse modelo, o Windows exibe o nome civil verificado do titular do certificado como publicador; não deve exibir `Lauds`, `StudioBarra7` ou outro nome comercial como se fosse uma organização validada. Um certificado IV não requer registro empresarial, mas exige confirmação da identidade do titular.[7]

A identidade pública aprovada pelo titular para aparecer como publicador é **Alessandro Lacerda Rocha**. A autoridade certificadora deve validar essa grafia e emite o sujeito final do certificado conforme a sua própria política. CPF, documento de identidade, data de nascimento, telefone, endereço completo, fotografia de validação e demais dados pessoais não integram este documento, o repositório ou o instalador.

O candidato inicial é um certificado **IV Code Signing** de autoridade certificadora pública que aceite a validação do responsável residente no Brasil. A documentação do emissor deve ser confirmada diretamente antes da contratação, pois a aceitação de documentos, o método de contato e a disponibilidade comercial dependem da jurisdição e podem mudar. A referência consultada informa que a validação individual requer documento oficial com foto, endereço e ano de nascimento, comprovação facial e contato por telefone verificável.[8]

> Documentos de identidade, fotografias, endereço completo, telefone e qualquer dado de pagamento devem ser enviados somente no portal oficial da autoridade certificadora escolhida. Eles não devem ser enviados ao Portal PACS, ao GitHub, às VMs ou por chat.

### 9.1 Custódia provisória recomendada

A preferência é por **assinatura em nuvem gerenciada** pelo próprio emissor, com autenticação multifator do titular. Essa opção evita armazenar uma chave privada ou arquivo `.pfx` na VM1, no repositório ou em uma máquina de build. A alternativa é um token USB criptográfico compatível, guardado fisicamente pelo titular e conectado somente à estação controlada de assinatura. Requisitos atuais do setor exigem que chaves de certificados públicos de assinatura de código permaneçam em hardware seguro ou serviço de nuvem compatível, e não como arquivo exportável.[9]

### 9.2 Limites da solução individual

| Aspecto | Efeito da assinatura individual |
|---|---|
| Nome exibido pelo Windows | Nome civil validado do titular. |
| Integridade do instalador | Verificável: qualquer alteração posterior invalida a assinatura. |
| SmartScreen inicial | Ainda pode exibir aviso de aplicativo não reconhecido até formar reputação; não existe prazo ou volume garantido. |
| Marca `Lauds` | Pode permanecer no nome do produto, site e interface, mas não aparece como organização verificada sem certificado empresarial. |
| Migração futura | Ao formalizar a empresa, será necessário emitir certificado OV em nome da organização. Isso estabelece uma nova identidade de publicação e deve ser tratado como transição planejada. |

### 9.3 Ordem de implementação

1. Confirmar, diretamente com a autoridade certificadora, que ela aceita validação individual para o responsável residente no Brasil e que o certificado será confiável para Authenticode no Windows.
2. Contratar o certificado IV e concluir a validação fora deste projeto, usando apenas o portal oficial do emissor.
3. Configurar uma conta de assinatura em nuvem com autenticação multifator **ou** receber e custodiar o token criptográfico.
4. Assinar primeiro o binário interno `PacsRadiantAssistant.exe`; em seguida, gerar e assinar o instalador `PacsRadiantAssistantSetup.exe`.
5. Aplicar carimbo de tempo RFC 3161, verificar assinatura e hash, e executar validação em Windows limpo antes de substituir o artefato na VM1.
6. Manter a distribuição como controlada até que a identidade individual e a reputação do certificado demonstrem comportamento estável. Quando houver organização formalizada, iniciar uma migração planejada para certificado OV.

## Referências adicionais

[7]: https://www.ssl.com/products/software-integrity/code-signing/iv/ "SSL.com — IV Code Signing"
[8]: https://www.ssl.com/faqs/ssl-ov-validation-requirements/ "SSL.com — Requirements for OV and IV Certificates"
[9]: https://www.ssl.com/how-to/ordering-process-for-code-and-document-signing-certificates/ "SSL.com — Ordering Process for Code and Document Signing Certificates"

## Referências

[1]: https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode "Microsoft Learn — Authenticode digital signatures"
[2]: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation "Microsoft Learn — SmartScreen reputation for Windows app developers"
[3]: https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/ "Microsoft Learn — Microsoft Defender SmartScreen"
[4]: https://learn.microsoft.com/en-us/azure/artifact-signing/overview "Microsoft Learn — What is Artifact Signing?"
[5]: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart "Microsoft Learn — Quickstart: Set up Artifact Signing"
[6]: https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures "Microsoft Learn — Time Stamping Authenticode Signatures"
