/**
 * Tamanho das fotos enviadas ao armazenamento.
 * A maior exibição é 140 px (≈420 px reais em tela 3x); 1280 px no lado maior sobra para
 * ampliar e ler escudo/etiqueta, e JPEG 0,7 é o ponto em que o arquivo cai muito sem
 * perda visível. Resultado típico: 150–350 KB por foto (antes: ~3 MB).
 */
export const LADO_MAXIMO = 1280;
export const QUALIDADE_JPEG = 0.7;

/** Medidas finais mantendo a proporção; não amplia foto menor que o limite. */
export function medidasReduzidas(largura: number, altura: number, ladoMaximo = LADO_MAXIMO) {
  const maior = Math.max(largura, altura);
  if (!maior || maior <= ladoMaximo) return { largura, altura, reduzir: false };
  const fator = ladoMaximo / maior;
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator), reduzir: true };
}
