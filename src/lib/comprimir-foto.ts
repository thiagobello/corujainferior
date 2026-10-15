import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { LADO_MAXIMO, QUALIDADE_JPEG, medidasReduzidas } from './foto-medidas';

/**
 * Celular: reduz e regrava em JPEG (HEIC do iPhone também sai JPEG).
 * Devolve a URI local do arquivo novo, pronta para `enviarFoto`.
 */
export async function comprimirFoto(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  let img = await ctx.renderAsync(); // sem codificar: só para saber as medidas
  const m = medidasReduzidas(img.width, img.height, LADO_MAXIMO);
  if (m.reduzir) {
    img.release();
    img = await ctx.resize({ width: m.largura, height: m.altura }).renderAsync();
  }
  try {
    const r = await img.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG });
    return r.uri;
  } finally {
    img.release();
    ctx.release();
  }
}
