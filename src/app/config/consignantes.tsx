import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, Chips, ErroCaixa, Linha, ParValor, T, Tela, Vazio } from '@/components/ui';
import { listarConsignantes, salvarConsignante } from '@/lib/api';
import { brl, dividirLiquido, lerValor } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ROTULO_MARCA, type Consignante } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

type Form = { id?: string; nome: string; contato: string; tipo_acordo: 'percentual' | 'fixo'; valor: string; marca_restante: 'coruja' | 'arquibancada' | 'ambos'; observacoes: string };
const vazio: Form = { nome: '', contato: '', tipo_acordo: 'percentual', valor: '', marca_restante: 'coruja', observacoes: '' };

export default function Consignantes() {
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarConsignantes);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  function editar(c: Consignante) {
    setForm({
      id: c.id, nome: c.nome, contato: c.contato ?? '', tipo_acordo: c.tipo_acordo,
      valor: String(c.valor_acordo).replace('.', ','), marca_restante: c.marca_restante, observacoes: c.observacoes ?? '',
    });
  }

  async function salvar() {
    if (!form) return;
    const v = Number(form.valor.replace(',', '.'));
    if (!form.nome.trim()) return avisar('Informe o nome', 'erro');
    if (!Number.isFinite(v) || v < 0 || (form.tipo_acordo === 'percentual' && v > 100)) return avisar('Valor do acordo inválido', 'erro');
    setSalvando(true);
    try {
      await salvarConsignante({
        id: form.id, nome: form.nome.trim(), contato: form.contato.trim() || null, tipo_acordo: form.tipo_acordo,
        valor_acordo: v, marca_restante: form.marca_restante, observacoes: form.observacoes.trim() || null,
      });
      avisar('Consignante salvo');
      setForm(null);
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  // Simulação com venda de R$ 100,00 já descontada a taxa (líquido R$ 100,00).
  const exemplo = form && Number.isFinite(Number(form.valor.replace(',', '.')))
    ? dividirLiquido(10000, 'Concessão', { tipo: form.tipo_acordo, valor: Number(form.valor.replace(',', '.')), marcaRestante: form.marca_restante })
    : null;

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Aviso
        tipo="info"
        texto="Na venda, o proprietário recebe pelo acordo e o restante fica com a marca escolhida."
      />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {form ? (
        <Cartao>
          <T v="forte">{form.id ? 'Editar consignante' : 'Novo consignante'}</T>
          <Campo rotulo="Nome" value={form.nome} onChangeText={(t) => setForm({ ...form, nome: t })} />
          <Campo rotulo="Contato" value={form.contato} onChangeText={(t) => setForm({ ...form, contato: t })} />
          <Chips
            rotulo="Acordo"
            opcoes={['percentual', 'fixo'] as const}
            rotulos={{ percentual: '% do líquido', fixo: 'Valor fixo' }}
            valor={form.tipo_acordo}
            onChange={(v) => v && setForm({ ...form, tipo_acordo: v })}
          />
          <Campo
            rotulo={form.tipo_acordo === 'percentual' ? '% do proprietário' : 'Valor por peça (R$)'}
            value={form.valor}
            onChangeText={(t) => setForm({ ...form, valor: t })}
            keyboardType="decimal-pad"
          />
          <Chips
            rotulo="Restante para"
            opcoes={['coruja', 'arquibancada', 'ambos'] as const}
            rotulos={ROTULO_MARCA}
            valor={form.marca_restante}
            onChange={(v) => v && setForm({ ...form, marca_restante: v })}
          />
          <Campo rotulo="Observações" value={form.observacoes} onChangeText={(t) => setForm({ ...form, observacoes: t })} multiline />
          {exemplo && (
            <T v="legenda">
              Em R$ 100,00 líquidos: proprietário {brl(exemplo.consignante)} · Coruja {brl(exemplo.coruja)} · Arquibancada {brl(exemplo.arquibancada)}
            </T>
          )}
          <Linha>
            <Botao v="secundario" titulo="Cancelar" onPress={() => setForm(null)} estilo={{ flex: 1 }} />
            <Botao titulo="Salvar" onPress={salvar} carregando={salvando} estilo={{ flex: 1 }} />
          </Linha>
        </Cartao>
      ) : (
        <Botao icone="add" titulo="Novo consignante" onPress={() => setForm(vazio)} />
      )}
      {carregando && !dados && <Carregando />}
      {dados && dados.length === 0 && <Vazio texto="Nenhum proprietário cadastrado." />}
      {dados?.map((c) => (
        <Cartao key={c.id} onPress={() => editar(c)}>
          <T v="forte">{c.nome}</T>
          {c.contato && <T v="legenda">{c.contato}</T>}
          <ParValor rotulo="Acordo" valor={c.tipo_acordo === 'percentual' ? `${c.valor_acordo}% do líquido` : `${brl(lerValor(c.valor_acordo))} por peça`} />
          <ParValor rotulo="Restante para" valor={ROTULO_MARCA[c.marca_restante]} />
        </Cartao>
      ))}
    </Tela>
  );
}
