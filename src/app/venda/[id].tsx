import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, ErroCaixa, Etiqueta, Foto, Linha, ParValor, Secao, Separador, T, Tela } from '@/components/ui';
import { cancelarVenda, marcarPagamento, obterVenda } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brlReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { ROTULO_FORMA, ROTULO_MARCA, dataBR, dataHoraBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

const ORIGEM: Record<string, string> = { venda: 'Tela de vendas', baixa_rapida: 'Baixa rápida', avulsa: 'Venda avulsa' };

export default function DetalheVenda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCores();
  const { admin } = useAuth();
  const { avisar, confirmar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(() => obterVenda(id), [id]);
  const [motivo, setMotivo] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (erro) return <Tela><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (!dados) return <Tela><Carregando /></Tela>;
  const { venda: v, itens, pagamentos, lancamentos } = dados;
  const cancelada = v.status === 'cancelada';

  async function cancelar() {
    if (!motivo.trim()) return avisar('Informe o motivo do cancelamento', 'erro');
    const ok = await confirmar({
      titulo: 'Cancelar esta venda?',
      mensagem: 'Produtos voltam ao estoque e o financeiro é desfeito.',
      confirmar: 'Cancelar venda',
      cancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    setOcupado('cancelar');
    try {
      await cancelarVenda(v.id, motivo.trim());
      avisar('Venda cancelada');
      setCancelando(false);
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  async function alternarPagamento(p: any) {
    setOcupado(p.id);
    try {
      await marcarPagamento(p.id, !p.recebido, null);
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  // Agrupa lançamentos por beneficiário.
  const porMarca = new Map<string, number>();
  for (const l of lancamentos.filter((l: any) => l.ativo || cancelada)) {
    const k = l.beneficiario === 'consignante' ? `consignante:${l.consignante?.nome ?? 'a definir'}` : l.beneficiario;
    porMarca.set(k, (porMarca.get(k) ?? 0) + Number(l.valor));
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Linha quebra>
        <T v="titulo">{brlReais(v.valor_bruto)}</T>
        {cancelada ? <Etiqueta texto="Cancelada" cor={c.perigo} fundo={c.perigoSuave} /> : <Etiqueta texto="Concluída" cor={c.primaria} fundo={c.primariaSuave} />}
      </Linha>
      <T v="legenda">
        {dataBR(v.data_venda)} · {ROTULO_FORMA[v.forma as keyof typeof ROTULO_FORMA]} · {ORIGEM[v.origem] ?? v.origem}
      </T>
      {cancelada && <Aviso tipo="perigo" texto={`Cancelada em ${dataHoraBR(v.cancelada_em)}: ${v.motivo_cancelamento}`} />}

      <Secao titulo="Produtos">
        {itens.map((i: any) => (
          <Cartao key={i.id} onPress={i.produto ? () => router.push(`/produto/${i.produto.id}`) : undefined}>
            <Linha gap={ESPACO.md}>
              <Foto path={i.produto?.foto_path} tamanho={48} />
              <View style={{ flex: 1 }}>
                <T v="forte" linhas={1}>{i.produto ? i.produto.descricao : `${i.quantidade}× ${i.descricao}`}</T>
                <T v="legenda">
                  {i.produto ? `${i.produto.codigo} · Tam. ${i.produto.tamanho ?? '—'}` : 'Sem cadastro'} · {i.pertence}
                </T>
              </View>
            </Linha>
            <Separador />
            <ParValor rotulo="Preço padrão" valor={brlReais(i.preco_padrao)} />
            {Number(i.desconto) !== 0 && <ParValor rotulo="Desconto" valor={brlReais(i.desconto)} />}
            <ParValor rotulo="Valor da venda" valor={brlReais(i.valor_bruto)} destaque />
            <ParValor rotulo={`Taxa (${Number(i.taxa_percentual).toLocaleString('pt-BR')}%)`} valor={`− ${brlReais(i.taxa_valor)}`} />
            <ParValor rotulo="Líquido" valor={brlReais(i.valor_liquido)} />
            <ParValor rotulo="Custo" valor={i.custo === null ? 'não informado' : brlReais(i.custo)} />
            <ParValor rotulo="Lucro bruto" valor={brlReais(i.lucro_bruto)} />
            <ParValor rotulo="Resultado" valor={brlReais(i.resultado)} destaque />
          </Cartao>
        ))}
      </Secao>

      <Secao titulo="Divisão do líquido">
        <Cartao>
          {[...porMarca.entries()].map(([k, valor]) => (
            <ParValor
              key={k}
              rotulo={k.startsWith('consignante:') ? `Proprietário: ${k.slice(12)}` : ROTULO_MARCA[k]}
              valor={brlReais(valor)}
            />
          ))}
          <Separador />
          <ParValor rotulo="Total líquido" valor={brlReais(v.valor_liquido)} destaque />
          {(() => {
            const rep = lancamentos.filter((l: any) => l.beneficiario === 'arquibancada');
            if (!rep.length) return null;
            const repassado = rep.every((l: any) => l.repasse_id);
            const estornar = cancelada && rep.some((l: any) => l.repasse_id && !l.estorno_repasse_id);
            return (
              <ParValor
                rotulo="Repasse à Arquibancada"
                valor={cancelada ? (estornar ? 'estorno no próximo repasse' : repassado ? 'estornado' : 'cancelado') : repassado ? 'repassado' : 'pendente'}
                cor={!cancelada && !repassado ? c.alerta : undefined}
              />
            );
          })()}
        </Cartao>
      </Secao>

      <Secao titulo="Recebimento">
        <Cartao>
          {pagamentos.length === 0 && <T v="legenda">{cancelada ? 'Pagamentos cancelados.' : 'Sem parcelas.'}</T>}
          {pagamentos.map((p: any) => (
            <Linha key={p.id} estilo={{ justifyContent: 'space-between' }} quebra>
              <View>
                <T v="forte">
                  {p.total_parcelas > 1 ? `Parcela ${p.parcela}/${p.total_parcelas}` : 'Pagamento'} · {brlReais(p.valor_liquido)}
                </T>
                <T v="legenda">
                  {p.recebido ? `Recebido em ${dataBR(p.data_recebimento)}` : p.liquidacao === 'automatica' ? `Cai em ${dataBR(p.vencimento)}` : 'Pendente'}
                </T>
              </View>
              <Botao
                compacto
                v="secundario"
                titulo={p.status === 'recebido' ? 'Desfazer' : 'Marcar recebido'}
                onPress={() => alternarPagamento(p)}
                carregando={ocupado === p.id}
              />
            </Linha>
          ))}
        </Cartao>
      </Secao>

      {(v.cliente || v.observacoes) && (
        <Cartao>
          {v.cliente && <ParValor rotulo="Cliente" valor={v.cliente} />}
          {v.observacoes && <T v="legenda">{v.observacoes}</T>}
        </Cartao>
      )}
      <T v="legenda">Registrada em {dataHoraBR(v.criado_em)}</T>

      {admin && !cancelada && (
        cancelando ? (
          <Cartao>
            <Campo rotulo="Motivo do cancelamento" value={motivo} onChangeText={setMotivo} multiline />
            <Linha>
              <Botao v="secundario" titulo="Voltar" onPress={() => setCancelando(false)} estilo={{ flex: 1 }} />
              <Botao v="perigo" titulo="Cancelar venda" onPress={cancelar} carregando={ocupado === 'cancelar'} estilo={{ flex: 1 }} />
            </Linha>
          </Cartao>
        ) : (
          <Botao v="perigo" titulo="Cancelar venda" icone="close-circle-outline" onPress={() => setCancelando(true)} />
        )
      )}
    </Tela>
  );
}
