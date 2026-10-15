import type { Canal } from './dinheiro';

export type Status = 'Disponível' | 'Vendida' | 'Reservada' | 'Emprestada';
export type Tipo = 'Réplica' | 'Original' | 'Própria';
export type Condicao = 'Nova' | 'Usada';
export type Pertence = 'Coruja Sports' | 'Arquibancada Inferior' | 'Concessão' | 'Ambos';
export type FormaPagamento =
  | 'pix' | 'debito' | 'credito_1x' | 'credito_2x' | 'credito_3x'
  | 'site_coruja' | 'site_arquibancada' // legado (taxa única por site, migration 15); hoje o site é o canal
  | 'outro';
export type { Canal };
export type Papel = 'admin' | 'vendedor';

export const STATUS: Status[] = ['Disponível', 'Vendida', 'Reservada', 'Emprestada'];
export const TIPOS: Tipo[] = ['Réplica', 'Original', 'Própria'];
export const CONDICOES: Condicao[] = ['Nova', 'Usada'];
export const PERTENCE: Pertence[] = ['Coruja Sports', 'Arquibancada Inferior', 'Ambos', 'Concessão'];
export const FORMAS_VENDA: FormaPagamento[] = ['pix', 'debito', 'credito_1x', 'credito_2x', 'credito_3x'];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  debito: 'Débito',
  credito_1x: 'Crédito 1x',
  credito_2x: 'Crédito 2x',
  credito_3x: 'Crédito 3x',
  site_coruja: 'Site Coruja',
  site_arquibancada: 'Site Arquibancada',
  outro: 'Outro',
};

/** Canal da venda. A taxa vem da combinação canal + forma. */
export const CANAIS = ['loja', 'site_coruja', 'site_arquibancada'] as const;
export const ROTULO_CANAL: Record<(typeof CANAIS)[number], string> = {
  loja: 'Loja',
  site_coruja: 'Site Coruja',
  site_arquibancada: 'Site Arquibancada',
};

export const TAMANHOS_ADULTO = ['PP', 'P', 'M', 'G', 'GG', '2GG', '3GG', '4GG'];
export const TAMANHOS_INFANTIL = ['9', '12', '16', '18', '20', '22', '24', '26', '28'];

export interface Produto {
  id: string;
  codigo: string;
  prefixo: string;
  descricao: string;
  tamanho: string | null;
  cor: string | null;
  tipo: Tipo | null;
  condicao: Condicao | null;
  pertence: Pertence;
  consignante_id: string | null;
  acordo_tipo: 'percentual' | 'fixo' | null;
  acordo_valor: number | null;
  custo: number | null;
  preco_venda: number;
  lucro_estimado: number;
  status: Status;
  cadastrado_site: boolean | null;
  foto_path: string | null;
  observacoes: string | null;
  codigo_original: string | null;
  dados_origem: Record<string, unknown> | null;
  arquivado: boolean;
  criado_em: string;
  atualizado_em: string;
  // Campos da view produtos_lista
  categoria?: string;
  consignante_nome?: string | null;
  venda_id?: string | null;
  data_venda?: string | null;
  forma_venda?: FormaPagamento | null;
  valor_vendido?: number | null;
  taxa_venda_percentual?: number | null;
  taxa_venda_valor?: number | null;
  reserva_id?: string | null;
  reserva_tipo?: 'reserva' | 'emprestimo' | null;
  reserva_cliente?: string | null;
  reserva_previsao?: string | null;
  numero?: number | null;
  grupo?: string;
}

export interface Taxa {
  canal: Canal;
  forma: FormaPagamento;
  rotulo: string;
  percentual: number;
  parcelas: number;
  liquidacao: 'imediata' | 'proximo_dia_util' | 'mensal';
  ordem: number;
}

export interface Consignante {
  id: string;
  nome: string;
  contato: string | null;
  tipo_acordo: 'percentual' | 'fixo';
  valor_acordo: number;
  marca_restante: 'coruja' | 'arquibancada' | 'ambos';
  observacoes: string | null;
}

export interface Perfil {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Movimentacao {
  id: number;
  produto_id: string;
  tipo: string;
  status_anterior: Status | null;
  status_novo: Status | null;
  detalhes: Record<string, any> | null;
  observacoes: string | null;
  usuario_id: string | null;
  criado_em: string;
}

export const ROTULO_MOVIMENTACAO: Record<string, string> = {
  cadastro: 'Cadastro',
  edicao: 'Edição',
  importacao: 'Importado da planilha',
  reserva: 'Reservado',
  cancelamento_reserva: 'Reserva cancelada',
  emprestimo: 'Emprestado',
  devolucao: 'Devolvido',
  venda: 'Vendido',
  cancelamento_venda: 'Venda cancelada',
  site_removido: 'Removido do site',
  site_adiado: 'Lembrete do site adiado',
  site_pendente: 'Lembrete do site pendente',
};

export const ROTULO_CAMPO: Record<string, string> = {
  descricao: 'Descrição',
  tamanho: 'Tamanho',
  cor: 'Cor',
  tipo: 'Tipo',
  condicao: 'Condição',
  pertence: 'Pertence',
  consignante_id: 'Consignante',
  acordo_tipo: 'Tipo de acordo',
  acordo_valor: 'Valor do acordo',
  custo: 'Custo',
  preco_venda: 'Preço de venda',
  cadastrado_site: 'Cadastrado no site',
  foto_path: 'Foto',
  observacoes: 'Observações',
  arquivado: 'Arquivado',
};

export const ROTULO_MARCA: Record<string, string> = {
  coruja: 'Coruja Sports',
  arquibancada: 'Arquibancada Inferior',
  ambos: 'Ambos (50/50)',
  consignante: 'Proprietários (concessão)',
};

export function rotuloSite(v: boolean | null | undefined) {
  return v === true ? 'Sim' : v === false ? 'Não' : 'Não verificado';
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
export function hojeISO(): string {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
