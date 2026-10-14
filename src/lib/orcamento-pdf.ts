import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { montarHtmlOrcamento } from './orcamento-html';

/** Gera o PDF (A4) e abre o menu de compartilhar (WhatsApp, e-mail, salvar…). */
export async function gerarPdfOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]) {
  const html = montarHtmlOrcamento(o, pecas, itens);
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Orçamento ${o.numero}` });
}
