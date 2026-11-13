// Conteúdo da imagem do orçamento (o que vai para o cliente), comum à web
// (desenho em canvas, orcamento-canvas.ts) e ao app (view capturada,
// components/orcamento-imagem.tsx).
import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { brlReais } from './dinheiro';

// Observações abaixo da tabela (mesmas da tabela de valores da loja).
export const OBSERVACOES_ORCAMENTO: { texto: string; destaque?: string; forte?: boolean }[] = [
  { texto: 'Nem sempre é possível a remoção de todas as manchas.', forte: true },
  { texto: 'Tempo médio para conclusão - ', destaque: '20 dias úteis' },
  { texto: 'Formas de pagamento: ', destaque: 'Pix e Cartão de Crédito - até 3x sem juros', forte: true },
];

// Cores da tabela de valores da marca (fixas: a imagem não segue o tema do app).
export const CORES_ORCAMENTO = {
  texto: '#1c1c1c',
  suave: '#555555',
  rotulo: '#777777',
  escuro: '#262626',
  camisa: '#4a4a4a',
  linhaA: '#ececec',
  linhaB: '#dedede',
  subtotal: '#f4f4f4',
  cliente: '#f1f1f1',
  rodape: '#888888',
} as const;

export const RODAPE_ORCAMENTO = 'Arquibancada Inferior feat Coruja Sports';

/** Largura da imagem em pixels (boa para abrir no WhatsApp). */
export const LARGURA_IMAGEM = 1080;

export const numeroOrcamento = (n: number) => String(n).padStart(4, '0');

export const nomeArquivoOrcamento = (o: Pick<Orcamento, 'numero'>) => `Orçamento ${numeroOrcamento(o.numero)}.png`;

export interface LinhaServico {
  descricao: string; // "2× Patch (frente) – escudo"
  valor: string; // total da linha
  unitario: string | null; // "R$ 30,00 cada" quando quantidade > 1
}
export interface ConteudoOrcamento {
  titulo: string; // "Nº 0012 · 13/11/2026"
  cliente: string;
  contato: string | null;
  camisas: { nome: string; linhas: LinhaServico[]; subtotal: string | null }[];
  rotuloTotal: string;
  total: string;
}

export function conteudoOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]): ConteudoOrcamento {
  const varias = pecas.length > 1;
  return {
    titulo: `Nº ${numeroOrcamento(o.numero)} · ${new Date(o.criado_em).toLocaleDateString('pt-BR')}`,
    cliente: o.cliente_nome,
    contato: o.contato?.trim() || null,
    camisas: pecas.map((pc) => ({
      nome: pc.nome,
      linhas: itens
        .filter((i) => i.peca_id === pc.id)
        .map((i) => ({
          descricao: i.quantidade > 1 ? `${i.quantidade}× ${i.descricao}` : i.descricao,
          valor: brlReais(Number(i.valor_unitario) * i.quantidade),
          unitario: i.quantidade > 1 ? `${brlReais(i.valor_unitario)} cada` : null,
        })),
      subtotal: varias ? brlReais(pc.subtotal) : null,
    })),
    rotuloTotal: varias ? `Valor total · ${pecas.length} camisas` : 'Valor total',
    total: brlReais(o.total),
  };
}

/** Imagem gerada: arquivo temporário no celular (`uri`) ou `File` na web. */
export interface ArquivoImagem {
  nome: string;
  uri?: string;
  arquivo?: File;
}
