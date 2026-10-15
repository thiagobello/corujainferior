// Repasse semanal entre as marcas. Vendas da loja e do site da Coruja:
// a parte da Arquibancada fica pendente (valor positivo). Vendas no site da
// Arquibancada: o dinheiro está com ela, e a parte da Coruja abate o
// repasse (valor negativo; a do proprietário fica fora). O saldo da
// semana pode ficar negativo: aí é a Arquibancada que paga a Coruja.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, ErroCaixa, Etiqueta, Linha, ParValor, Secao, Separador, T, Tela, Vazio } from '@/components/ui';
import { desfazerRepasse, listarRepasses, registrarRepasse, repassesPendentes, type RepassePendente } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brl, brlReais, paraCentavos } from '@/lib/dinheiro';
import { exportarPlanilha } from '@/lib/exportar';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { ROTULO_CANAL, dataBR, hojeISO } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

const PARTE: Record<string, string> = {
  'Arquibancada Inferior': '100%',
  Ambos: '50%',
  Concessão: 'comissão da concessão',
};

function parte(i: RepassePendente): string {
  if (i.canal === 'site_arquibancada') return 'parte da Coruja';
  return PARTE[i.pertence] ?? i.pertence;
}
/** Saldo com o sentido: positivo a Coruja paga; negativo a Arquibancada paga. */
const rotuloSaldo = (total: number) => (total < 0 ? 'Arquibancada deve à Coruja' : 'A repassar à Arquibancada');

interface Semana {
  inicio: string; // segunda-feira
  fim: string; // domingo
  itens: RepassePendente[];
  total: number; // centavos
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function segunda(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dow + 6) % 7));
}

function agruparPorSemana(itens: RepassePendente[]): Semana[] {
  const mapa = new Map<string, Semana>();
  for (const i of itens) {
    const ini = segunda(i.data_ref);
    const s = mapa.get(ini) ?? { inicio: ini, fim: somarDias(ini, 6), itens: [], total: 0 };
    s.itens.push(i);
    s.total += paraCentavos(i.valor) ?? 0;
    mapa.set(ini, s);
  }
  return [...mapa.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
}

export default function Repasses() {
  const c = useCores();
  const { admin } = useAuth();
  const { avisar, confirmar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(async () => {
    const [pendentes, historico] = await Promise.all([repassesPendentes(), listarRepasses()]);
    return { pendentes, historico };
  });
  const [aberta, setAberta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const semanas = agruparPorSemana(dados?.pendentes ?? []);
  const totalPendente = semanas.reduce((s, x) => s + x.total, 0);
  const semanaAtual = segunda(hojeISO());

  async function darBaixa(inicio: string, fim: string, total: number, rotulo: string) {
    let obs = '';
    let pagoEm = dataBR(hojeISO());
    const ok = await confirmar({
      titulo: total < 0 ? `Receber da Arquibancada: ${brl(-total)}` : `Dar baixa: ${brl(total)}`,
      confirmar: 'Confirmar repasse',
      conteudo: (
        <FormBaixa
          rotulo={rotulo}
          onMudar={(o, d) => { obs = o; pagoEm = d; }}
          inicial={pagoEm}
        />
      ),
    });
    if (!ok) return;
    const m = pagoEm.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return avisar('Use a data no formato DD/MM/AAAA', 'erro');
    setOcupado(inicio + fim);
    try {
      await registrarRepasse(inicio, fim, `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, obs);
      avisar('Repasse registrado');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  async function desfazer(r: any) {
    const ok = await confirmar({
      titulo: 'Desfazer este repasse?',
      mensagem: `${brlReais(r.valor)} volta a ficar pendente.`,
      confirmar: 'Desfazer',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(r.id);
    try {
      await desfazerRepasse(r.id);
      avisar('Repasse desfeito');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  async function exportar() {
    try {
      await exportarPlanilha(
        `repasses-pendentes-${hojeISO()}`,
        (dados?.pendentes ?? []).map((i) => ({
          Data: dataBR(i.data_ref),
          Semana: `${dataBR(segunda(i.data_ref))} a ${dataBR(somarDias(segunda(i.data_ref), 6))}`,
          Código: i.codigo ?? 'sem cadastro',
          Produto: i.descricao,
          Tamanho: i.tamanho ?? '',
          Tipo: i.tipo === 'venda' ? 'Venda' : 'Estorno (venda cancelada)',
          Canal: ROTULO_CANAL[i.canal] ?? i.canal,
          Pertence: i.pertence,
          Parte: parte(i),
          'Valor da venda': Number(i.valor_bruto),
          'Líquido após taxa': Number(i.valor_liquido),
          'Repasse (+ Coruja paga, − Arquibancada paga)': Number(i.valor),
        })),
      );
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && (
        <>
          <Cartao>
            <T v="legenda">{rotuloSaldo(totalPendente)}</T>
            <T v="valor" estilo={{ fontSize: 28 }} cor={totalPendente > 0 ? c.primaria : totalPendente < 0 ? c.alerta : undefined}>
              {brl(Math.abs(totalPendente))}
            </T>
            <T v="legenda">Parte da Arquibancada, menos o que ela deve das vendas no site dela.</T>
            <Linha quebra>
              {admin && semanas.length > 1 && (
                <Botao
                  compacto
                  titulo="Dar baixa em tudo"
                  onPress={() => darBaixa('2000-01-01', semanas[0].fim, totalPendente, 'todas as semanas pendentes')}
                  carregando={ocupado === '2000-01-01' + semanas[0]?.fim}
                />
              )}
              <Botao compacto v="secundario" icone="download-outline" titulo="Exportar" onPress={exportar} desabilitado={!dados.pendentes.length} />
            </Linha>
          </Cartao>

          {!admin && <Aviso tipo="info" texto="Apenas administradores dão baixa." />}

          <Secao titulo="Pendente por semana">
            {semanas.length === 0 && <Vazio icone="checkmark-circle-outline" texto="Nada pendente de repasse." />}
            {semanas.map((s) => {
              const chave = s.inicio;
              const expandida = aberta === chave;
              return (
                <Cartao key={chave}>
                  <Pressable onPress={() => setAberta(expandida ? null : chave)}>
                    <Linha estilo={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <T v="forte">
                          {dataBR(s.inicio)} a {dataBR(s.fim)}
                        </T>
                        <T v="legenda">
                          {s.itens.length} item(ns){s.inicio === semanaAtual ? ' · semana atual' : ''} · {expandida ? 'ocultar' : 'ver itens'}
                        </T>
                        {s.total < 0 && <T v="legenda" cor={c.alerta}>{rotuloSaldo(s.total)}</T>}
                      </View>
                      <T v="valor" cor={s.total < 0 ? c.alerta : undefined}>{brl(Math.abs(s.total))}</T>
                    </Linha>
                  </Pressable>
                  {expandida && (
                    <View>
                      <Separador />
                      {s.itens.map((i) => (
                        <Pressable key={i.lancamento_id} onPress={() => router.push(`/venda/${i.venda_id}`)}>
                          <Linha estilo={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                            <View style={{ flex: 1 }}>
                              <T>{[i.descricao, i.tamanho, i.codigo ?? 'sem cadastro'].filter(Boolean).join(' · ')}</T>
                              <T v="legenda">
                                {dataBR(i.data_ref)} · venda {brlReais(i.valor_bruto)} · líquido {brlReais(i.valor_liquido)} · {parte(i)}
                              </T>
                              {i.canal !== 'loja' && (
                                <Etiqueta
                                  texto={ROTULO_CANAL[i.canal]}
                                  cor={i.canal === 'site_arquibancada' ? c.alerta : undefined}
                                  fundo={i.canal === 'site_arquibancada' ? c.alertaSuave : undefined}
                                />
                              )}
                            </View>
                            {i.tipo === 'estorno' ? (
                              <Etiqueta texto={`estorno ${brlReais(i.valor)}`} cor={c.perigo} fundo={c.perigoSuave} />
                            ) : (
                              <T v="forte">{brlReais(i.valor)}</T>
                            )}
                          </Linha>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {admin && (
                    <Botao
                      compacto
                      titulo={s.total < 0 ? `Dar baixa · receber ${brl(-s.total)}` : `Dar baixa ${brl(s.total)}`}
                      icone="checkmark"
                      onPress={() => darBaixa(s.inicio, s.fim, s.total, `semana de ${dataBR(s.inicio)} a ${dataBR(s.fim)}`)}
                      carregando={ocupado === s.inicio + s.fim}
                    />
                  )}
                </Cartao>
              );
            })}
          </Secao>

          <Secao titulo="Repasses feitos">
            {dados.historico.length === 0 && <T v="legenda">Nenhum repasse registrado.</T>}
            {dados.historico.map((r) => (
              <Cartao key={r.id} estilo={{ opacity: r.status === 'desfeito' ? 0.55 : 1 }}>
                <Linha estilo={{ justifyContent: 'space-between' }}>
                  <T v="forte">{brlReais(Math.abs(Number(r.valor)))}</T>
                  {r.status === 'desfeito' ? (
                    <Etiqueta texto="Desfeito" />
                  ) : (
                    <T v="legenda">{Number(r.valor) < 0 ? 'Arquibancada pagou' : 'pago'} em {dataBR(r.pago_em)}</T>
                  )}
                </Linha>
                <ParValor
                  rotulo="Período"
                  valor={r.periodo_inicio === '2000-01-01' ? `até ${dataBR(r.periodo_fim)}` : `${dataBR(r.periodo_inicio)} a ${dataBR(r.periodo_fim)}`}
                />
                {r.observacoes && <T v="legenda">{r.observacoes}</T>}
                {admin && r.status === 'pago' && (
                  <Botao compacto v="fantasma" titulo="Desfazer" onPress={() => desfazer(r)} carregando={ocupado === r.id} />
                )}
              </Cartao>
            ))}
          </Secao>
        </>
      )}
    </Tela>
  );
}

function FormBaixa({ rotulo, inicial, onMudar }: { rotulo: string; inicial: string; onMudar: (obs: string, data: string) => void }) {
  const [obs, setObs] = useState('');
  const [data, setData] = useState(inicial);
  return (
    <View style={{ gap: ESPACO.sm }}>
      <T>Repasse da {rotulo}.</T>
      <Campo rotulo="Data do pagamento" value={data} onChangeText={(t) => { setData(t); onMudar(obs, t); }} keyboardType="numbers-and-punctuation" />
      <Campo rotulo="Observação (opcional)" value={obs} onChangeText={(t) => { setObs(t); onMudar(t, data); }} />
    </View>
  );
}
