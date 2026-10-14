// Na web o PDF é gerado no próprio aparelho (pdfmake) e entregue pelo
// compartilhar nativo (Web Share) ou por download. Funciona também no
// iPhone com o site aberto como atalho em tela cheia, onde nova janela e
// impressão não funcionam.
import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { numeroOrcamento } from './orcamento-html';
import { montarDocOrcamento } from './orcamento-pdfmake';

export interface ArquivoPdf {
  nome: string;
  uri?: string;
  arquivo?: File;
}

// Carregado só quando gera o PDF (a biblioteca e as fontes têm ~1,8 MB).
async function carregarPdfMake() {
  const [pm, fontes] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake = (pm as any).default ?? pm;
  pdfMake.addVirtualFileSystem((fontes as any).default ?? fontes);
  return pdfMake;
}

export async function criarPdfOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]): Promise<ArquivoPdf> {
  const pdfMake = await carregarPdfMake();
  const blob: Blob = await pdfMake.createPdf(montarDocOrcamento(o, pecas, itens)).getBlob();
  const nome = `Orçamento ${numeroOrcamento(o.numero)}.pdf`;
  return { nome, arquivo: new File([blob], nome, { type: 'application/pdf' }) };
}

/** Compartilhar nativo com arquivo (iPhone/Android). No computador costuma não existir. */
export function podeCompartilhar(a: ArquivoPdf): boolean {
  return !!a.arquivo && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [a.arquivo] });
}

/** Precisa ser chamado direto do toque do usuário (exigência do navegador). */
export async function compartilharPdf(a: ArquivoPdf): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  if (!podeCompartilhar(a)) return baixarPdf(a);
  try {
    await navigator.share({ files: [a.arquivo!], title: a.nome });
    return 'compartilhado';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelado';
    throw e;
  }
}

export async function baixarPdf(a: ArquivoPdf): Promise<'baixado'> {
  const url = URL.createObjectURL(a.arquivo!);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'baixado';
}
