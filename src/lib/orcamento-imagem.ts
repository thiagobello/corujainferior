// Entrega da imagem do orçamento no celular: abre o menu de compartilhar
// (WhatsApp, salvar em Fotos…). A imagem é gerada por
// components/orcamento-imagem.tsx (view capturada com react-native-view-shot).
import * as Sharing from 'expo-sharing';

import type { ArquivoImagem } from './orcamento';

export type { ArquivoImagem };

export const podeCompartilhar = (_a: ArquivoImagem) => true;

export async function compartilharImagem(a: ArquivoImagem): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const uri = a.uri!.startsWith('file://') ? a.uri! : `file://${a.uri}`;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: a.nome });
  return 'compartilhado';
}

export const baixarImagem = compartilharImagem;
