import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { calcularPeriodo, FiltroPeriodo } from '@/components/periodo';
import { Botao, Cartao, Carregando, ErroCaixa, Etiqueta, Linha, T, Tela, Vazio } from '@/components/ui';
import { listarVendas } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { exportarPlanilha } from '@/lib/exportar';
import { mensagemErro } from '@/lib/supabase';
import { useCores } from '@/lib/tema';
import { ROTULO_CANAL, ROTULO_FORMA, dataBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

const nomeItem = (i: any) =>
  i.produto ? `${i.produto.descricao} · ${i.produto.tamanho ?? '—'} · ${i.produto.codigo}` : `${i.quantidade}× ${i.descricao} (sem cadastro)`;

export default function Vendas() {
  const c = useCores();
  const { avisar } = useDialogos();
  const [periodo, setPeriodo] = useState(calcularPeriodo('mes'));
  const { dados, erro, carregando, recarregar } = useConsulta(() => listarVendas(periodo.inicio, periodo.fim), [periodo.inicio, periodo.fim]);

  async function exportar() {
    try {
      await exportarPlanilha(
        `vendas-${periodo.inicio}-a-${periodo.fim}`,
        (dados ?? []).map((v) => ({
          Data: dataBR(v.data_venda),
          Itens: v.itens.map(nomeItem).join(' | '),
          Canal: ROTULO_CANAL[v.canal as keyof typeof ROTULO_CANAL] ?? 'Loja',
          Forma: ROTULO_FORMA[v.forma as keyof typeof ROTULO_FORMA],
          'Forma original': v.forma_original ?? '',
          'Taxa (%)': Number(v.taxa_percentual),
          Bruto: Number(v.valor_bruto),
          Taxa: Number(v.taxa_valor),
          Líquido: Number(v.valor_liquido),
          Cliente: v.cliente ?? '',
          Status: v.status,
          Origem: v.origem,
          Observações: v.observacoes ?? '',
        })),
      );
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <FiltroPeriodo onChange={setPeriodo} />
      <Linha>
        <Botao compacto icone="add" titulo="Nova venda" onPress={() => router.push('/venda/nova')} />
        <Botao compacto v="secundario" icone="download-outline" titulo="Exportar XLSX" onPress={exportar} desabilitado={!dados?.length} />
      </Linha>
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && dados.length === 0 && <Vazio texto="Nenhuma venda no período." />}
      {dados?.length === 500 && <T v="legenda">Mostrando as 500 mais recentes.</T>}
      {dados?.map((v) => (
        <Cartao key={v.id} onPress={() => router.push(`/venda/${v.id}`)}>
          <Linha estilo={{ justifyContent: 'space-between' }}>
            <T v="forte">{brlReais(v.valor_bruto)}</T>
            <Linha gap={6}>
              {v.status === 'cancelada' && <Etiqueta texto="Cancelada" cor={c.perigo} fundo={c.perigoSuave} />}
              <T v="legenda">{dataBR(v.data_venda)}</T>
            </Linha>
          </Linha>
          <View>
            {v.itens.map((i: any, k: number) => (
              <T key={k} v="legenda" linhas={1}>
                {nomeItem(i)}
              </T>
            ))}
          </View>
          <T v="legenda">
            {v.canal && v.canal !== 'loja' ? `${ROTULO_CANAL[v.canal as keyof typeof ROTULO_CANAL]} · ` : ''}
            {ROTULO_FORMA[v.forma as keyof typeof ROTULO_FORMA]} · líquido {brlReais(v.valor_liquido)}
            {v.cliente ? ` · ${v.cliente}` : ''}
          </T>
        </Cartao>
      ))}
    </Tela>
  );
}
