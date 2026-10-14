import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { montarHtmlOrcamento } from './orcamento-html';

/** No navegador: abre o orçamento numa janela e chama a impressão
 *  (escolha "Salvar como PDF" no destino). */
export async function gerarPdfOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]) {
  const janela = window.open('', '_blank');
  if (!janela) throw new Error('O navegador bloqueou a janela do PDF. Permita pop-ups para este site.');
  janela.document.open();
  janela.document.write(montarHtmlOrcamento(o, pecas, itens));
  janela.document.close();
  // Pequena espera para a logo (embutida) renderizar antes de imprimir.
  setTimeout(() => {
    janela.focus();
    janela.print();
  }, 300);
}
