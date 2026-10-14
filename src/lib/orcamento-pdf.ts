import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { montarHtmlOrcamento, numeroOrcamento } from './orcamento-html';

export interface ArquivoPdf {
  nome: string;
  uri?: string; // celular
  arquivo?: File; // web
}

/** Gera o PDF (A4) no cache do aparelho. */
export async function criarPdfOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]): Promise<ArquivoPdf> {
  const { uri } = await Print.printToFileAsync({ html: montarHtmlOrcamento(o, pecas, itens), width: 595, height: 842 });
  return { nome: `Orçamento ${numeroOrcamento(o.numero)}.pdf`, uri };
}

export const podeCompartilhar = (_a: ArquivoPdf) => true;

/** Abre o menu de compartilhar (WhatsApp, e-mail, salvar…). */
export async function compartilharPdf(a: ArquivoPdf): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  await Sharing.shareAsync(a.uri!, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: a.nome });
  return 'compartilhado';
}

export const baixarPdf = compartilharPdf;
