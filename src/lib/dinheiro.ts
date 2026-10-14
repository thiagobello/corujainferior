// Cálculos monetários em centavos inteiros, espelhando as regras do banco
// (numeric(12,2) com round meio-para-longe-do-zero). O banco é a fonte de
// verdade; estas funções servem para a prévia na tela bater com o gravado.

export type Centavos = number;

export function paraCentavos(valor: number | string | null | undefined): Centavos | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const paraReais = (c: Centavos) => c / 100;

/** Converte texto digitado ("189,90", "R$ 1.234,5", "44.4") em centavos. */
export function lerValor(texto: string | number | null | undefined): Centavos | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return paraCentavos(texto);
  let s = texto.replace(/R\$|\s/gi, '').trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return paraCentavos(Number(s));
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function brl(c: Centavos | null | undefined): string {
  if (c === null || c === undefined) return '—';
  return fmt.format(c / 100);
}
/** Formata um valor em reais vindo do banco (numeric). */
export const brlReais = (v: number | string | null | undefined) => brl(paraCentavos(v));

export function centavosParaTexto(c: Centavos | null | undefined): string {
  if (c === null || c === undefined) return '';
  return (c / 100).toFixed(2).replace('.', ',');
}

/** Percentual com até 4 casas, em inteiro escalado por 10.000 (5,99% → 59900). */
function pctEscalado(pct: number): number {
  return Math.round(pct * 10000);
}

/** taxa = round(bruto × pct / 100, 2) */
export function calcularTaxa(bruto: Centavos, pct: number): Centavos {
  const q = bruto * pctEscalado(pct); // centavos × pct × 10⁴
  const sinal = q < 0 ? -1 : 1;
  return sinal * Math.floor((Math.abs(q) + 500_000) / 1_000_000);
}

export interface CalculoVenda {
  bruto: Centavos;
  desconto: Centavos;
  descontoPct: number | null;
  taxa: Centavos;
  liquido: Centavos;
  lucroBruto: Centavos;
  resultado: Centavos;
  custoInformado: boolean;
}

export function calcularVenda(p: {
  precoPadrao: Centavos;
  valorBruto: Centavos;
  custo: Centavos | null;
  taxaPercentual: number;
}): CalculoVenda {
  const taxa = calcularTaxa(p.valorBruto, p.taxaPercentual);
  const custo = p.custo ?? 0;
  const desconto = p.precoPadrao - p.valorBruto;
  return {
    bruto: p.valorBruto,
    desconto,
    descontoPct: p.precoPadrao > 0 ? (desconto / p.precoPadrao) * 100 : null,
    taxa,
    liquido: p.valorBruto - taxa,
    lucroBruto: p.valorBruto - custo,
    resultado: p.valorBruto - custo - taxa,
    custoInformado: p.custo !== null,
  };
}

export type Pertence = 'Coruja Sports' | 'Arquibancada Inferior' | 'Concessão' | 'Ambos';
export interface Divisao {
  coruja: Centavos;
  arquibancada: Centavos;
  consignante: Centavos;
}

function marca(valor: Centavos, alvo: 'coruja' | 'arquibancada' | 'ambos'): Divisao {
  if (alvo === 'ambos') {
    const arq = Math.trunc(valor / 2); // centavo residual fica com a Coruja
    return { coruja: valor - arq, arquibancada: arq, consignante: 0 };
  }
  return { coruja: alvo === 'coruja' ? valor : 0, arquibancada: alvo === 'arquibancada' ? valor : 0, consignante: 0 };
}

/** Divisão do valor líquido entre marcas — mesma regra de _dividir_item no banco. */
export function dividirLiquido(
  liquido: Centavos,
  pertence: Pertence,
  acordo?: { tipo: 'percentual' | 'fixo'; valor: number; marcaRestante: 'coruja' | 'arquibancada' | 'ambos' } | null,
): Divisao {
  switch (pertence) {
    case 'Coruja Sports':
      return marca(liquido, 'coruja');
    case 'Arquibancada Inferior':
      return marca(liquido, 'arquibancada');
    case 'Ambos':
      return marca(liquido, 'ambos');
    case 'Concessão': {
      if (!acordo) return { coruja: 0, arquibancada: 0, consignante: liquido };
      const devido =
        acordo.tipo === 'percentual' ? calcularTaxa(liquido, acordo.valor) : (paraCentavos(acordo.valor) ?? 0);
      const resto = marca(liquido - devido, acordo.marcaRestante);
      return { ...resto, consignante: devido };
    }
  }
}
