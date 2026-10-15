// Acesso a dados. Toda regra de negócio crítica (venda, reserva, códigos)
// roda no banco via RPC; aqui ficam consultas e chamadas finas.
import { supabase } from './supabase';
import type { Canal, Consignante, FormaPagamento, Movimentacao, Perfil, Produto, Status, Taxa } from './tipos';

function ok<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Normaliza o código digitado: "m 1386" → "M1386". */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface FiltrosEstoque {
  busca?: string;
  status?: Status | null;
  prefixo?: string | null;
  tamanho?: string | null;
  tipo?: string | null;
  condicao?: string | null;
  pertence?: string | null;
  site?: 'sim' | 'nao' | 'nv' | null;
}

const POR_PAGINA = 50;

function aplicarFiltros(q: any, f: FiltrosEstoque) {
  q = q.eq('arquivado', false);
  const busca = (f.busca ?? '').replace(/[,()%*\\]/g, ' ').trim();
  if (busca) {
    const cod = normalizarCodigo(busca);
    q = cod.length >= 2 && /^[A-Z]{1,3}\d+$/.test(cod)
      ? q.or(`codigo.ilike.${cod}%,descricao.ilike.%${busca}%`)
      : q.ilike('descricao', `%${busca}%`);
  }
  if (f.status) q = q.eq('status', f.status);
  if (f.prefixo) q = q.eq('prefixo', f.prefixo);
  if (f.tamanho) q = q.eq('tamanho', f.tamanho);
  if (f.tipo) q = q.eq('tipo', f.tipo);
  if (f.condicao) q = q.eq('condicao', f.condicao);
  if (f.pertence) q = q.eq('pertence', f.pertence);
  if (f.site === 'sim') q = q.eq('cadastrado_site', true);
  if (f.site === 'nao') q = q.eq('cadastrado_site', false);
  if (f.site === 'nv') q = q.is('cadastrado_site', null);
  return q;
}

export interface GrupoProduto {
  grupo: string;
  descricao: string;
  foto_path: string | null;
  unidades: number;
  disponiveis: number;
  preco_min: number;
  preco_max: number;
  tamanhos: { tamanho: string | null; unidades: number; disponiveis: number }[];
  codigos: string[];
  status_unico: Status | null;
  produto_unico: string | null;
  total: number;
}

/** Produtos de mesma descrição agrupados (um item com vários tamanhos). */
export async function listarGrupos(f: FiltrosEstoque, pagina = 0) {
  const grupos = ok(await supabase.rpc('listar_grupos', {
    p_busca: f.busca?.trim() || null,
    p_status: f.status ?? null,
    p_prefixo: f.prefixo ?? null,
    p_tamanho: f.tamanho ?? null,
    p_tipo: f.tipo ?? null,
    p_condicao: f.condicao ?? null,
    p_pertence: f.pertence ?? null,
    p_site: f.site ?? null,
    p_limite: POR_PAGINA,
    p_offset: pagina * POR_PAGINA,
  })) as GrupoProduto[];
  return { grupos, total: Number(grupos[0]?.total ?? 0), temMais: grupos.length === POR_PAGINA };
}

export async function unidadesDoGrupo(grupo: string): Promise<Produto[]> {
  const r = ok(await supabase.from('produtos_lista').select('*').eq('grupo', grupo).eq('arquivado', false).order('prefixo').order('numero')) as Produto[];
  return r;
}

/** Busca todas as linhas filtradas (para exportação), em lotes de 1000. */
export async function todosProdutos(f: FiltrosEstoque): Promise<Produto[]> {
  const todos: Produto[] = [];
  for (let i = 0; ; i += 1000) {
    const r = await aplicarFiltros(supabase.from('produtos_lista').select('*'), f).order('prefixo').order('numero').range(i, i + 999);
    if (r.error) throw r.error;
    todos.push(...(r.data as Produto[]));
    if (r.data.length < 1000) return todos;
  }
}

/** Localiza a unidade exata pelo código da etiqueta (aceita "SA1" para "SA01"). */
export async function buscarPorCodigo(texto: string): Promise<Produto | null> {
  const cod = normalizarCodigo(texto);
  if (!cod) return null;
  const exato = ok(await supabase.from('produtos_lista').select('*').eq('codigo', cod).limit(1));
  if (exato.length) return exato[0] as Produto;
  const m = cod.match(/^([A-Z]{1,3})0*(\d+)$/);
  if (!m) return null;
  const alt = ok(await supabase.from('produtos_lista').select('*').eq('prefixo', m[1]).eq('numero', Number(m[2])).limit(2));
  return alt.length === 1 ? (alt[0] as Produto) : null;
}

export async function obterProduto(id: string): Promise<Produto> {
  return ok(await supabase.from('produtos_lista').select('*').eq('id', id).single()) as Produto;
}

export async function historicoProduto(id: string): Promise<(Movimentacao & { usuario?: string })[]> {
  const movs = ok(await supabase.from('movimentacoes').select('*').eq('produto_id', id).order('criado_em', { ascending: false }).limit(200)) as Movimentacao[];
  const ids = [...new Set(movs.map((m) => m.usuario_id).filter(Boolean))] as string[];
  const nomes = ids.length ? (ok(await supabase.from('perfis').select('id, nome').in('id', ids)) as { id: string; nome: string }[]) : [];
  const mapa = new Map(nomes.map((n) => [n.id, n.nome]));
  return movs.map((m) => ({ ...m, usuario: m.usuario_id ? mapa.get(m.usuario_id) : undefined }));
}

export type DadosProduto = Partial<Omit<Produto, 'id' | 'codigo' | 'status' | 'lucro_estimado'>>;

/** `codigos[i]` vazio = o banco gera o próximo código automaticamente. */
export async function criarProdutos(dados: DadosProduto & { prefixo: string }, tamanhos: string[], codigos: string[]): Promise<Produto[]> {
  return ok(await supabase.rpc('criar_produtos', { p_dados: dados, p_tamanhos: tamanhos, p_codigos: codigos })) as Produto[];
}

export interface ModeloSugerido {
  descricao: string;
  unidades: number;
  disponiveis: number;
  tamanhos: string[];
  produto_base: string;
}
/** Modelos já cadastrados com descrição parecida (autocomplete do cadastro). */
export async function sugerirModelos(busca: string): Promise<ModeloSugerido[]> {
  return ok(await supabase.rpc('sugerir_modelos', { p_busca: busca, p_limite: 6 })) as ModeloSugerido[];
}

/** Próximos códigos livres da categoria (não reserva). */
export async function sugerirCodigos(prefixo: string, quantidade: number): Promise<string[]> {
  return ok(await supabase.rpc('sugerir_codigos', { p_prefixo: prefixo, p_quantidade: quantidade })) as string[];
}

export async function verificarCodigo(codigo: string, prefixo: string): Promise<{ disponivel: boolean; codigo?: string; motivo?: string }> {
  return ok(await supabase.rpc('verificar_codigo', { p_codigo: codigo, p_prefixo: prefixo })) as any;
}

export async function atualizarProduto(id: string, dados: DadosProduto) {
  ok(await supabase.from('produtos').update(dados).eq('id', id));
}

export async function atualizarFotoEmLote(ids: string[], foto_path: string) {
  ok(await supabase.from('produtos').update({ foto_path }).in('id', ids));
}

// --- Reservas -----------------------------------------------------------
export async function reservar(produtoId: string, tipo: 'reserva' | 'emprestimo', cliente: string, obs: string, previsao: string | null) {
  return ok(await supabase.rpc('reservar_produto', {
    p_produto: produtoId, p_tipo: tipo, p_cliente: cliente, p_observacoes: obs, p_previsao: previsao,
  })) as string;
}
export async function encerrarReserva(reservaId: string, obs: string) {
  ok(await supabase.rpc('encerrar_reserva', { p_reserva: reservaId, p_observacoes: obs }));
}
export async function listarReservasAtivas() {
  return ok(await supabase.from('reservas').select('*, produto:produtos(id, codigo, descricao, tamanho, foto_path, preco_venda, status)')
    .is('encerrada_em', null).order('inicio', { ascending: false })) as any[];
}

// --- Vendas -------------------------------------------------------------
/** Produto do estoque, ou item avulso (sem cadastro, ex.: isqueiro).
 *  valor_bruto é o total do item em reais (quantidade × unitário). */
export type ItemVenda =
  | { produto_id: string; valor_bruto: number }
  | { descricao: string; quantidade: number; valor_bruto: number; pertence: string; consignante_id: string | null };
export async function registrarVenda(p: {
  chave: string;
  itens: ItemVenda[];
  forma: FormaPagamento;
  data: string | null;
  cliente: string;
  observacoes: string;
  pendente: boolean;
  origem: 'venda' | 'baixa_rapida' | 'avulsa';
  canal: Canal;
}): Promise<string> {
  return ok(await supabase.rpc('registrar_venda', {
    p_chave: p.chave,
    p_itens: p.itens,
    p_forma: p.forma,
    p_data: p.data,
    p_cliente: p.cliente,
    p_observacoes: p.observacoes,
    p_pagamento_pendente: p.pendente,
    p_origem: p.origem,
    p_canal: p.canal,
  })) as string;
}

export async function obterVenda(id: string) {
  const venda = ok(await supabase.from('vendas').select('*').eq('id', id).single()) as any;
  const [itens, pagamentos, lancamentos] = await Promise.all([
    supabase.from('venda_itens').select('*, produto:produtos(id, codigo, descricao, tamanho, foto_path)').eq('venda_id', id),
    supabase.from('pagamentos_situacao').select('*').eq('venda_id', id).order('parcela'),
    supabase.from('lancamentos').select('*, consignante:consignantes(nome)').eq('venda_id', id),
  ]);
  return { venda, itens: ok(itens) as any[], pagamentos: ok(pagamentos) as any[], lancamentos: ok(lancamentos) as any[] };
}

export async function listarVendas(inicio: string, fim: string) {
  return ok(await supabase.from('vendas')
    .select('*, itens:venda_itens(descricao, quantidade, produto:produtos(codigo, descricao, tamanho))')
    .gte('data_venda', inicio).lte('data_venda', fim)
    .order('data_venda', { ascending: false }).order('criado_em', { ascending: false }).limit(500)) as any[];
}

export async function cancelarVenda(id: string, motivo: string) {
  ok(await supabase.rpc('cancelar_venda', { p_venda: id, p_motivo: motivo }));
}

export async function pagamentosPendentes() {
  return ok(await supabase.from('pagamentos_situacao').select('*').eq('recebido', false).order('vencimento')) as any[];
}
export async function marcarPagamento(id: string, recebido: boolean, data: string | null) {
  ok(await supabase.rpc('marcar_pagamento', { p_pagamento: id, p_recebido: recebido, p_data: data }));
}

// --- Site -----------------------------------------------------------------
export interface AlertaSite {
  id: string;
  produto_id: string;
  venda_id: string | null;
  status: 'pendente' | 'adiado';
  adiado_ate: string | null;
  criado_em: string;
  produto: Pick<Produto, 'id' | 'codigo' | 'descricao' | 'tamanho' | 'foto_path'>;
}
export async function alertasSiteAbertos(): Promise<AlertaSite[]> {
  return ok(await supabase.from('alertas_site').select('*, produto:produtos(id, codigo, descricao, tamanho, foto_path)')
    .in('status', ['pendente', 'adiado']).order('criado_em', { ascending: false })) as AlertaSite[];
}
export async function resolverAlerta(id: string, acao: 'removido' | 'adiar' | 'pendente', horas = 24) {
  ok(await supabase.rpc('resolver_alerta_site', { p_alerta: id, p_acao: acao, p_adiar_horas: horas }));
}

// --- Configurações ----------------------------------------------------------
export async function listarTaxas(): Promise<Taxa[]> {
  return (ok(await supabase.from('taxas').select('*').order('ordem')) as Taxa[]).map((t) => ({ ...t, percentual: Number(t.percentual) }));
}
export async function atualizarTaxa(canal: Canal, forma: FormaPagamento, percentual: number) {
  ok(await supabase.rpc('atualizar_taxa', { p_canal: canal, p_forma: forma, p_percentual: percentual }));
}
/** Recebimento das vendas pelo site (só canais dos sites). */
export async function definirLiquidacaoTaxa(canal: Canal, forma: FormaPagamento, liquidacao: 'imediata' | 'proximo_dia_util') {
  ok(await supabase.rpc('definir_liquidacao_taxa', { p_canal: canal, p_forma: forma, p_liquidacao: liquidacao }));
}
export async function listarConsignantes(): Promise<Consignante[]> {
  return ok(await supabase.from('consignantes').select('*').order('nome')) as Consignante[];
}
export async function salvarConsignante(c: Partial<Consignante>) {
  const { id, ...dados } = c;
  if (id) ok(await supabase.from('consignantes').update(dados).eq('id', id));
  else ok(await supabase.from('consignantes').insert(dados));
}
export async function listarUsuarios(): Promise<Perfil[]> {
  return ok(await supabase.from('perfis').select('*').order('criado_em')) as Perfil[];
}
export async function definirUsuario(id: string, papel: 'admin' | 'vendedor', ativo: boolean) {
  ok(await supabase.rpc('definir_usuario', { p_usuario: id, p_papel: papel, p_ativo: ativo }));
}

// --- Categorias -------------------------------------------------------------
export interface Categoria {
  prefixo: string;
  descricao: string;
  arquivada: boolean;
  proximo: number;
  digitos: number;
  produtos: number;
  disponiveis: number;
}
export async function listarCategorias(): Promise<Categoria[]> {
  return ok(await supabase.from('categorias_resumo').select('*').order('descricao')) as Categoria[];
}
export async function criarCategoria(descricao: string, prefixo: string) {
  ok(await supabase.rpc('criar_categoria', { p_descricao: descricao, p_prefixo: prefixo }));
}
export async function renomearCategoria(prefixo: string, descricao: string) {
  ok(await supabase.rpc('renomear_categoria', { p_prefixo: prefixo, p_descricao: descricao }));
}
export async function arquivarCategoria(prefixo: string, arquivar: boolean) {
  ok(await supabase.rpc('arquivar_categoria', { p_prefixo: prefixo, p_arquivar: arquivar }));
}
export async function excluirCategoria(prefixo: string) {
  ok(await supabase.rpc('excluir_categoria', { p_prefixo: prefixo }));
}

// --- Repasses à Arquibancada ------------------------------------------------
export interface RepassePendente {
  lancamento_id: string;
  venda_id: string;
  produto_id: string | null;
  codigo: string | null; // null = item avulso
  descricao: string;
  tamanho: string | null;
  valor_bruto: number;
  valor_liquido: number;
  tipo: 'venda' | 'estorno';
  data_ref: string;
  /** > 0: a Coruja deve à Arquibancada; < 0: a Arquibancada deve à Coruja (site dela). */
  valor: number;
  pertence: 'Coruja Sports' | 'Arquibancada Inferior' | 'Concessão' | 'Ambos';
  canal: Canal;
  /** De quem é a parte: arquibancada (loja/site Coruja) ou coruja (site Arquibancada). */
  beneficiario: 'coruja' | 'arquibancada' | 'consignante';
}
export async function repassesPendentes(): Promise<RepassePendente[]> {
  return ok(await supabase.from('repasse_pendente').select('*').order('data_ref', { ascending: false })) as RepassePendente[];
}
export async function totalRepassePendente(): Promise<number> {
  const linhas = ok(await supabase.from('repasse_pendente').select('valor')) as { valor: number }[];
  return linhas.reduce((s, l) => s + Math.round(Number(l.valor) * 100), 0) / 100;
}
export async function registrarRepasse(inicio: string, fim: string, pagoEm: string | null, obs: string) {
  return ok(await supabase.rpc('registrar_repasse', { p_inicio: inicio, p_fim: fim, p_pago_em: pagoEm, p_observacoes: obs })) as string;
}
export async function listarRepasses() {
  return ok(await supabase.from('repasses').select('*').order('pago_em', { ascending: false }).order('criado_em', { ascending: false }).limit(100)) as any[];
}
export async function desfazerRepasse(id: string) {
  ok(await supabase.rpc('desfazer_repasse', { p_repasse: id }));
}

// --- Painel -----------------------------------------------------------------
export async function resumoEstoque() {
  return ok(await supabase.rpc('resumo_estoque')) as Record<string, number>;
}
export async function resumoFinanceiro(inicio: string, fim: string, marca: string | null) {
  return ok(await supabase.rpc('resumo_financeiro', { p_inicio: inicio, p_fim: fim, p_marca: marca })) as any;
}

// --- Orçamentos ---------------------------------------------------------------
export type GrupoServico = 'frente' | 'verso' | 'outros';
export const GRUPOS_SERVICO: { grupo: GrupoServico; rotulo: string }[] = [
  { grupo: 'frente', rotulo: 'Frente' },
  { grupo: 'verso', rotulo: 'Verso' },
  { grupo: 'outros', rotulo: 'Mangas e outros' },
];

export interface Servico {
  id: string;
  nome: string;
  detalhe: string | null; // variação: "cor única", "colorido", "par"
  valor: number;
  a_partir_de: boolean;
  grupo: GrupoServico;
  ordem: number;
  ativo: boolean;
}
export interface StatusOrcamento {
  codigo: string;
  rotulo: string;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
}
export interface PecaOrcamento {
  id: string;
  nome: string;
  fotos: string[];
  subtotal: number;
  ordem: number;
}
export interface Orcamento {
  id: string;
  numero: number;
  cliente_nome: string;
  contato: string | null;
  observacoes: string | null;
  status: string;
  total: number;
  criado_em: string;
  atualizado_em: string;
  pecas?: Pick<PecaOrcamento, 'nome' | 'fotos' | 'ordem'>[];
}
export interface ItemOrcamento {
  id?: string;
  peca_id?: string | null;
  servico_id: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  total?: number;
}
export interface PecaParaSalvar {
  nome: string;
  fotos: string[];
  itens: ItemOrcamento[];
}

/** Nome na lista (dentro da seção Frente/Verso): "Master frontal – colorido". */
export const nomeServico = (s: Pick<Servico, 'nome' | 'detalhe'>) => (s.detalhe ? `${s.nome} – ${s.detalhe}` : s.nome);
/** Descrição gravada no orçamento/PDF, com a posição: "Master frontal – colorido (frente)". */
export const descricaoServico = (s: Pick<Servico, 'nome' | 'detalhe' | 'grupo'>) =>
  s.grupo === 'outros' ? nomeServico(s) : `${nomeServico(s)} (${s.grupo})`;

export async function listarServicos(): Promise<Servico[]> {
  return ok(await supabase.from('servicos').select('*').order('grupo').order('ordem')) as Servico[];
}
export async function salvarServico(s: Partial<Servico> & { nome: string; valor: number }) {
  return ok(await supabase.rpc('salvar_servico', {
    p_id: s.id ?? null, p_nome: s.nome, p_detalhe: s.detalhe ?? null, p_valor: s.valor,
    p_a_partir_de: s.a_partir_de ?? false, p_ativo: s.ativo ?? true, p_grupo: s.grupo ?? 'outros',
  })) as string;
}
export async function listarStatusOrcamento(): Promise<StatusOrcamento[]> {
  return ok(await supabase.from('orcamento_status').select('*').order('ordem')) as StatusOrcamento[];
}
export async function salvarStatusOrcamento(codigo: string | null, rotulo: string, ativo: boolean) {
  return ok(await supabase.rpc('salvar_status_orcamento', { p_codigo: codigo, p_rotulo: rotulo, p_ativo: ativo })) as string;
}
export async function listarOrcamentos(): Promise<Orcamento[]> {
  return ok(await supabase.from('orcamentos').select('*, pecas:orcamento_pecas(nome, fotos, ordem)')
    .order('criado_em', { ascending: false }).limit(500)) as Orcamento[];
}
export async function obterOrcamento(id: string) {
  const [o, pecas, itens, historico] = await Promise.all([
    supabase.from('orcamentos').select('*').eq('id', id).single(),
    supabase.from('orcamento_pecas').select('*').eq('orcamento_id', id).order('ordem'),
    supabase.from('orcamento_itens').select('*').eq('orcamento_id', id).order('ordem'),
    supabase.from('orcamento_historico').select('*').eq('orcamento_id', id).order('criado_em', { ascending: false }),
  ]);
  return {
    orcamento: ok(o) as Orcamento,
    pecas: ok(pecas) as PecaOrcamento[],
    itens: ok(itens) as ItemOrcamento[],
    historico: ok(historico) as any[],
  };
}
export async function salvarOrcamento(id: string | null, dados: { cliente_nome: string; contato: string; observacoes: string }, pecas: PecaParaSalvar[]) {
  return ok(await supabase.rpc('salvar_orcamento', { p_id: id, p_dados: dados, p_pecas: pecas })) as string;
}
export async function alterarStatusOrcamento(id: string, status: string) {
  ok(await supabase.rpc('alterar_status_orcamento', { p_id: id, p_status: status }));
}
