import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Botao, Cartao, Carregando, Chips, ErroCaixa, Foto, Linha, T, Tela, Vazio } from '@/components/ui';
import { encerrarReserva, listarReservasAtivas } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { dataBR, dataHoraBR, hojeISO } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function Reservas() {
  const c = useCores();
  const { avisar, confirmar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarReservasAtivas);
  const [tipo, setTipo] = useState<'reserva' | 'emprestimo' | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function encerrar(r: any) {
    const ehReserva = r.tipo === 'reserva';
    const ok = await confirmar({
      titulo: ehReserva ? 'Cancelar reserva?' : 'Registrar devolução?',
      mensagem: `${r.produto.codigo} volta a ficar disponível.`,
      confirmar: ehReserva ? 'Cancelar reserva' : 'Confirmar devolução',
      cancelar: 'Voltar',
    });
    if (!ok) return;
    setOcupado(r.id);
    try {
      await encerrarReserva(r.id, '');
      avisar(ehReserva ? 'Reserva cancelada' : 'Devolução registrada');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  const lista = (dados ?? []).filter((r) => !tipo || r.tipo === tipo);
  const hoje = hojeISO();

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Chips opcoes={['reserva', 'emprestimo'] as const} rotulos={{ reserva: 'Reservas', emprestimo: 'Empréstimos' }} valor={tipo} onChange={setTipo} permiteVazio />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && lista.length === 0 && <Vazio texto="Nada reservado ou emprestado." />}
      {lista.map((r) => {
        const atrasado = r.previsao && r.previsao < hoje;
        return (
          <Cartao key={r.id} onPress={() => router.push(`/produto/${r.produto.id}`)}>
            <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
              <Foto path={r.produto.foto_path} tamanho={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Linha estilo={{ justifyContent: 'space-between' }}>
                  <T v="forte" linhas={2} estilo={{ flex: 1 }}>{r.produto.descricao}</T>
                  <T v="legenda" cor={r.tipo === 'reserva' ? c.alerta : c.info}>{r.tipo === 'reserva' ? 'Reserva' : 'Empréstimo'}</T>
                </Linha>
                <T v="legenda">{r.produto.codigo} · Tam. {r.produto.tamanho ?? '—'} · {brlReais(r.produto.preco_venda)}</T>
                {r.cliente && <T v="legenda">{r.cliente}</T>}
                <T v="legenda" cor={atrasado ? c.perigo : undefined}>
                  Desde {dataHoraBR(r.inicio)}{r.previsao ? ` · previsão ${dataBR(r.previsao)}${atrasado ? ' (atrasado)' : ''}` : ''}
                </T>
                {r.observacoes && <T v="legenda">“{r.observacoes}”</T>}
              </View>
            </Linha>
            <Botao compacto v="secundario" titulo={r.tipo === 'reserva' ? 'Cancelar reserva' : 'Registrar devolução'} onPress={() => encerrar(r)} carregando={ocupado === r.id} />
          </Cartao>
        );
      })}
    </Tela>
  );
}
