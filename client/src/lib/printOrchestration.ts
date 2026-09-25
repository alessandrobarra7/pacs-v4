// CORREÇÃO (relato técnico "Bloqueio da impressão oficial de laudos PDF",
// Manus, 2026-09-25): a impressão oficial disparava window.print() por um
// script embutido no HTML (window.onload -> setTimeout(print, 400)), e uma
// tentativa de removê-lo por regex antes de reconstruir as páginas
// falhava silenciosamente (a regex não reconhecia o "<\/script>" real
// gerado pelo template literal) — o script sobrevivia e podia imprimir o
// documento ANTES da reconstrução paginada terminar, ou mesmo quando ela
// falhava. A correção definitiva foi nunca gerar esse script (ver
// PacsQueryPage.tsx, onde fullHtml deixou de conter window.onload/
// window.print()); esta função é o único caminho que dispara a impressão
// oficial agora, e é extraída para fora do componente especificamente
// para ser testável com funções injetadas (sem precisar de DOM/iframe
// reais) — Manus pediu explicitamente "função extraída e injetável".
//
// Garantia: `print` só é chamado quando `reconstruct` resolve sem lançar,
// e é chamado no máximo (e exatamente, no caminho de sucesso) uma vez.
export async function runControlledPrint(params: {
  reconstruct: () => Promise<void>;
  print: () => void;
}): Promise<{ printed: true } | { printed: false; error: unknown }> {
  try {
    await params.reconstruct();
  } catch (error) {
    return { printed: false, error };
  }
  params.print();
  return { printed: true };
}
