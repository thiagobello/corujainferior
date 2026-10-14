import * as XLSX from 'xlsx';

import { montarArquivo, type Formato } from './exportar-base';

export type { Formato };

/** Baixa o arquivo no navegador. */
export async function exportarPlanilha(nome: string, linhas: Record<string, unknown>[], formato: Formato = 'xlsx') {
  const a = montarArquivo(linhas, nome, formato);
  if ('wb' in a && a.wb) {
    XLSX.writeFile(a.wb, `${nome}.xlsx`);
    return;
  }
  const blob = new Blob([a.conteudo as string], { type: a.tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nome}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
