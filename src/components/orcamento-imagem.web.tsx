// Web: a imagem é desenhada em canvas (lib/orcamento-canvas.ts); nada é renderizado na tela.
import { useImperativeHandle, type Ref } from 'react';

import type { ItemOrcamento, Orcamento, PecaOrcamento } from '@/lib/api';
import { LOGO_MARCA } from '@/lib/logo-marca';
import { type ArquivoImagem, conteudoOrcamento, nomeArquivoOrcamento } from '@/lib/orcamento';
import { desenharOrcamento } from '@/lib/orcamento-canvas';

export interface GeradorImagem {
  gerar(): Promise<ArquivoImagem>;
}

export function GeradorImagemOrcamento({ ref, orcamento, pecas, itens }: {
  ref: Ref<GeradorImagem>;
  orcamento: Orcamento;
  pecas: PecaOrcamento[];
  itens: ItemOrcamento[];
}) {
  useImperativeHandle(ref, () => ({
    async gerar() {
      const blob = await desenharOrcamento(conteudoOrcamento(orcamento, pecas, itens), LOGO_MARCA);
      const nome = nomeArquivoOrcamento(orcamento);
      return { nome, arquivo: new File([blob], nome, { type: 'image/png' }) };
    },
  }), [orcamento, pecas, itens]);
  return null;
}
