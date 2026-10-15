import { LADO_MAXIMO, QUALIDADE_JPEG, medidasReduzidas } from './foto-medidas';

/*
 * Na web não usamos o expo-image-manipulator: ele desenha a foto inteira num canvas
 * (12–48 MP; o Safari do iPhone recusa canvas acima de ~16,7 MP), redimensiona pixel a
 * pixel em JavaScript e ainda gera um PNG intermediário. Aqui o navegador decodifica a
 * foto e a reduz direto no canvas final, em até duas etapas para manter a nitidez.
 */

function carregar(uri: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('Não foi possível ler a foto. Tente outra.'));
    img.src = uri;
  });
}

function desenhar(origem: CanvasImageSource, largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a foto.');
  ctx.fillStyle = '#fff'; // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, largura, altura);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origem, 0, 0, largura, altura);
  return canvas;
}

/** Web: reduz e regrava em JPEG. Devolve uma URL `blob:` pronta para `enviarFoto`. */
export async function comprimirFoto(uri: string): Promise<string> {
  const img = await carregar(uri); // o navegador já aplica a rotação EXIF
  const m = medidasReduzidas(img.naturalWidth, img.naturalHeight, LADO_MAXIMO);
  if (!m.largura || !m.altura) throw new Error('Não foi possível ler a foto. Tente outra.');
  // Foto muito grande: passa antes pelo dobro do tamanho final (reduzir 10x de uma vez serrilha).
  const meio = m.largura * 2 < img.naturalWidth ? desenhar(img, m.largura * 2, m.altura * 2) : img;
  const canvas = desenhar(meio, m.largura, m.altura);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
  if (!blob) throw new Error('Não foi possível processar a foto.');
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri); // libera a original da memória
  return URL.createObjectURL(blob);
}
