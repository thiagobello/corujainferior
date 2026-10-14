import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { montarArquivo, type Formato } from './exportar-base';

export type { Formato };

/** Gera o arquivo no cache e abre o menu de compartilhar do celular. */
export async function exportarPlanilha(nome: string, linhas: Record<string, unknown>[], formato: Formato = 'xlsx') {
  const a = montarArquivo(linhas, nome, formato);
  const arquivo = new File(Paths.cache, `${nome}.${formato}`);
  arquivo.create({ overwrite: true });
  if ('base64' in a && a.base64) arquivo.write(a.base64, { encoding: 'base64' });
  else arquivo.write(a.conteudo as string);
  await Sharing.shareAsync(arquivo.uri, { mimeType: a.tipo, dialogTitle: nome });
}
