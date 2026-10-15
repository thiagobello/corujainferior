// Taxas por canal (Loja, Site Coruja, Site Arquibancada) e forma de
// pagamento. A venda usa a taxa da combinação e grava o percentual usado.
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, Chips, ErroCaixa, Linha, Secao, Separador, T, Tela } from '@/components/ui';
import { atualizarTaxa, definirLiquidacaoTaxa, listarTaxas } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mensagemErro } from '@/lib/supabase';
import { CANAIS, FORMAS_VENDA, ROTULO_CANAL, type Taxa } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

type Liquidacao = 'imediata' | 'proximo_dia_util';
const chaveDe = (t: Taxa) => `${t.canal}:${t.forma}`;

export default function Taxas() {
  const { admin } = useAuth();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarTaxas);
  // Só guarda o que foi editado; o resto vem do banco.
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [liquidacoes, setLiquidacoes] = useState<Partial<Record<string, Liquidacao>>>({});
  const [salvando, setSalvando] = useState(false);
  const valores: Record<string, string> = {
    ...Object.fromEntries((dados ?? []).map((t) => [chaveDe(t), String(t.percentual).replace('.', ',')])),
    ...editados,
  };

  const visiveis = (dados ?? []).filter((t) => FORMAS_VENDA.includes(t.forma));

  async function salvar() {
    const mudancas: { t: Taxa; pct: number }[] = [];
    for (const t of visiveis) {
      const n = Number((valores[chaveDe(t)] ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n >= 100) return avisar(`Percentual inválido em ${ROTULO_CANAL[t.canal]} · ${t.rotulo}`, 'erro');
      if (Math.round(n * 10000) !== Math.round(t.percentual * 10000)) mudancas.push({ t, pct: n });
    }
    const mudancasLiq = visiveis.filter((t) => liquidacoes[chaveDe(t)] && liquidacoes[chaveDe(t)] !== t.liquidacao);
    if (!mudancas.length && !mudancasLiq.length) return avisar('Nada para salvar');
    setSalvando(true);
    try {
      for (const m of mudancas) await atualizarTaxa(m.t.canal, m.t.forma, m.pct);
      for (const t of mudancasLiq) await definirLiquidacaoTaxa(t.canal, t.forma, liquidacoes[chaveDe(t)]!);
      avisar('Taxas atualizadas');
      await recarregar();
      setEditados({});
      setLiquidacoes({});
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function linha(t: Taxa, k: number) {
    const chave = chaveDe(t);
    const liq = liquidacoes[chave] ?? t.liquidacao;
    // Recebimento só é editável nos sites; a loja segue Pix na hora e cartão no próximo dia útil.
    const site = t.canal !== 'loja';
    return (
      <View key={chave} style={{ gap: 6 }}>
        {k > 0 && <Separador />}
        <Linha estilo={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T v="forte">{t.rotulo}</T>
            {!site && <T v="legenda">{liq === 'proximo_dia_util' ? 'Próximo dia útil' : 'Na hora'}</T>}
          </View>
          <Campo
            value={valores[chave] ?? ''}
            onChangeText={(v) => setEditados({ ...editados, [chave]: v })}
            keyboardType="decimal-pad"
            editable={admin}
            placeholder="%"
            estilo={{ flexGrow: 0, minWidth: 96, width: 96 }}
          />
        </Linha>
        {site && (
          <Chips
            opcoes={['imediata', 'proximo_dia_util'] as const}
            rotulos={{ imediata: 'Na hora', proximo_dia_util: 'Próximo dia útil' }}
            valor={liq === 'mensal' ? null : liq}
            onChange={(v) => admin && v && setLiquidacoes({ ...liquidacoes, [chave]: v })}
          />
        )}
      </View>
    );
  }

  return (
    <Tela atualizando={carregando} onAtualizar={async () => { setEditados({}); setLiquidacoes({}); await recarregar(); }}>
      <Aviso tipo="info" texto="A loja absorve a taxa. Mudanças valem só para novas vendas." />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {CANAIS.map((canal) => {
        const doCanal = visiveis.filter((t) => t.canal === canal);
        if (!doCanal.length) return null;
        return (
          <Secao key={canal} titulo={ROTULO_CANAL[canal]}>
            <Cartao>{doCanal.map(linha)}</Cartao>
          </Secao>
        );
      })}
      {admin ? <Botao titulo="Salvar taxas" onPress={salvar} carregando={salvando} /> : <T v="legenda">Apenas administradores.</T>}
    </Tela>
  );
}
