import { router } from 'expo-router';
import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Cartao, Carregando, ErroCaixa, Linha, ParValor, T, Tela, Vazio } from '@/components/ui';
import { marcarPagamento, pagamentosPendentes } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ROTULO_FORMA, dataBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function Pagamentos() {
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(pagamentosPendentes);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function receber(id: string) {
    setOcupado(id);
    try {
      await marcarPagamento(id, true, null);
      avisar('Recebido');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  // Venda no site da Arquibancada cai na conta dela: fica separada para não
  // somar no que a Coruja tem a receber.
  const daCoruja = (dados ?? []).filter((p) => p.recebedor !== 'arquibancada');
  const daArquibancada = (dados ?? []).filter((p) => p.recebedor === 'arquibancada');
  const manuais = daCoruja.filter((p) => p.liquidacao === 'manual');
  const cartao = daCoruja.filter((p) => p.liquidacao === 'automatica');
  const soma = (l: any[]) => l.reduce((s, p) => s + Number(p.valor_liquido), 0);

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      <Aviso
        tipo="info"
        texto="Cartão cai no próximo dia útil. Pendências do cliente são baixadas aqui."
      />
      <T v="secao">Pendências · {brlReais(soma(manuais))}</T>
      {dados && manuais.length === 0 && <Vazio icone="checkmark-circle-outline" texto="Nenhum pagamento pendente." />}
      {manuais.map((p) => (
        <Cartao key={p.id}>
          <Linha estilo={{ justifyContent: 'space-between' }}>
            <T v="forte">{brlReais(p.valor_liquido)}</T>
            <T v="legenda">venda de {dataBR(p.data_venda)}</T>
          </Linha>
          <T v="legenda">
            {ROTULO_FORMA[p.forma as keyof typeof ROTULO_FORMA]}
            {p.total_parcelas > 1 ? ` · parcela ${p.parcela}/${p.total_parcelas}` : ''}
            {p.cliente ? ` · ${p.cliente}` : ''}
          </T>
          <Linha>
            <Botao compacto titulo="Marcar recebido" icone="checkmark" onPress={() => receber(p.id)} carregando={ocupado === p.id} />
            <Botao compacto v="fantasma" titulo="Ver venda" onPress={() => router.push(`/venda/${p.venda_id}`)} />
          </Linha>
        </Cartao>
      ))}
      <T v="secao">Cartão a cair · {brlReais(soma(cartao))}</T>
      {dados && cartao.length === 0 && <T v="legenda">Nada a cair.</T>}
      {cartao.map((p) => (
        <Cartao key={p.id} onPress={() => router.push(`/venda/${p.venda_id}`)}>
          <ParValor rotulo={`Cai em ${dataBR(p.vencimento)} · venda de ${dataBR(p.data_venda)}`} valor={brlReais(p.valor_liquido)} />
        </Cartao>
      ))}
      {daArquibancada.length > 0 && (
        <>
          <T v="secao">Site Arquibancada · {brlReais(soma(daArquibancada))}</T>
          {daArquibancada.map((p) => (
            <Cartao key={p.id}>
              <ParValor
                rotulo={`${p.liquidacao === 'manual' ? 'Pendente' : `Cai em ${dataBR(p.vencimento)}`} · venda de ${dataBR(p.data_venda)}`}
                valor={brlReais(p.valor_liquido)}
              />
              <Linha>
                {p.liquidacao === 'manual' && (
                  <Botao compacto titulo="Marcar recebido" icone="checkmark" onPress={() => receber(p.id)} carregando={ocupado === p.id} />
                )}
                <Botao compacto v="fantasma" titulo="Ver venda" onPress={() => router.push(`/venda/${p.venda_id}`)} />
              </Linha>
            </Cartao>
          ))}
        </>
      )}
    </Tela>
  );
}
