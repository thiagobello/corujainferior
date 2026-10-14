import * as XLSX from 'xlsx';

export type Formato = 'xlsx' | 'csv';

export function montarArquivo(linhas: Record<string, unknown>[], aba: string, formato: Formato) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  if (formato === 'csv') {
    // BOM para o Excel reconhecer acentos; separador ";" (padrão pt-BR).
    return { tipo: 'text/csv', conteudo: '﻿' + XLSX.utils.sheet_to_csv(ws, { FS: ';' }) };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31));
  return {
    tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string,
    wb,
  };
}
