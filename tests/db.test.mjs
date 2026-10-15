// Testes das regras do banco num Postgres embutido (PGlite).
// Executar: node --test tests/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../supabase/migrations/', import.meta.url);
let db;
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const VEND = '00000000-0000-0000-0000-00000000000b';

// Simula o ambiente do Supabase: schema auth, auth.uid() e papéis.
const STUB = `
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

async function como(uid) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const num = (v) => Number(v);

async function produto(dados, tamanhos = ['M']) {
  const base = { prefixo: 'M', descricao: 'Camisa Teste', pertence: 'Coruja Sports', preco_venda: 100, custo: 40, tipo: 'Réplica', condicao: 'Nova' };
  const r = await db.query(`select * from criar_produtos($1, $2)`, [{ ...base, ...dados }, tamanhos]);
  return r.rows;
}
async function vender(itens, forma = 'pix', extra = {}) {
  const chave = extra.chave ?? randomUUID();
  const r = await um(`select registrar_venda($1, $2, $3, $4, null, null, $5, 'venda', $6) as id`,
    [chave, JSON.stringify(itens), forma, extra.data ?? null, extra.pendente ?? false, extra.canal ?? 'loja']);
  return r.id;
}
const lanc = async (venda) =>
  Object.fromEntries((await db.query(
    `select beneficiario, sum(valor) v from lancamentos where venda_id = $1 and ativo group by 1`, [venda])).rows
    .map((r) => [r.beneficiario, num(r.v)]));

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const f of readdirSync(dir).sort()) {
    if (f.includes('storage')) continue;
    await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@x.com'), ($2, 'vend@x.com')`, [ADMIN, VEND]);
  await como(ADMIN);
  await db.query(`select atualizar_taxa('pix', 0)`);
  await db.query(`select atualizar_taxa('debito', 1.99)`);
  await db.query(`select atualizar_taxa('credito_1x', 3.49)`);
  await db.query(`select atualizar_taxa('credito_2x', 4.99)`);
  await db.query(`select atualizar_taxa('credito_3x', 5.99)`);
});

test('primeiro usuário vira admin, demais vendedor', async () => {
  const r = (await db.query(`select id, papel from perfis order by email`)).rows;
  assert.equal(r[0].papel, 'admin');
  assert.equal(r[1].papel, 'vendedor');
});

test('cadastro em lote gera um código por tamanho, sem repetir', async () => {
  const ps = await produto({ descricao: 'Brasil Home 2022', foto_path: 'x.jpg' }, ['P', 'M', 'G']);
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map((p) => p.tamanho), ['P', 'M', 'G']);
  assert.equal(new Set(ps.map((p) => p.codigo)).size, 3);
  assert.ok(ps.every((p) => /^M\d{3}$/.test(p.codigo) && p.foto_path === 'x.jpg'));
  const hist = await um(`select count(*) n from movimentacoes where produto_id = $1 and tipo = 'cadastro'`, [ps[0].id]);
  assert.equal(num(hist.n), 1);
});

test('status e código não podem ser alterados diretamente', async () => {
  const [p] = await produto({});
  await assert.rejects(db.query(`update produtos set status = 'Vendida' where id = $1`, [p.id]), /status/);
  await assert.rejects(db.query(`update produtos set codigo = 'M999' where id = $1`, [p.id]), /código/);
  await db.query(`update produtos set preco_venda = 120 where id = $1`, [p.id]);
  const h = await um(`select detalhes from movimentacoes where produto_id = $1 and tipo = 'edicao'`, [p.id]);
  assert.equal(num(h.detalhes.preco_venda.para), 120);
});

test('venda com desconto e taxa absorvida pela loja (crédito 3x)', async () => {
  const [p] = await produto({ preco_venda: 189.9, custo: 70 });
  const v = await vender([{ produto_id: p.id, valor_bruto: 170 }], 'credito_3x');
  const it = await um(`select * from venda_itens where venda_id = $1`, [v]);
  assert.equal(num(it.preco_padrao), 189.9);
  assert.equal(num(it.desconto), 19.9);
  assert.equal(num(it.taxa_percentual), 5.99);
  assert.equal(num(it.taxa_valor), 10.18); // 170 × 5,99% = 10,183
  assert.equal(num(it.valor_liquido), 159.82);
  assert.equal(num(it.lucro_bruto), 100);
  assert.equal(num(it.resultado), 89.82);
  // Preço padrão do produto não muda.
  assert.equal(num((await um(`select preco_venda from produtos where id = $1`, [p.id])).preco_venda), 189.9);
  // Crédito parcelado cai de uma vez no próximo dia útil: um único recebimento.
  const pg = (await db.query(`select * from pagamentos where venda_id = $1 order by parcela`, [v])).rows;
  assert.equal(pg.length, 1);
  assert.deepEqual([num(pg[0].valor_bruto), num(pg[0].valor_liquido)], [170, 159.82]);
  assert.equal(pg[0].liquidacao, 'automatica');
  const hojeDb = (await um(`select (now() at time zone 'America/Sao_Paulo')::date d`)).d;
  assert.equal(
    new Date(pg[0].vencimento).toISOString().slice(0, 10),
    (await um(`select proximo_dia_util($1::date) d`, [hojeDb])).d.toISOString().slice(0, 10),
  );
  assert.deepEqual(await lanc(v), { coruja: 159.82 });
});

test('alterar taxa depois não muda vendas antigas', async () => {
  const [p] = await produto({});
  const v = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'debito');
  await db.query(`select atualizar_taxa('debito', 2.5)`);
  const it = await um(`select taxa_percentual, taxa_valor from venda_itens where venda_id = $1`, [v]);
  assert.equal(num(it.taxa_percentual), 1.99);
  assert.equal(num(it.taxa_valor), 1.99);
  await db.query(`select atualizar_taxa('debito', 1.99)`);
});

test('produto Ambos: duas partes que somam exatamente o líquido', async () => {
  const [p] = await produto({ pertence: 'Ambos' });
  const v = await vender([{ produto_id: p.id, valor_bruto: 99.99 }], 'debito'); // taxa 1,99 → líquido 98,00
  assert.deepEqual(await lanc(v), { coruja: 49, arquibancada: 49 });
  const [p2] = await produto({ pertence: 'Ambos' });
  const v2 = await vender([{ produto_id: p2.id, valor_bruto: 100.01 }], 'pix');
  const l2 = await lanc(v2);
  assert.equal(Math.round((l2.coruja + l2.arquibancada) * 100), 10001);
  assert.equal(l2.coruja, 50.01);
  assert.equal(l2.arquibancada, 50);
  // Uma única venda e um único item, mesmo com dois lançamentos.
  assert.equal(num((await um(`select count(*) n from venda_itens where venda_id = $1`, [v2])).n), 1);
});

test('Arquibancada Inferior recebe 100% do líquido', async () => {
  const [p] = await produto({ prefixo: 'AI', pertence: 'Arquibancada Inferior' });
  assert.match(p.codigo, /^AI\d{3}$/);
  const v = await vender([{ produto_id: p.id, valor_bruto: 199 }], 'credito_1x');
  assert.deepEqual(await lanc(v), { arquibancada: 192.05 }); // 199 − 6,95
});

test('concessão: exige proprietário e respeita acordo percentual e fixo', async () => {
  const [p] = await produto({ pertence: 'Concessão' });
  await assert.rejects(vender([{ produto_id: p.id, valor_bruto: 100 }]), /proprietário/);

  const c = await um(`insert into consignantes (nome, tipo_acordo, valor_acordo, marca_restante)
                      values ('Lucas', 'percentual', 70, 'ambos') returning id`);
  await db.query(`update produtos set consignante_id = $1 where id = $2`, [c.id, p.id]);
  const v = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'debito'); // líquido 98,01
  const l = await lanc(v);
  assert.equal(l.consignante, 68.61); // 70% de 98,01 = 68,607
  assert.equal(Math.round((l.coruja + l.arquibancada + l.consignante) * 100), 9801);

  const [p2] = await produto({ pertence: 'Concessão', consignante_id: c.id, acordo_tipo: 'fixo', acordo_valor: 80 });
  const v2 = await vender([{ produto_id: p2.id, valor_bruto: 150 }], 'pix');
  const l2 = await lanc(v2);
  assert.equal(l2.consignante, 80);
  assert.equal(Math.round((l2.coruja + l2.arquibancada) * 100), 7000);
});

test('impede venda duplicada: mesmo produto, clique duplo e corrida', async () => {
  const [p] = await produto({});
  const chave = randomUUID();
  const v1 = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'pix', { chave });
  const v2 = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'pix', { chave }); // reenvio
  assert.equal(v1, v2);
  assert.equal(num((await um(`select count(*) n from venda_itens where produto_id = $1`, [p.id])).n), 1);
  await assert.rejects(vender([{ produto_id: p.id, valor_bruto: 100 }]), /status Vendida/);
  // Mesmo produto duas vezes na mesma venda.
  const [p2] = await produto({});
  await assert.rejects(vender([{ produto_id: p2.id, valor_bruto: 1 }, { produto_id: p2.id, valor_bruto: 1 }]));
  // A falha desfaz tudo: o produto continua disponível e sem venda.
  assert.equal((await um(`select status from produtos where id = $1`, [p2.id])).status, 'Disponível');
});

test('reserva e empréstimo bloqueiam venda até o cancelamento explícito', async () => {
  const [p] = await produto({});
  const r = await um(`select reservar_produto($1, 'reserva', 'Maria', 'paga sexta') as id`, [p.id]);
  assert.equal((await um(`select status from produtos where id = $1`, [p.id])).status, 'Reservada');
  await assert.rejects(vender([{ produto_id: p.id, valor_bruto: 100 }]), /Reservada/);
  await assert.rejects(db.query(`select reservar_produto($1, 'emprestimo')`, [p.id]), /não está disponível/);
  await db.query(`select encerrar_reserva($1, 'desistiu')`, [r.id]);
  assert.equal((await um(`select status from produtos where id = $1`, [p.id])).status, 'Disponível');
  await assert.rejects(db.query(`select encerrar_reserva($1)`, [r.id]), /já foi encerrada/);

  const e = await um(`select reservar_produto($1, 'emprestimo', 'Ensaio fotos') as id`, [p.id]);
  await assert.rejects(vender([{ produto_id: p.id, valor_bruto: 100 }]), /Emprestada/);
  await db.query(`select encerrar_reserva($1)`, [e.id]);
  await vender([{ produto_id: p.id, valor_bruto: 100 }]);
  const tipos = (await db.query(`select tipo from movimentacoes where produto_id = $1 order by id`, [p.id])).rows.map((x) => x.tipo);
  assert.deepEqual(tipos, ['cadastro', 'reserva', 'cancelamento_reserva', 'emprestimo', 'devolucao', 'venda']);
});

test('cancelar venda devolve o produto e zera o financeiro', async () => {
  const [p] = await produto({ cadastrado_site: true });
  const v = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'pix');
  assert.equal(num((await um(`select count(*) n from alertas_site where venda_id = $1 and status = 'pendente'`, [v])).n), 1);
  await como(VEND);
  await assert.rejects(db.query(`select cancelar_venda($1, 'erro')`, [v]), /administradores/);
  await como(ADMIN);
  await db.query(`select cancelar_venda($1, 'cliente desistiu')`, [v]);
  assert.equal((await um(`select status from produtos where id = $1`, [p.id])).status, 'Disponível');
  assert.deepEqual(await lanc(v), {});
  assert.equal((await um(`select status from alertas_site where venda_id = $1`, [v])).status, 'cancelado');
  // Pode ser vendido de novo.
  await vender([{ produto_id: p.id, valor_bruto: 90 }]);
});

test('alerta do site: adiar, resolver e não repetir', async () => {
  const [p] = await produto({ cadastrado_site: true });
  const v = await vender([{ produto_id: p.id, valor_bruto: 100 }]);
  const a = await um(`select id from alertas_site where venda_id = $1`, [v]);
  await db.query(`select resolver_alerta_site($1, 'adiar', 2)`, [a.id]);
  assert.equal((await um(`select status from alertas_site where id = $1`, [a.id])).status, 'adiado');
  await db.query(`select resolver_alerta_site($1, 'removido')`, [a.id]);
  await db.query(`select resolver_alerta_site($1, 'pendente')`, [a.id]); // ignorado: já concluído
  assert.equal((await um(`select status from alertas_site where id = $1`, [a.id])).status, 'removido');
  assert.equal((await um(`select cadastrado_site from produtos where id = $1`, [p.id])).cadastrado_site, false);
});

test('pagamento pendente não conta como recebido até ser marcado', async () => {
  const [p] = await produto({});
  const v = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'pix', { pendente: true });
  const pg = await um(`select * from pagamentos_situacao where venda_id = $1`, [v]);
  assert.equal(pg.recebido, false);
  await db.query(`select marcar_pagamento($1, true)`, [pg.id]);
  assert.equal((await um(`select recebido from pagamentos_situacao where id = $1`, [pg.id])).recebido, true);
});

test('dashboard não duplica faturamento por causa da divisão entre marcas', async () => {
  const hoje = (await um(`select (now() at time zone 'America/Sao_Paulo')::date d`)).d;
  const r = (await um(`select resumo_financeiro('2000-01-01', '2100-01-01') r`)).r;
  const soma = (await um(`select sum(vi.valor_bruto) b, sum(vi.valor_liquido) l from venda_itens vi
                          join vendas v on v.id = vi.venda_id where vi.ativo and v.status = 'concluida'`));
  assert.equal(num(r.bruto), num(soma.b));
  const marcas = r.marcas.coruja + r.marcas.arquibancada + r.marcas.consignantes;
  assert.equal(Math.round(marcas * 100), Math.round(num(soma.l) * 100));
  const so = (await um(`select resumo_financeiro('2000-01-01', '2100-01-01', 'arquibancada') r`)).r;
  assert.ok(so.bruto < r.bruto && so.marcas.arquibancada === r.marcas.arquibancada);
  const e = (await um(`select resumo_estoque() r`)).r;
  assert.ok(e.disponiveis > 0 && e.vendidos > 0);
  assert.ok(hoje);
});

test('categorias novas: sigla livre, sem duplicar, códigos próprios', async () => {
  const cat = await um(`select * from criar_categoria('Camisas de Treino', 'tr')`);
  assert.equal(cat.prefixo, 'TR');
  await assert.rejects(db.query(`select criar_categoria('Outra', 'TR')`), /já é usada/);
  await assert.rejects(db.query(`select criar_categoria('camisas de treino', 'CT')`), /Já existe/);
  await assert.rejects(db.query(`select criar_categoria('Sem sigla', 'ÇA')`), /1 a 3 letras/);
  await como(VEND);
  const ps = await produto({ prefixo: 'TR' }, ['P', 'M']);
  await como(ADMIN);
  assert.deepEqual(ps.map((p) => p.codigo), ['TR001', 'TR002']);
  const n = await um(`select numero, categoria from produtos_lista where codigo = 'TR002'`);
  assert.equal(n.numero, 2);
  assert.equal(n.categoria, 'Camisas de Treino');
  // Siglas com letras em comum não se confundem (M x MA).
  await db.query(`select criar_categoria('Manto', 'MA')`);
  const [ma] = await produto({ prefixo: 'MA' });
  assert.equal(ma.codigo, 'MA001');
  assert.deepEqual(await um(`select (decompor_codigo('MA001')).*`), { prefixo: 'MA', numero: 1 });
  assert.deepEqual(await um(`select (decompor_codigo('M0012')).*`), { prefixo: 'M', numero: 12 });
});

test('repasse semanal à Arquibancada (peças Ambos e Arquibancada)', async () => {
  const pend = async () => num((await um(`select coalesce(sum(valor), 0) v from repasse_pendente`)).v);
  // Zera o que outros testes deixaram pendente.
  if ((await um(`select count(*)::int n from repasse_pendente`)).n) await db.query(`select registrar_repasse('2000-01-01', '2100-01-01')`);
  assert.equal(await pend(), 0);

  const [a] = await produto({ pertence: 'Ambos' });
  const [b] = await produto({ pertence: 'Ambos' });
  const [cs] = await produto({ pertence: 'Coruja Sports' });
  const va = await vender([{ produto_id: a.id, valor_bruto: 100.01 }], 'pix', { data: '2026-10-05' }); // arq 50,00
  await vender([{ produto_id: b.id, valor_bruto: 200 }], 'debito', { data: '2026-10-08' }); // líq 196,02 → arq 98,01
  await vender([{ produto_id: cs.id, valor_bruto: 300 }], 'pix', { data: '2026-10-06' }); // Coruja: não entra
  assert.equal(await pend(), 148.01);
  // Peça 100% Arquibancada: todo o líquido entra no repasse.
  const [ai] = await produto({ prefixo: 'AI', pertence: 'Arquibancada Inferior' });
  const vai = await vender([{ produto_id: ai.id, valor_bruto: 199 }], 'debito', { data: '2026-10-07' }); // líq 195,04
  assert.equal(await pend(), 343.05);
  await db.query(`select cancelar_venda($1, 'teste')`, [vai]); // cancelada antes do repasse: sai sem estorno
  assert.equal(await pend(), 148.01);

  await como(VEND);
  await assert.rejects(db.query(`select registrar_repasse('2026-10-05', '2026-10-11')`), /administradores/);
  await como(ADMIN);
  await assert.rejects(db.query(`select registrar_repasse('2026-09-01', '2026-09-07')`), /Não há valores/);

  const r1 = await um(`select registrar_repasse('2026-10-05', '2026-10-11', '2026-10-12', 'semana 41') id`);
  assert.equal(num((await um(`select valor from repasses where id = $1`, [r1.id])).valor), 148.01);
  assert.equal(await pend(), 0);
  await assert.rejects(db.query(`select registrar_repasse('2026-10-05', '2026-10-11')`), /Não há valores/);

  // Venda já repassada é cancelada: vira estorno negativo no próximo repasse.
  await db.query(`select cancelar_venda($1, 'devolução')`, [va]);
  const est = await um(`select tipo, valor from repasse_pendente`);
  assert.deepEqual([est.tipo, num(est.valor)], ['estorno', -50]);
  const hoje = (await um(`select (now() at time zone 'America/Sao_Paulo')::date d`)).d;
  const r2 = await um(`select registrar_repasse('2000-01-01', $1) id`, [hoje]);
  assert.equal(num((await um(`select valor from repasses where id = $1`, [r2.id])).valor), -50);
  assert.equal(await pend(), 0);

  // Desfazer: r1 tem um valor estornado em r2, então r2 precisa ser desfeito antes.
  await assert.rejects(db.query(`select desfazer_repasse($1)`, [r1.id]), /Desfaça aquele repasse primeiro/);
  await db.query(`select desfazer_repasse($1)`, [r2.id]);
  assert.equal(await pend(), -50); // estorno volta a ficar pendente
  await db.query(`select desfazer_repasse($1)`, [r1.id]);
  // Sem nenhum repasse: só a venda ainda ativa (98,01) fica pendente; a cancelada some.
  assert.equal(await pend(), 98.01);
});

test('código manual: sugestão, edição e checagem de duplicidade', async () => {
  await db.query(`select criar_categoria('Retrô', 'R')`);
  assert.deepEqual((await um(`select sugerir_codigos('R', 3) c`)).c, ['R001', 'R002', 'R003']);

  // Código da etiqueta física existente, fora da sequência.
  const [p1] = (await db.query(`select * from criar_produtos($1, $2, $3)`, [
    { prefixo: 'R', descricao: 'Corinthians 1990', pertence: 'Coruja Sports', preco_venda: 300 }, ['G'], ['r 1386'],
  ])).rows;
  assert.equal(p1.codigo, 'R1386');
  // Sugestão continua depois do maior usado.
  assert.deepEqual((await um(`select sugerir_codigos('R', 2) c`)).c, ['R1387', 'R1388']);

  // Mesmo número com outro formato é duplicado; outra categoria não pode.
  assert.equal((await um(`select verificar_codigo('R01386', 'R') v`)).v.disponivel, false);
  assert.match((await um(`select verificar_codigo('R1386', 'R') v`)).v.motivo, /Já existe: R1386 · Corinthians 1990/);
  assert.match((await um(`select verificar_codigo('M1386', 'R') v`)).v.motivo, /deve começar com R/);
  assert.match((await um(`select verificar_codigo('XX12', null) v`)).v.motivo, /Não existe categoria/);
  assert.match((await um(`select verificar_codigo('1386', null) v`)).v.motivo, /Formato inválido/);
  assert.deepEqual((await um(`select verificar_codigo('r5', 'R') v`)).v, { disponivel: true, codigo: 'R005' });

  // Lote: um código por tamanho; vazio = gera automaticamente; erro desfaz tudo.
  const lote = (await db.query(`select codigo, tamanho from criar_produtos($1, $2, $3)`, [
    { prefixo: 'R', descricao: 'Santos 1995', pertence: 'Ambos', preco_venda: 250 }, ['P', 'M', 'G'], ['R5', '', 'R2000'],
  ])).rows;
  assert.deepEqual(lote.map((x) => x.codigo), ['R005', 'R1387', 'R2000']);
  const antes = (await um(`select count(*)::int n from produtos where prefixo = 'R'`)).n;
  await assert.rejects(
    db.query(`select * from criar_produtos($1, $2, $3)`, [
      { prefixo: 'R', descricao: 'Falha', pertence: 'Ambos', preco_venda: 1 }, ['P', 'M'], ['R3000', 'R1386'],
    ]),
    /Código R1386: Já existe/,
  );
  assert.equal((await um(`select count(*)::int n from produtos where prefixo = 'R'`)).n, antes);
  await assert.rejects(
    db.query(`select * from criar_produtos($1, $2, $3)`, [
      { prefixo: 'R', descricao: 'Falha', pertence: 'Ambos', preco_venda: 1 }, ['P', 'M'], ['R3001'],
    ]),
    /um código para cada tamanho/,
  );
  // O banco também barra números repetidos por fora das funções.
  await assert.rejects(
    db.query(`insert into produtos (codigo, prefixo, descricao, pertence, preco_venda) values ('R01386', 'R', 'x', 'Ambos', 1)`),
  );
  assert.equal((await um(`select gerar_codigo('R') c`)).c, 'R2001');
});

test('listagem agrupa produtos de mesma descrição com tamanhos e quantidades', async () => {
  const base = { prefixo: 'M', pertence: 'Coruja Sports', preco_venda: 199.9, descricao: 'Flamengo Home 2026' };
  const ps = await produto(base, ['G', 'P', 'M', 'M']);
  await produto({ ...base, descricao: '  flamengo home 2026 ', preco_venda: 179.9 }, ['GG']); // mesma descrição
  await vender([{ produto_id: ps[1].id, valor_bruto: 199.9 }]); // vende o P
  await db.query(`select reservar_produto($1, 'reserva', 'Ana')`, [ps[0].id]); // reserva o G

  const g = (await db.query(`select * from listar_grupos('flamengo home')`)).rows;
  assert.equal(g.length, 1);
  assert.equal(g[0].unidades, 5);
  assert.equal(g[0].disponiveis, 3);
  assert.equal(num(g[0].preco_min), 179.9);
  assert.equal(num(g[0].preco_max), 199.9);
  assert.deepEqual(g[0].tamanhos.map((t) => `${t.tamanho}:${t.disponiveis}/${t.unidades}`), ['P:0/1', 'M:2/2', 'G:0/1', 'GG:1/1']);
  assert.equal(g[0].produto_unico, null);

  // Filtros valem por unidade; busca por código acha o grupo com só aquela unidade.
  const d = (await db.query(`select * from listar_grupos('flamengo', 'Disponível')`)).rows[0];
  assert.equal(d.unidades, 3);
  const um1 = (await db.query(`select * from listar_grupos($1)`, [ps[2].codigo.toLowerCase()])).rows;
  assert.equal(um1.length, 1);
  assert.equal(um1[0].produto_unico, ps[2].id);
  assert.equal(um1[0].status_unico, 'Disponível');
  // Chave para abrir o grupo.
  const n = (await um(`select count(*)::int n from produtos_lista where grupo = $1`, [g[0].grupo])).n;
  assert.equal(n, 5);
  // Paginação informa o total.
  const pag = (await db.query(`select * from listar_grupos(null, null, null, null, null, null, null, null, 1, 0)`)).rows;
  assert.equal(pag.length, 1);
  assert.ok(Number(pag[0].total) > 1);
});

test('gerenciar categorias: criar, renomear, arquivar, excluir', async () => {
  await como(VEND);
  await assert.rejects(db.query(`select criar_categoria('Bermudas', 'BE')`), /administradores/);
  await como(ADMIN);
  await db.query(`select criar_categoria('Bermudas', 'BE')`);
  await db.query(`select criar_categoria('Vazia', 'VZ')`);

  await db.query(`select renomear_categoria('BE', 'Bermudas e Shorts')`);
  await assert.rejects(db.query(`select renomear_categoria('BE', 'masculino')`), /Já existe/);
  assert.equal((await um(`select descricao from prefixos where prefixo = 'BE'`)).descricao, 'Bermudas e Shorts');

  const [b] = await produto({ prefixo: 'BE' }, ['M']);
  const r = await um(`select produtos, disponiveis from categorias_resumo where prefixo = 'BE'`);
  assert.deepEqual([r.produtos, r.disponiveis], [1, 1]);

  // Com produto: não exclui, só arquiva. Arquivada bloqueia cadastro, não as vendas.
  await assert.rejects(db.query(`select excluir_categoria('BE')`), /tem 1 produto.*Arquive/);
  await db.query(`select arquivar_categoria('BE', true)`);
  await assert.rejects(produto({ prefixo: 'BE' }), /está arquivada/);
  await vender([{ produto_id: b.id, valor_bruto: 100 }]);
  await db.query(`select arquivar_categoria('BE', false)`);
  await produto({ prefixo: 'BE' });

  // Sem produtos: exclui e libera a sigla.
  await db.query(`select excluir_categoria('VZ')`);
  assert.equal((await um(`select count(*)::int n from prefixos where prefixo = 'VZ'`)).n, 0);
  await db.query(`select criar_categoria('Outra', 'VZ')`);
  await como(VEND);
  await assert.rejects(db.query(`select arquivar_categoria('VZ', true)`), /administradores/);
  await assert.rejects(db.query(`select excluir_categoria('VZ')`), /administradores/);
  await como(ADMIN);
});

test('venda avulsa (sem cadastro): taxa, divisão, repasse e painel', async () => {
  if ((await um(`select count(*)::int n from repasse_pendente`)).n) await db.query(`select registrar_repasse('2000-01-01', '2100-01-01')`);
  const vendaAvulsa = (itens, forma = 'debito', extra = {}) =>
    um(`select registrar_venda($1, $2, $3, $4, null, null, false, 'avulsa') as id`,
      [extra.chave ?? randomUUID(), JSON.stringify(itens), forma, extra.data ?? '2026-10-10']).then((r) => r.id);

  // 3 isqueiros a R$ 15 = R$ 45, débito 1,99% → taxa 0,90, líquido 44,10, Ambos → 22,05 cada.
  const v = await vendaAvulsa([{ descricao: 'Isqueiro Clipper', quantidade: 3, valor_bruto: 45, pertence: 'Ambos' }]);
  const it = await um(`select * from venda_itens where venda_id = $1`, [v]);
  assert.equal(it.produto_id, null);
  assert.deepEqual([it.descricao, it.quantidade, num(it.taxa_valor), num(it.valor_liquido), num(it.desconto)], ['Isqueiro Clipper', 3, 0.9, 44.1, 0]);
  assert.deepEqual(await lanc(v), { coruja: 22.05, arquibancada: 22.05 });
  const rp = await um(`select descricao, valor from repasse_pendente where venda_id = $1`, [v]);
  assert.deepEqual([rp.descricao, num(rp.valor)], ['Isqueiro Clipper', 22.05]);
  // Débito em 10/10/2026 (sábado): recebido na segunda, 12/10.
  const pg = await um(`select vencimento::text v, recebido from pagamentos_situacao where venda_id = $1`, [v]);
  assert.deepEqual([pg.v, pg.recebido], ['2026-10-12', true]);

  // Validações.
  await assert.rejects(vendaAvulsa([{ descricao: ' ', valor_bruto: 10, pertence: 'Ambos' }]), /descrição/);
  await assert.rejects(vendaAvulsa([{ descricao: 'Isqueiro', valor_bruto: 10 }]), /a quem pertence/);
  await assert.rejects(vendaAvulsa([{ descricao: 'Isqueiro', quantidade: 0, valor_bruto: 10, pertence: 'Ambos' }]), /Quantidade/);
  await assert.rejects(vendaAvulsa([{ descricao: 'Isqueiro', valor_bruto: 10, pertence: 'Concessão' }]), /proprietário/);

  // Venda mista: produto do estoque + isqueiro da Arquibancada.
  const [p] = await produto({ pertence: 'Coruja Sports' });
  const vm = await vendaAvulsa([
    { produto_id: p.id, valor_bruto: 100 },
    { descricao: 'Isqueiro Bic', quantidade: 1, valor_bruto: 12, pertence: 'Arquibancada Inferior' },
  ], 'pix');
  assert.deepEqual(await lanc(vm), { coruja: 100, arquibancada: 12 });
  assert.equal((await um(`select status from produtos where id = $1`, [p.id])).status, 'Vendida');

  // Idempotência também vale para avulso.
  const chave = randomUUID();
  const a1 = await vendaAvulsa([{ descricao: 'Isqueiro', valor_bruto: 15, pertence: 'Coruja Sports' }], 'pix', { chave });
  const a2 = await vendaAvulsa([{ descricao: 'Isqueiro', valor_bruto: 15, pertence: 'Coruja Sports' }], 'pix', { chave });
  assert.equal(a1, a2);

  // Cancelar venda mista: produto volta, financeiro zera.
  await db.query(`select cancelar_venda($1, 'teste')`, [vm]);
  assert.equal((await um(`select status from produtos where id = $1`, [p.id])).status, 'Disponível');
  assert.deepEqual(await lanc(vm), {});

  // Painel soma quantidade nos mais vendidos e separa avulsos.
  const r = (await um(`select resumo_financeiro('2026-10-10', '2026-10-10') r`)).r;
  const isq = r.mais_vendidos.find((m) => m.descricao === 'Isqueiro Clipper');
  assert.equal(isq.quantidade, 3);
  assert.equal(num(r.avulsos), 60); // 45 + 15 (a venda mista foi cancelada)
});

test('recebimento no próximo dia útil', async () => {
  const d = async (x) => (await um(`select proximo_dia_util($1::date)::text d`, [x])).d;
  assert.equal(await d('2026-10-12'), '2026-10-13'); // segunda → terça
  assert.equal(await d('2026-10-15'), '2026-10-16'); // quinta → sexta
  assert.equal(await d('2026-10-16'), '2026-10-19'); // sexta → segunda
  assert.equal(await d('2026-10-17'), '2026-10-19'); // sábado → segunda
  assert.equal(await d('2026-10-18'), '2026-10-19'); // domingo → segunda

  const situacao = async (forma, data, pendente = false) => {
    const [p] = await produto({});
    const id = await vender([{ produto_id: p.id, valor_bruto: 100 }], forma, { data, pendente });
    return (await db.query(`select vencimento::text, liquidacao, status, recebido from pagamentos_situacao where venda_id = $1`, [id])).rows;
  };
  // Débito numa sexta (data passada): um recebimento na segunda, já contado como recebido.
  assert.deepEqual(await situacao('debito', '2026-01-02'), [{ vencimento: '2026-01-05', liquidacao: 'automatica', status: 'pendente', recebido: true }]);
  // Crédito 2x em data futura: ainda a receber, numa única linha.
  const futuro = await situacao('credito_2x', '2099-12-31');
  assert.equal(futuro.length, 1);
  assert.equal(futuro[0].recebido, false);
  // Pix: recebido na hora. Pendente manual: só depois de baixar.
  assert.equal((await situacao('pix', '2026-01-02'))[0].status, 'recebido');
  const pend = await situacao('credito_1x', '2026-01-02', true);
  assert.deepEqual([pend[0].liquidacao, pend[0].recebido], ['manual', false]);
});

test('orçamentos: serviços por posição, várias camisas, totais, status e configuração', async () => {
  const servicos = (await db.query(`select * from servicos order by grupo, ordem`)).rows;
  const s = (nome, grupo, detalhe = null) => servicos.find((x) => x.nome === nome && x.grupo === grupo && (x.detalhe ?? null) === detalhe);
  assert.equal(servicos.length, 16); // barra frente e barra verso separadas
  assert.ok(s('Barra', 'frente') && s('Barra', 'verso'));
  assert.ok(s('Limpeza/Remoção de patrocínios', 'frente') && s('Limpeza/Remoção de patrocínios', 'verso'));
  assert.equal(num(s('Master frontal', 'frente', 'cor única').valor), 30);
  assert.equal(num(s('Master costa', 'verso', 'colorido').valor), 45);
  assert.equal(s('Estampas/Personalizações', 'outros').a_partir_de, true);

  const item = (sv, extra = {}) => ({ servico_id: sv.id, descricao: sv.nome, quantidade: 1, valor_unitario: num(sv.valor), ...extra });
  await como(VEND);
  const id = (await um(`select salvar_orcamento(null, $1, $2) id`, [
    { cliente_nome: 'João', contato: '@joao' },
    JSON.stringify([
      { nome: 'Corinthians 2009', fotos: ['orcamentos/a.jpg'], itens: [item(s('Escudo', 'frente')), item(s('Nome + número', 'verso'))] },
      { nome: 'Manchester Azul', fotos: [], itens: [
        item(s('Limpeza/Remoção de patrocínios', 'frente')),
        item(s('Estampas/Personalizações', 'outros'), { descricao: 'Estampas/Personalizações – leão nas costas', valor_unitario: 75.5 }),
        { servico_id: null, descricao: 'Ajuste de gola', quantidade: 2, valor_unitario: 10 },
      ] },
    ]),
  ])).id;
  const o = await um(`select * from orcamentos where id = $1`, [id]);
  assert.equal(o.status, 'pendente');
  assert.equal(num(o.total), 85 + 135.5); // 45+40 | 40+75,50+20
  const pecas = (await db.query(`select nome, subtotal, fotos from orcamento_pecas where orcamento_id = $1 order by ordem`, [id])).rows;
  assert.deepEqual(pecas.map((p) => [p.nome, num(p.subtotal)]), [['Corinthians 2009', 85], ['Manchester Azul', 135.5]]);
  assert.deepEqual(pecas[0].fotos, ['orcamentos/a.jpg']);

  // Editar substitui peças e itens, mantendo o status.
  await db.query(`select salvar_orcamento($1, $2, $3)`, [id, { cliente_nome: 'João Silva' },
    JSON.stringify([{ nome: 'Corinthians 2009', itens: [item(s('Escudo', 'frente'))] }])]);
  assert.equal(num((await um(`select total from orcamentos where id = $1`, [id])).total), 45);
  assert.equal((await um(`select count(*)::int n from orcamento_pecas where orcamento_id = $1`, [id])).n, 1);
  assert.equal((await um(`select count(*)::int n from orcamento_itens where orcamento_id = $1`, [id])).n, 1);

  await assert.rejects(db.query(`select salvar_orcamento(null, $1, '[]')`, [{ cliente_nome: 'X' }]), /ao menos uma camisa/);
  await assert.rejects(db.query(`select salvar_orcamento(null, $1, $2)`, [{ cliente_nome: 'X' }, JSON.stringify([{ nome: ' ', itens: [item(s('Logo', 'frente'))] }])]), /nome da camisa 1/);
  await assert.rejects(db.query(`select salvar_orcamento(null, $1, $2)`, [{ cliente_nome: 'X' }, JSON.stringify([{ nome: 'Santos', itens: [] }])]), /serviço para Santos/);

  // Status: aprovado ativo; lavagem começa inativa.
  await db.query(`select alterar_status_orcamento($1, 'aprovado')`, [id]);
  await assert.rejects(db.query(`select alterar_status_orcamento($1, 'lavagem')`, [id]), /inativo/);
  await assert.rejects(db.query(`select salvar_status_orcamento('lavagem', 'Lavagem', true)`), /administradores/);
  await como(ADMIN);
  await db.query(`select salvar_status_orcamento('lavagem', 'Lavagem', true)`);
  await db.query(`select alterar_status_orcamento($1, 'lavagem')`, [id]);
  const hist = (await db.query(`select status_novo from orcamento_historico where orcamento_id = $1 order by id`, [id])).rows.map((h) => h.status_novo);
  assert.deepEqual(hist, ['pendente', 'aprovado', 'lavagem']);
  assert.equal((await um(`select salvar_status_orcamento(null, 'Aguardando cliente', true) c`)).c, 'aguardando_cliente');
  await assert.rejects(db.query(`select salvar_status_orcamento(null, 'aguardando CLIENTE', true)`), /Já existe/);
  await assert.rejects(db.query(`select salvar_status_orcamento('pendente', 'Pendente', false)`), /não pode ser desativado/);

  // Serviço novo com posição.
  const sid = (await um(`select salvar_servico(null, 'Costura', null, 25, false, true, 'verso') id`)).id;
  await db.query(`select salvar_servico($1, 'Costura', null, 28, false, true, 'verso')`, [sid]);
  const cs = await um(`select valor, grupo from servicos where id = $1`, [sid]);
  assert.deepEqual([num(cs.valor), cs.grupo], [28, 'verso']);
  await assert.rejects(db.query(`select salvar_servico(null, 'X', null, 1, false, true, 'lado')`), /Posição inválida/);
});

test('autocomplete da descrição: modelos parecidos e quantidade por tamanho', async () => {
  // 5 unidades no M + 2 no G do mesmo modelo, cada uma com código próprio.
  const lote = await produto({ descricao: 'São Paulo Home 2026', prefixo: 'M', preco_venda: 349.9 }, ['M', 'M', 'M', 'M', 'M', 'G', 'G']);
  assert.equal(lote.length, 7);
  assert.equal(new Set(lote.map((p) => p.codigo)).size, 7);
  assert.equal(lote.filter((p) => p.tamanho === 'M').length, 5);
  await produto({ descricao: 'Sao Paulo Away 2026' }, ['P']);
  await vender([{ produto_id: lote[0].id, valor_bruto: 349.9 }]);

  const busca = async (t) => (await db.query(`select * from sugerir_modelos($1)`, [t])).rows;
  // Ignora acento, maiúsculas e ordem das palavras.
  const r = await busca('sao paulo');
  assert.equal(r.length, 2);
  const home = r.find((x) => x.descricao === 'São Paulo Home 2026');
  assert.deepEqual([home.unidades, home.disponiveis], [7, 6]);
  assert.deepEqual([...home.tamanhos].sort(), ['G', 'M']);
  assert.ok(lote.some((p) => p.id === home.produto_base));
  assert.equal((await busca('2026 HOME são')).length, 1);
  assert.equal((await busca('away')).length, 1);
  assert.equal((await busca('inexistente xyz')).length, 0);
  assert.equal((await busca('   ')).length, 0);
  assert.equal((await busca('100%')).length, 0); // curinga escapado
});

test('venda pelo site: taxa própria, canal, recebimento e repasse nos dois sentidos', async () => {
  const pend = async () => num((await um(`select coalesce(sum(valor), 0) v from repasse_pendente`)).v);
  if ((await um(`select count(*)::int n from repasse_pendente`)).n) await db.query(`select registrar_repasse('2000-01-01', '2100-01-01')`);
  assert.equal(await pend(), 0);

  await db.query(`select atualizar_taxa('pix', 4.99, 'site_coruja')`);
  await db.query(`select atualizar_taxa('pix', 5, 'site_arquibancada')`);
  // Recebimento do site: só admin muda, e só nos canais dos sites.
  await como(VEND);
  await assert.rejects(db.query(`select definir_liquidacao_taxa('site_coruja', 'pix', 'imediata')`), /administradores/);
  await como(ADMIN);
  await assert.rejects(db.query(`select definir_liquidacao_taxa('loja', 'pix', 'proximo_dia_util')`), /site/);
  await assert.rejects(db.query(`select definir_liquidacao_taxa('site_coruja', 'pix', 'mensal')`), /inválido/);
  await db.query(`select definir_liquidacao_taxa('site_coruja', 'pix', 'imediata')`);
  const SA = { canal: 'site_arquibancada' };

  // Semana de 07/09/2026 (segunda) a 13/09/2026.
  const [a] = await produto({ pertence: 'Ambos' });
  const [b] = await produto({ pertence: 'Coruja Sports' });
  const [ai] = await produto({ prefixo: 'AI', pertence: 'Arquibancada Inferior' });
  const [d] = await produto({ pertence: 'Ambos' });
  const consignante = (marca) => um(`insert into consignantes (nome, tipo_acordo, valor_acordo, marca_restante)
                         values ('Site ' || $1, 'percentual', 70, $1) returning id`, [marca]);
  const [e] = await produto({ pertence: 'Concessão', consignante_id: (await consignante('ambos')).id });
  const [ec] = await produto({ pertence: 'Concessão', consignante_id: (await consignante('coruja')).id });
  const [ea] = await produto({ pertence: 'Concessão', consignante_id: (await consignante('arquibancada')).id });
  const [f] = await produto({ pertence: 'Coruja Sports' });
  const [g] = await produto({ pertence: 'Coruja Sports' });

  // Ambos no site da Arquibancada: taxa do site (5%) gravada; split normal;
  // a parte da Coruja abate o repasse.
  const va = await vender([{ produto_id: a.id, valor_bruto: 100 }], 'pix', { ...SA, data: '2026-09-07' });
  const venda = await um(`select forma, canal, taxa_percentual, taxa_valor from vendas where id = $1`, [va]);
  assert.deepEqual([venda.forma, venda.canal, num(venda.taxa_percentual), num(venda.taxa_valor)], ['pix', 'site_arquibancada', 5, 5]);
  assert.equal(num((await um(`select taxa_percentual from venda_itens where venda_id = $1`, [va])).taxa_percentual), 5);
  assert.deepEqual(await lanc(va), { coruja: 47.5, arquibancada: 47.5 });
  const ra = (await db.query(`select beneficiario, valor from repasse_pendente where venda_id = $1`, [va])).rows;
  assert.deepEqual(ra.map((r) => [r.beneficiario, num(r.valor)]), [['coruja', -47.5]]);
  // O dinheiro entrou na conta da Arquibancada (próximo dia útil, padrão do site).
  const pa = await um(`select recebedor, canal, vencimento::text v from pagamentos_situacao where venda_id = $1`, [va]);
  assert.deepEqual([pa.recebedor, pa.canal, pa.v], ['arquibancada', 'site_arquibancada', '2026-09-08']);

  // 100% Coruja no site da Arquibancada: todo o líquido abate o repasse.
  const vb = await vender([{ produto_id: b.id, valor_bruto: 60 }], 'pix', { ...SA, data: '2026-09-08' });
  assert.equal(num((await um(`select sum(valor) v from repasse_pendente where venda_id = $1`, [vb])).v), -57);

  // 100% Arquibancada no site dela: não gera repasse.
  const vc = await vender([{ produto_id: ai.id, valor_bruto: 80 }], 'pix', { ...SA, data: '2026-09-09' });
  assert.deepEqual(await lanc(vc), { arquibancada: 76 });
  assert.equal(num((await um(`select count(*) n from repasse_pendente where venda_id = $1`, [vc])).n), 0);

  // Site da Coruja: igual à loja (parte da Arquibancada a repassar), com a taxa do site.
  const vd = await vender([{ produto_id: d.id, valor_bruto: 100 }], 'pix', { canal: 'site_coruja', data: '2026-09-09' });
  assert.equal((await um(`select canal from vendas where id = $1`, [vd])).canal, 'site_coruja');
  assert.deepEqual(await lanc(vd), { coruja: 47.51, arquibancada: 47.5 }); // líquido 95,01
  assert.equal(num((await um(`select sum(valor) v from repasse_pendente where venda_id = $1`, [vd])).v), 47.5);
  const pd = await um(`select recebedor, status from pagamentos_situacao where venda_id = $1`, [vd]);
  assert.deepEqual([pd.recebedor, pd.status], ['coruja', 'recebido']); // site Coruja configurado "na hora"

  // Concessão no site da Arquibancada: só a comissão da Coruja abate o
  // repasse; o valor do proprietário fica fora do acerto entre as marcas.
  const repasseDa = async (venda) => (await db.query(`select beneficiario, valor from repasse_pendente where venda_id = $1`, [venda])).rows
    .map((r) => [r.beneficiario, num(r.valor)]);
  const ve = await vender([{ produto_id: e.id, valor_bruto: 100 }], 'pix', { ...SA, data: '2026-09-10' });
  assert.deepEqual(await lanc(ve), { consignante: 66.5, coruja: 14.25, arquibancada: 14.25 });
  assert.deepEqual(await repasseDa(ve), [['coruja', -14.25]]); // comissão Ambos: metade da Coruja
  const vec = await vender([{ produto_id: ec.id, valor_bruto: 100 }], 'pix', { ...SA, data: '2026-09-10' });
  assert.deepEqual(await lanc(vec), { consignante: 66.5, coruja: 28.5 });
  assert.deepEqual(await repasseDa(vec), [['coruja', -28.5]]); // comissão toda da Coruja
  const vea = await vender([{ produto_id: ea.id, valor_bruto: 100 }], 'pix', { ...SA, data: '2026-09-10' });
  assert.deepEqual(await lanc(vea), { consignante: 66.5, arquibancada: 28.5 });
  assert.deepEqual(await repasseDa(vea), []); // comissão da Arquibancada: dinheiro já está com ela

  // Venda na loja na mesma semana, para o painel.
  await vender([{ produto_id: g.id, valor_bruto: 50 }], 'pix', { data: '2026-09-10' });

  // Cancelada antes do repasse: simplesmente sai da lista.
  const vf = await vender([{ produto_id: f.id, valor_bruto: 20 }], 'pix', { ...SA, data: '2026-09-11' });
  assert.equal(await pend(), -118.75);
  await db.query(`select cancelar_venda($1, 'teste')`, [vf]);
  // Saldo negativo: a Arquibancada deve à Coruja.
  assert.equal(await pend(), -99.75); // −47,50 − 57 + 47,50 − 14,25 − 28,50

  // Painel: canais somam o faturamento, sem duplicar; recebimentos separados.
  const r = (await um(`select resumo_financeiro('2026-09-07', '2026-09-13') r`)).r;
  assert.equal(num(r.bruto), 690);
  const canal = Object.fromEntries(r.por_canal.map((x) => [x.canal, num(x.bruto)]));
  assert.deepEqual(canal, { loja: 50, site_coruja: 100, site_arquibancada: 540 });
  assert.deepEqual(r.por_canal.map((x) => x.canal), ['loja', 'site_coruja', 'site_arquibancada']);
  assert.equal(num(r.recebido_periodo), 145.01); // 95,01 (site Coruja) + 50 (loja)
  assert.equal(num(r.recebido_arquibancada), 513); // 95 + 57 + 76 + 3 × 95

  // Baixa com total negativo: a Arquibancada pagou a Coruja.
  const r1 = await um(`select registrar_repasse('2026-09-07', '2026-09-13', '2026-09-14') id`);
  assert.equal(num((await um(`select valor from repasses where id = $1`, [r1.id])).valor), -99.75);
  assert.equal(await pend(), 0);

  // Cancelada depois do repasse: estorno no sentido inverso (a Coruja devolve).
  await db.query(`select cancelar_venda($1, 'devolução')`, [vb]);
  const est = await um(`select tipo, valor from repasse_pendente where venda_id = $1`, [vb]);
  assert.deepEqual([est.tipo, num(est.valor)], ['estorno', 57]);
  assert.equal(await pend(), 57);
  const hoje = (await um(`select (now() at time zone 'America/Sao_Paulo')::date d`)).d;
  const r2 = await um(`select registrar_repasse('2000-01-01', $1) id`, [hoje]);
  assert.equal(num((await um(`select valor from repasses where id = $1`, [r2.id])).valor), 57);
  await db.query(`select definir_liquidacao_taxa('site_coruja', 'pix', 'proximo_dia_util')`);
});

test('taxa por canal + forma: 9 casos de divisão/repasse, venda antiga intacta, só admin altera', async () => {
  const pend = async (venda) => num((await um(`select coalesce(sum(valor), 0) v from repasse_pendente where venda_id = $1`, [venda])).v);
  // Crédito 3x com taxa diferente em cada canal (loja já está em 5,99%).
  await db.query(`select atualizar_taxa('credito_3x', 6.5, 'site_coruja')`);
  await db.query(`select atualizar_taxa('credito_3x', 7, 'site_arquibancada')`);
  await como(VEND);
  await assert.rejects(db.query(`select atualizar_taxa('credito_3x', 1, 'site_coruja')`), /administradores/);
  await como(ADMIN);
  await assert.rejects(db.query(`select atualizar_taxa('credito_3x', 1, 'site_x')`), /não encontrada/);
  const hist = await um(`select canal, percentual_novo from taxas_historico where forma = 'credito_3x' order by id desc limit 1`);
  assert.deepEqual([hist.canal, num(hist.percentual_novo)], ['site_arquibancada', 7]);

  // [canal, pertence, lançamentos esperados, repasse esperado] — bruto 100 em crédito 3x.
  const casos = [
    ['loja', 'Coruja Sports', { coruja: 94.01 }, 0],
    ['loja', 'Arquibancada Inferior', { arquibancada: 94.01 }, 94.01],
    ['loja', 'Ambos', { coruja: 47.01, arquibancada: 47 }, 47],
    ['site_coruja', 'Coruja Sports', { coruja: 93.5 }, 0],
    ['site_coruja', 'Arquibancada Inferior', { arquibancada: 93.5 }, 93.5],
    ['site_coruja', 'Ambos', { coruja: 46.75, arquibancada: 46.75 }, 46.75],
    ['site_arquibancada', 'Coruja Sports', { coruja: 93 }, -93],
    ['site_arquibancada', 'Arquibancada Inferior', { arquibancada: 93 }, 0],
    ['site_arquibancada', 'Ambos', { coruja: 46.5, arquibancada: 46.5 }, -46.5],
  ];
  const pct = { loja: 5.99, site_coruja: 6.5, site_arquibancada: 7 };
  const vendas = {};
  for (const [canal, pertence, lancs, repasse] of casos) {
    const [p] = await produto({ pertence, prefixo: pertence === 'Arquibancada Inferior' ? 'AI' : 'M' });
    const v = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'credito_3x', { canal, data: '2026-08-04' });
    vendas[canal] = v;
    const vv = await um(`select v.forma, v.canal, v.taxa_percentual, i.taxa_percentual ip from vendas v join venda_itens i on i.venda_id = v.id where v.id = $1`, [v]);
    assert.deepEqual([vv.forma, vv.canal, num(vv.taxa_percentual), num(vv.ip)], ['credito_3x', canal, pct[canal], pct[canal]], `${canal}/${pertence}`);
    assert.deepEqual(await lanc(v), lancs, `${canal}/${pertence}`);
    assert.equal(await pend(v), repasse, `${canal}/${pertence}`);
  }

  // Alterar a taxa depois não muda a venda antiga; a nova usa a taxa nova.
  await db.query(`select atualizar_taxa('credito_3x', 8, 'site_arquibancada')`);
  assert.equal(num((await um(`select taxa_percentual from vendas where id = $1`, [vendas.site_arquibancada])).taxa_percentual), 7);
  const [p] = await produto({});
  const nova = await vender([{ produto_id: p.id, valor_bruto: 100 }], 'credito_3x', { canal: 'site_arquibancada', data: '2026-08-04' });
  assert.equal(num((await um(`select taxa_valor from vendas where id = $1`, [nova])).taxa_valor), 8);

  // Canal e forma legados/ inválidos são recusados.
  const [q] = await produto({});
  await assert.rejects(vender([{ produto_id: q.id, valor_bruto: 10 }], 'site_coruja'), /forma de pagamento/);
  await assert.rejects(vender([{ produto_id: q.id, valor_bruto: 10 }], 'pix', { canal: 'feira' }), /Canal inválido/);

  // Painel: por canal e por forma somam o mesmo faturamento, sem duplicar.
  const r = (await um(`select resumo_financeiro('2026-08-04', '2026-08-04') r`)).r;
  const soma = (l) => Math.round(l.reduce((t, x) => t + num(x.bruto), 0) * 100);
  assert.equal(soma(r.por_canal), Math.round(num(r.bruto) * 100));
  assert.equal(soma(r.por_forma), Math.round(num(r.bruto) * 100));
  assert.deepEqual(r.por_forma.map((x) => x.forma), ['credito_3x']);
});
