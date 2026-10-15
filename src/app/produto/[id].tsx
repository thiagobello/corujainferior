import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FotoAmpliavel } from '@/components/foto-ampliavel';
import { useDialogos } from '@/components/dialogos';
import {
  Aviso, Botao, Campo, Cartao, Carregando, ErroCaixa, Etiqueta, Linha, ParValor, Secao, Selo, Separador, T, Tela,
} from '@/components/ui';
import { atualizarProduto, encerrarReserva, historicoProduto, obterProduto, reservar } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brlReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import {
  ROTULO_CAMPO, ROTULO_FORMA, ROTULO_MOVIMENTACAO, dataBR, dataHoraBR, rotuloSite, type Movimentacao,
} from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function DetalheProduto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCores();
  const { admin } = useAuth();
  const { avisar, confirmar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(
    async () => {
      const [p, hist] = await Promise.all([obterProduto(id), historicoProduto(id)]);
      return { p, hist };
    },
    [id],
  );
  const [formReserva, setFormReserva] = useState<null | 'reserva' | 'emprestimo'>(null);
  const [cliente, setCliente] = useState('');
  const [obsReserva, setObsReserva] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (erro) return <Tela><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (!dados) return <Tela><Carregando /></Tela>;
  const { p, hist } = dados;

  async function executar(acao: () => Promise<unknown>, msg: string) {
    setOcupado(true);
    try {
      await acao();
      avisar(msg);
      setFormReserva(null);
      setCliente('');
      setObsReserva('');
      setPrevisao('');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(false);
    }
  }

  function confirmarReserva() {
    const prev = previsao.trim();
    let iso: string | null = null;
    if (prev) {
      const m = prev.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return avisar('Use a data no formato DD/MM/AAAA', 'erro');
      iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    executar(() => reservar(p.id, formReserva!, cliente, obsReserva, iso), formReserva === 'reserva' ? 'Produto reservado' : 'Empréstimo registrado');
  }

  async function encerrar() {
    const ehReserva = p.reserva_tipo === 'reserva';
    const ok = await confirmar({
      titulo: ehReserva ? 'Cancelar reserva?' : 'Registrar devolução?',
      mensagem: `${p.codigo} volta a ficar disponível.`,
      confirmar: ehReserva ? 'Cancelar reserva' : 'Confirmar devolução',
      cancelar: 'Voltar',
    });
    if (ok) executar(() => encerrarReserva(p.reserva_id!, ''), ehReserva ? 'Reserva cancelada' : 'Devolução registrada');
  }

  async function arquivar() {
    const ok = await confirmar({
      titulo: p.arquivado ? 'Desarquivar produto?' : 'Arquivar produto?',
      mensagem: p.arquivado ? 'Volta ao estoque.' : 'Sai do estoque. Código e histórico são mantidos.',
      perigo: !p.arquivado,
    });
    if (ok) executar(() => atualizarProduto(p.id, { arquivado: !p.arquivado }), p.arquivado ? 'Produto desarquivado' : 'Produto arquivado');
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Stack.Screen options={{ title: p.codigo }} />
      <Linha gap={ESPACO.lg} quebra estilo={{ alignItems: 'flex-start' }}>
        <FotoAmpliavel path={p.foto_path} tamanho={140} raio={12} />
        <View style={{ flex: 1, minWidth: 200, gap: ESPACO.xs }}>
          <T v="titulo" estilo={{ fontSize: 20 }}>{p.descricao}</T>
          <Linha quebra>
            <Selo status={p.status} />
            {p.arquivado && <Etiqueta texto="Arquivado" />}
          </Linha>
          <T v="legenda" selecionavel>
            {p.codigo} · Tam. {p.tamanho ?? '—'}{p.cor ? ` · ${p.cor}` : ''} · {p.categoria}
          </T>
          <T v="valor">{brlReais(p.preco_venda)}</T>
        </View>
      </Linha>

      {/* Ações */}
      {p.status === 'Disponível' && !p.arquivado && (
        <Linha quebra>
          <Botao titulo="Vender" icone="flash" onPress={() => router.push({ pathname: '/baixa', params: { codigo: p.codigo } })} estilo={{ flexGrow: 1 }} />
          <Botao v="secundario" titulo="Reservar" icone="bookmark-outline" onPress={() => setFormReserva('reserva')} estilo={{ flexGrow: 1 }} />
          <Botao v="secundario" titulo="Emprestar" icone="swap-horizontal-outline" onPress={() => setFormReserva('emprestimo')} estilo={{ flexGrow: 1 }} />
        </Linha>
      )}
      {p.status === 'Disponível' && p.pertence === 'Concessão' && !p.consignante_id && (
        <Aviso texto="Concessão sem proprietário: edite para vender." />
      )}

      {formReserva && (
        <Cartao>
          <T v="forte">{formReserva === 'reserva' ? 'Reservar' : 'Emprestar'}</T>
          <Campo rotulo={formReserva === 'reserva' ? 'Cliente' : 'Com quem está'} value={cliente} onChangeText={setCliente} />
          <Campo rotulo="Previsão (DD/MM/AAAA, opcional)" value={previsao} onChangeText={setPrevisao} keyboardType="numbers-and-punctuation" />
          <Campo rotulo="Observações" value={obsReserva} onChangeText={setObsReserva} multiline />
          <Aviso tipo="info" texto="Fica bloqueado para venda até encerrar." />
          <Linha>
            <Botao v="secundario" titulo="Cancelar" onPress={() => setFormReserva(null)} estilo={{ flex: 1 }} />
            <Botao titulo="Confirmar" onPress={confirmarReserva} carregando={ocupado} estilo={{ flex: 1 }} />
          </Linha>
        </Cartao>
      )}

      {p.reserva_id && (
        <Cartao estilo={{ borderColor: p.reserva_tipo === 'reserva' ? c.alerta : c.info }}>
          <T v="forte">{p.reserva_tipo === 'reserva' ? 'Reservado' : 'Emprestado'}</T>
          {p.reserva_cliente && <ParValor rotulo={p.reserva_tipo === 'reserva' ? 'Cliente' : 'Com'} valor={p.reserva_cliente} />}
          {p.reserva_previsao && <ParValor rotulo="Previsão" valor={dataBR(p.reserva_previsao)} />}
          <Botao
            v="secundario"
            titulo={p.reserva_tipo === 'reserva' ? 'Cancelar reserva' : 'Registrar devolução'}
            onPress={encerrar}
            carregando={ocupado}
          />
        </Cartao>
      )}

      {p.venda_id && (
        <Cartao onPress={() => router.push(`/venda/${p.venda_id}`)}>
          <T v="forte">Venda</T>
          <ParValor rotulo="Data" valor={dataBR(p.data_venda)} />
          <ParValor rotulo="Forma de pagamento" valor={p.forma_venda ? ROTULO_FORMA[p.forma_venda] : '—'} />
          <ParValor rotulo="Valor vendido" valor={brlReais(p.valor_vendido)} />
          <ParValor rotulo="Taxa aplicada" valor={`${Number(p.taxa_venda_percentual ?? 0).toLocaleString('pt-BR')}% · ${brlReais(p.taxa_venda_valor)}`} />
          <T v="legenda" cor={c.primaria}>Ver venda ›</T>
        </Cartao>
      )}

      <Secao titulo="Dados" acao={<Botao compacto v="fantasma" icone="create-outline" titulo="Editar" onPress={() => router.push(`/produto/editar/${p.id}`)} />}>
        <Cartao>
          <ParValor rotulo="Tipo" valor={p.tipo ?? '—'} />
          <ParValor rotulo="Condição" valor={p.condicao ?? '—'} />
          <ParValor rotulo="Pertence" valor={p.pertence} />
          {p.pertence === 'Concessão' && (
            <ParValor
              rotulo="Proprietário"
              valor={`${p.consignante_nome ?? 'não definido'}${p.acordo_tipo ? ` · acordo próprio: ${p.acordo_tipo === 'percentual' ? `${p.acordo_valor}%` : brlReais(p.acordo_valor)}` : ''}`}
            />
          )}
          <Separador />
          <ParValor rotulo="Custo" valor={brlReais(p.custo)} />
          <ParValor rotulo="Preço de venda" valor={brlReais(p.preco_venda)} />
          <ParValor rotulo="Lucro bruto estimado" valor={brlReais(p.lucro_estimado)} destaque />
          <Separador />
          <ParValor rotulo="Cadastrado no site" valor={rotuloSite(p.cadastrado_site)} />
          {p.observacoes && (
            <View style={{ gap: 2, paddingTop: ESPACO.xs }}>
              <T v="legenda">Observações</T>
              <T>{p.observacoes}</T>
            </View>
          )}
        </Cartao>
      </Secao>

      <Secao titulo="Histórico">
        <Cartao>
          {hist.length === 0 ? <T v="legenda">Sem movimentações.</T> : hist.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <Separador />}
              <ItemHistorico m={m} />
            </View>
          ))}
        </Cartao>
      </Secao>

      {admin && <Botao v={p.arquivado ? 'secundario' : 'perigo'} titulo={p.arquivado ? 'Desarquivar' : 'Arquivar produto'} onPress={arquivar} />}
    </Tela>
  );
}

function ItemHistorico({ m }: { m: Movimentacao & { usuario?: string } }) {
  const d = m.detalhes ?? {};
  let detalhe = '';
  if (m.tipo === 'edicao') {
    detalhe = Object.entries(d)
      .map(([k, v]: [string, any]) => `${ROTULO_CAMPO[k] ?? k}: ${fmt(v?.de)} → ${fmt(v?.para)}`)
      .join(' · ');
  } else if (m.tipo === 'venda') {
    detalhe = `${brlReais(d.valor_bruto)} · ${ROTULO_FORMA[d.forma as keyof typeof ROTULO_FORMA] ?? d.forma} · taxa ${brlReais(d.taxa_valor)}${Number(d.desconto) > 0 ? ` · desconto ${brlReais(d.desconto)}` : ''}`;
  } else if (d.cliente) {
    detalhe = `${d.cliente}${d.previsao ? ` · previsão ${dataBR(d.previsao)}` : ''}`;
  }
  return (
    <View style={{ gap: 2, paddingVertical: 4 }}>
      <Linha estilo={{ justifyContent: 'space-between' }}>
        <T v="forte">{ROTULO_MOVIMENTACAO[m.tipo] ?? m.tipo}</T>
        <T v="legenda">{dataHoraBR(m.criado_em)}</T>
      </Linha>
      {detalhe ? <T v="legenda">{detalhe}</T> : null}
      {m.observacoes ? <T v="legenda">“{m.observacoes}”</T> : null}
      {m.usuario ? <T v="legenda">por {m.usuario}</T> : null}
    </View>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}
