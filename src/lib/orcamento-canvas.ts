// Desenha a imagem do orçamento com Canvas 2D (web). Roda no próprio aparelho,
// sem biblioteca: funciona no iPhone com o site como atalho em tela cheia.
// Largura fixa de 1080 px e altura conforme o número de camisas.
import { CORES_ORCAMENTO as C, type ConteudoOrcamento, LARGURA_IMAGEM, OBSERVACOES_ORCAMENTO, RODAPE_ORCAMENTO } from './orcamento';

const FONTE = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
const W = LARGURA_IMAGEM;
const M = 60; // margem lateral
const PAD = 30; // recuo interno das linhas da tabela
const COL_VALOR = 250; // coluna dos valores
const RAIO = 24;
// iOS limita a área do canvas (~16,7 milhões de pixels): acima disso reduz a escala.
const AREA_MAXIMA = 16_000_000;

type Ctx = CanvasRenderingContext2D;
type Trecho = { texto: string; negrito?: boolean };

const fonte = (tam: number, negrito = false) => `${negrito ? '700' : '400'} ${tam}px ${FONTE}`;

function espacamento(ctx: Ctx, px: number) {
  // letterSpacing não existe em todo navegador; sem ele o texto só fica mais junto.
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${px}px`;
}

/** Quebra o texto em linhas que cabem na largura (palavras longas são cortadas). */
function quebrar(ctx: Ctx, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = '';
    let resto = palavra;
    while (ctx.measureText(resto).width > largura) {
      let n = resto.length - 1;
      while (n > 1 && ctx.measureText(resto.slice(0, n)).width > largura) n--;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  }
  if (atual || !linhas.length) linhas.push(atual);
  return linhas;
}

/** Quebra texto com trechos em negrito; devolve as linhas já com a posição de cada pedaço. */
function quebrarRico(ctx: Ctx, trechos: Trecho[], tam: number, largura: number) {
  const linhas: { x: number; texto: string; negrito: boolean }[][] = [[]];
  let x = 0;
  for (const t of trechos) {
    ctx.font = fonte(tam, t.negrito);
    // Pedaços = palavra + espaços seguintes, para manter o espaço entre trechos.
    for (const bruto of t.texto.match(/\s*\S+\s*/g) ?? []) {
      // Pedaço que ainda não cabe vai para a linha seguinte (sem espaço no início).
      if (x > 0 && x + ctx.measureText(bruto.trimEnd()).width > largura) {
        linhas.push([]);
        x = 0;
      }
      const pedaco = x === 0 ? bruto.trimStart() : bruto;
      linhas[linhas.length - 1].push({ x, texto: pedaco, negrito: !!t.negrito });
      x += ctx.measureText(pedaco).width;
    }
  }
  return linhas;
}

/** Retângulo com cantos arredondados só em cima, só embaixo ou nos dois. */
function retangulo(ctx: Ctx, x: number, y: number, w: number, h: number, cor: string, cima = 0, baixo = 0) {
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(x + cima, y);
  ctx.lineTo(x + w - cima, y);
  ctx.arcTo(x + w, y, x + w, y + cima, cima);
  ctx.lineTo(x + w, y + h - baixo);
  ctx.arcTo(x + w, y + h, x + w - baixo, y + h, baixo);
  ctx.lineTo(x + baixo, y + h);
  ctx.arcTo(x, y + h, x, y + h - baixo, baixo);
  ctx.lineTo(x, y + cima);
  ctx.arcTo(x, y, x + cima, y, cima);
  ctx.closePath();
  ctx.fill();
}

function texto(ctx: Ctx, t: string, x: number, y: number, tam: number, cor: string, opcoes: { negrito?: boolean; alinhar?: CanvasTextAlign } = {}) {
  ctx.font = fonte(tam, opcoes.negrito);
  ctx.fillStyle = cor;
  ctx.textAlign = opcoes.alinhar ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, x, y);
}

/** Desenha tudo a partir do topo; devolve a altura usada. */
function desenhar(ctx: Ctx, c: ConteudoOrcamento, logo: HTMLImageElement | null): number {
  const largura = W - 2 * M;
  let y = 56;

  // Topo: logo à esquerda, título à direita, barra escura.
  const LOGO_H = 180;
  if (logo) ctx.drawImage(logo, M, y, (LOGO_H * logo.naturalWidth) / logo.naturalHeight, LOGO_H);
  espacamento(ctx, 5);
  texto(ctx, 'ORÇAMENTO', W - M, y + 92, 64, C.texto, { negrito: true, alinhar: 'right' });
  espacamento(ctx, 0);
  texto(ctx, c.titulo, W - M, y + 146, 34, C.suave, { alinhar: 'right' });
  y += LOGO_H + 22;
  retangulo(ctx, M, y, largura, 6, C.escuro);
  y += 6 + 32;

  // Cliente e contato.
  ctx.font = fonte(42, true);
  const campos = [
    { rotulo: 'CLIENTE', linhas: quebrar(ctx, c.cliente, largura - 2 * PAD) },
    ...(c.contato ? [{ rotulo: 'CONTATO', linhas: quebrar(ctx, c.contato, largura - 2 * PAD) }] : []),
  ];
  const alturaCampo = (n: number) => 32 + n * 52;
  const alturaCliente = 2 * 26 + campos.reduce((s, f) => s + alturaCampo(f.linhas.length), 0) + (campos.length - 1) * 18;
  retangulo(ctx, M, y, largura, alturaCliente, C.cliente, RAIO, RAIO);
  let yc = y + 26;
  for (const f of campos) {
    espacamento(ctx, 2);
    texto(ctx, f.rotulo, M + PAD, yc + 24, 24, C.rotulo);
    espacamento(ctx, 0);
    f.linhas.forEach((l, k) => texto(ctx, l, M + PAD, yc + 32 + 42 + k * 52, 42, C.texto, { negrito: true }));
    yc += alturaCampo(f.linhas.length) + 18;
  }
  y += alturaCliente + 32;

  // Tabela: cabeçalho, camisas, total.
  const xValor = W - M - PAD;
  const largDesc = largura - 2 * PAD - COL_VALOR - 24;
  retangulo(ctx, M, y, largura, 88, C.escuro, RAIO, 0);
  texto(ctx, 'Serviços', M + PAD, y + 58, 40, '#fff', { negrito: true });
  texto(ctx, 'Valor', xValor, y + 58, 40, '#fff', { negrito: true, alinhar: 'right' });
  y += 88;

  for (const camisa of c.camisas) {
    ctx.font = fonte(38, true);
    const nome = quebrar(ctx, camisa.nome, largura - 2 * PAD);
    const altNome = 2 * 22 + nome.length * 48;
    retangulo(ctx, M, y, largura, altNome, C.camisa);
    nome.forEach((l, k) => texto(ctx, l, M + PAD, y + 22 + 38 + k * 48, 38, '#fff', { negrito: true }));
    y += altNome;

    camisa.linhas.forEach((ln, k) => {
      ctx.font = fonte(34, true);
      const desc = quebrar(ctx, ln.descricao, largDesc);
      const altValor = ln.unitario ? 34 + 44 : 44;
      const alt = 2 * 22 + Math.max(desc.length * 44, altValor);
      retangulo(ctx, M, y, largura, alt, k % 2 === 0 ? C.linhaA : C.linhaB);
      desc.forEach((l, i) => texto(ctx, l, M + PAD, y + 22 + 35 + i * 44, 34, C.texto, { negrito: true }));
      let yv = y + 22;
      if (ln.unitario) {
        texto(ctx, ln.unitario, xValor, yv + 26, 26, '#666', { alinhar: 'right' });
        yv += 34;
      }
      texto(ctx, ln.valor, xValor, yv + 35, 34, C.texto, { negrito: true, alinhar: 'right' });
      y += alt;
    });

    if (camisa.subtotal) {
      retangulo(ctx, M, y, largura, 70, C.subtotal);
      texto(ctx, 'Valor desta camisa', xValor - COL_VALOR, y + 46, 30, '#333', { negrito: true, alinhar: 'right' });
      texto(ctx, camisa.subtotal, xValor, y + 46, 30, '#333', { negrito: true, alinhar: 'right' });
      y += 70;
    }
  }

  ctx.font = fonte(40, true);
  const rotTotal = quebrar(ctx, c.rotuloTotal, largDesc);
  const altTotal = 2 * 28 + rotTotal.length * 50;
  retangulo(ctx, M, y, largura, altTotal, C.escuro, 0, RAIO);
  rotTotal.forEach((l, k) => texto(ctx, l, M + PAD, y + 28 + 42 + k * 50, 40, '#fff', { negrito: true }));
  texto(ctx, c.total, xValor, y + 28 + 42, 44, '#fff', { negrito: true, alinhar: 'right' });
  y += altTotal + 32;

  // Observações.
  const TAM_OBS = 31;
  const LH_OBS = 44;
  const recuo = 36;
  const obs = OBSERVACOES_ORCAMENTO.map((x) =>
    quebrarRico(ctx, [{ texto: x.texto, negrito: x.forte }, ...(x.destaque ? [{ texto: x.destaque, negrito: true }] : [])], TAM_OBS, largura - 2 * PAD - recuo),
  );
  const altObs = 2 * 30 + obs.reduce((s, l) => s + l.length * LH_OBS, 0) + (obs.length - 1) * 10;
  retangulo(ctx, M, y, largura, altObs, C.escuro, RAIO, RAIO);
  let yo = y + 30;
  for (const item of obs) {
    texto(ctx, '•', M + PAD, yo + 33, TAM_OBS, '#fff', { negrito: true });
    for (const linha of item) {
      for (const p of linha) texto(ctx, p.texto, M + PAD + recuo + p.x, yo + 33, TAM_OBS, '#fff', { negrito: p.negrito });
      yo += LH_OBS;
    }
    yo += 10;
  }
  y += altObs + 44;

  texto(ctx, RODAPE_ORCAMENTO, W / 2, y + 4, 26, C.rodape, { alinhar: 'center' });
  return y + 4 + 44;
}

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // sem logo ainda gera a imagem
    img.src = src;
  });
}

/** Gera o PNG do orçamento (1080 px de largura). */
export async function desenharOrcamento(c: ConteudoOrcamento, logoSrc: string): Promise<Blob> {
  // Fontes do sistema, mas aguarda caso alguma ainda esteja carregando.
  await (document as any).fonts?.ready;
  const logo = await carregarImagem(logoSrc);

  // 1ª passada mede a altura; a 2ª desenha no tamanho certo.
  const medida = document.createElement('canvas');
  medida.width = W;
  medida.height = 1;
  const altura = Math.ceil(desenhar(medida.getContext('2d')!, c, logo));

  const escala = Math.min(1, Math.sqrt(AREA_MAXIMA / (W * altura)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(escala, escala);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, altura);
  desenhar(ctx, c, logo);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'),
  );
}
