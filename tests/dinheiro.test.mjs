// Cálculos monetários do app (devem bater com as regras do banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVenda, dividirLiquido, efeitoRepasse, lerValor, calcularTaxa } from '../src/lib/dinheiro.ts';

test('cálculo no app bate com as regras do banco', () => {
  assert.equal(lerValor('189,90'), 18990);
  assert.equal(lerValor('R$ 1.234,5'), 123450);
  assert.equal(lerValor('44.4'), 4440);
  assert.equal(lerValor('abc'), null);
  assert.equal(calcularTaxa(17000, 5.99), 1018);
  assert.equal(calcularTaxa(10000, 1.995), 200); // 1,995 → meio para cima
  const c = calcularVenda({ precoPadrao: 18990, valorBruto: 17000, custo: 7000, taxaPercentual: 5.99 });
  assert.deepEqual([c.desconto, c.taxa, c.liquido, c.lucroBruto, c.resultado], [1990, 1018, 15982, 10000, 8982]);
  assert.deepEqual(dividirLiquido(10001, 'Ambos'), { coruja: 5001, arquibancada: 5000, consignante: 0 });
  assert.deepEqual(dividirLiquido(9801, 'Concessão', { tipo: 'percentual', valor: 70, marcaRestante: 'ambos' }),
    { coruja: 1470, arquibancada: 1470, consignante: 6861 });
  // Repasse: loja/site Coruja → parte da Arquibancada; site Arquibancada → o que não é dela, negativo.
  const div = { coruja: 4751, arquibancada: 4750, consignante: 0 };
  assert.equal(efeitoRepasse(div, 'loja'), 4750);
  assert.equal(efeitoRepasse(div, 'site_coruja'), 4750);
  assert.equal(efeitoRepasse(div, 'site_arquibancada'), -4751);
  // Concessão no site Arquibancada: só a comissão da Coruja abate; o proprietário fica fora.
  assert.equal(efeitoRepasse({ coruja: 1425, arquibancada: 1425, consignante: 6650 }, 'site_arquibancada'), -1425);
  assert.equal(efeitoRepasse({ coruja: 0, arquibancada: 2850, consignante: 6650 }, 'site_arquibancada'), 0);
  assert.equal(efeitoRepasse({ coruja: 0, arquibancada: 7600, consignante: 0 }, 'site_arquibancada'), 0);
});
