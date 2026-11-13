// Entrega da imagem do orçamento na web: compartilhar nativo (Web Share com
// arquivo) ou download. Funciona no iPhone com o site aberto como atalho em
// tela cheia, onde nova janela e impressão não funcionam.
import type { ArquivoImagem } from './orcamento';

export type { ArquivoImagem };

/** Compartilhar com arquivo (iPhone/Android). No computador costuma não existir. */
export function podeCompartilhar(a: ArquivoImagem): boolean {
  return !!a.arquivo && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [a.arquivo] });
}

/** Precisa ser chamado direto do toque do usuário (exigência do navegador). */
export async function compartilharImagem(a: ArquivoImagem): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  if (!podeCompartilhar(a)) return baixarImagem(a);
  try {
    await navigator.share({ files: [a.arquivo!] });
    return 'compartilhado';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelado';
    throw e;
  }
}

/** Download do PNG (no iPhone abre a imagem, de onde dá para salvar ou compartilhar). */
export async function baixarImagem(a: ArquivoImagem): Promise<'baixado'> {
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
