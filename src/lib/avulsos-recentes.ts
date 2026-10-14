// Últimos itens avulsos vendidos neste aparelho (ex.: isqueiros), para
// preencher com um toque. Fica só no aparelho; se o armazenamento falhar,
// a venda funciona normalmente sem a lista.
import { armazenamento } from './armazenamento';
import type { Pertence } from './tipos';

export interface AvulsoRecente {
  descricao: string;
  valor: string; // valor unitário como digitado ("15,00")
  pertence: Pertence;
}

const CHAVE = 'avulsos-recentes';
const MAX = 6;

export function lerRecentes(): AvulsoRecente[] {
  try {
    const bruto = armazenamento?.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function guardarRecentes(itens: AvulsoRecente[]) {
  try {
    const atual = lerRecentes();
    const chave = (a: AvulsoRecente) => `${a.descricao.trim().toLowerCase()}|${a.pertence}`;
    const novos = [...itens, ...atual].filter((a, i, l) => l.findIndex((b) => chave(b) === chave(a)) === i).slice(0, MAX);
    armazenamento?.setItem(CHAVE, JSON.stringify(novos));
  } catch {
    // sem lista de recentes
  }
}
