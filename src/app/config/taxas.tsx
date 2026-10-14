import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, ErroCaixa, Linha, T, Tela } from '@/components/ui';
import { atualizarTaxa, listarTaxas } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brl, calcularTaxa } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { useConsulta } from '@/lib/useConsulta';

export default function Taxas() {
  const { admin } = useAuth();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarTaxas);
  // Só guarda o que foi editado; o resto vem do banco.
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const valores: Record<string, string> = {
    ...Object.fromEntries((dados ?? []).map((t) => [t.forma, String(t.percentual).replace('.', ',')])),
    ...editados,
  };

  const visiveis = (dados ?? []).filter((t) => t.forma !== 'outro');

  async function salvar() {
    const mudancas: { forma: any; pct: number }[] = [];
    for (const t of visiveis) {
      const n = Number((valores[t.forma] ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n >= 100) return avisar(`Percentual inválido em ${t.rotulo}`, 'erro');
      if (Math.round(n * 10000) !== Math.round(t.percentual * 10000)) mudancas.push({ forma: t.forma, pct: n });
    }
    if (!mudancas.length) return avisar('Nada para salvar');
    setSalvando(true);
    try {
      for (const m of mudancas) await atualizarTaxa(m.forma, m.pct);
      avisar('Taxas atualizadas');
      await recarregar();
      setEditados({});
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Tela atualizando={carregando} onAtualizar={async () => { setEditados({}); await recarregar(); }}>
      <Aviso tipo="info" texto="A loja absorve a taxa. Mudanças valem só para novas vendas." />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {visiveis.map((t) => {
        const n = Number((valores[t.forma] ?? '').replace(',', '.'));
        return (
          <Cartao key={t.forma}>
            <Linha estilo={{ justifyContent: 'space-between' }}>
              <T v="forte">{t.rotulo}</T>
              <T v="legenda">{t.liquidacao === 'proximo_dia_util' ? 'Recebe no próximo dia útil' : t.liquidacao === 'mensal' ? `${t.parcelas} parcela(s) mensal(is)` : 'Recebe na hora'}</T>
            </Linha>
            <Campo
              rotulo="Taxa (%)"
              value={valores[t.forma] ?? ''}
              onChangeText={(v) => setEditados({ ...editados, [t.forma]: v })}
              keyboardType="decimal-pad"
              editable={admin}
            />
            {Number.isFinite(n) && <T v="legenda">R$ 100,00 → taxa {brl(calcularTaxa(10000, n))} · recebe {brl(10000 - calcularTaxa(10000, n))}</T>}
          </Cartao>
        );
      })}
      {admin ? <Botao titulo="Salvar taxas" onPress={salvar} carregando={salvando} /> : <T v="legenda">Apenas administradores alteram.</T>}
    </Tela>
  );
}
