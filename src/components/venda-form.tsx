// Formulário único de venda: usado pela Baixa Rápida, pela venda com vários
// itens e pela venda avulsa (item sem cadastro, ex.: isqueiros). As regras
// finais (status, taxa, divisão, idempotência) ficam no banco (registrar_venda).
// Canal (loja, site Coruja, site Arquibancada) e forma são escolhidos à parte;
// a taxa vem da combinação. No site da Arquibancada o dinheiro entra na conta
// dela: a parte da Coruja abate o repasse. Dinheiro (só na loja) não tem
// taxa: o líquido é o valor da venda e a divisão segue as regras de sempre.
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { buscarPorCodigo, listarConsignantes, listarTaxas, obterVenda, registrarVenda, type ItemVenda } from '@/lib/api';
import { guardarRecentes, lerRecentes, type AvulsoRecente } from '@/lib/avulsos-recentes';
import { brl, calcularVenda, centavosParaTexto, dividirLiquido, efeitoRepasse, lerValor, paraCentavos, paraReais, type Canal, type Divisao } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import {
  CANAIS, PERTENCE, ROTULO_CANAL, ROTULO_FORMA, dataBR, formasDoCanal, hojeISO,
  type Consignante, type FormaPagamento, type Pertence, type Produto, type Taxa,
} from '@/lib/tipos';
import { verificarAlertasSite } from './alerta-site';
import { useDialogos } from './dialogos';
import { Selecao } from './selecao';
import { Aviso, Botao, BotaoIcone, Campo, Cartao, Chip, Chips, Etiqueta, Foto, Linha, ParValor, Secao, Selo, Separador, T } from './ui';

type ItemProduto = { tipo: 'produto'; chave: string; produto: Produto; valorTexto: string };
type ItemAvulso = {
  tipo: 'avulso';
  chave: string;
  descricao: string;
  quantidade: number;
  valorTexto: string; // valor unitário
  pertence: Pertence | null;
  consignanteId: string | null;
};
type Item = ItemProduto | ItemAvulso;

const novoAvulso = (r?: AvulsoRecente): ItemAvulso => ({
  tipo: 'avulso',
  chave: randomUUID(),
  descricao: r?.descricao ?? '',
  quantidade: 1,
  valorTexto: r?.valor ?? '',
  pertence: r?.pertence ?? null,
  consignanteId: null,
});

const nomeItem = (i: Item) => (i.tipo === 'produto' ? i.produto.descricao : i.descricao.trim() || 'Item sem cadastro');

export function VendaForm({
  multi,
  codigoInicial,
  origem,
  avulsoInicial,
  recarga = 0,
}: {
  multi: boolean;
  codigoInicial?: string;
  origem: 'venda' | 'baixa_rapida';
  /** Começa com um item sem cadastro (tela de venda avulsa). */
  avulsoInicial?: boolean;
  /** Muda ao puxar a tela para baixo: recarrega taxas e status dos produtos. */
  recarga?: number;
}) {
  const c = useCores();
  const { avisar, confirmar } = useDialogos();
  const [codigo, setCodigo] = useState(codigoInicial ?? '');
  const [buscando, setBuscando] = useState(false);
  const [msgBusca, setMsgBusca] = useState<{ texto: string; produto?: Produto } | null>(null);
  const [itens, setItens] = useState<Item[]>(() => (avulsoInicial ? [novoAvulso()] : []));
  const [recentes, setRecentes] = useState<AvulsoRecente[]>(() => lerRecentes());
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [consignantes, setConsignantes] = useState<Consignante[]>([]);
  const [canal, setCanal] = useState<Canal>('loja');
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [cliente, setCliente] = useState('');
  const [obs, setObs] = useState('');
  const [data, setData] = useState(dataBR(hojeISO()));
  const [pendente, setPendente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [concluida, setConcluida] = useState<any | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  // Mesma chave em reenvios: se a 1ª tentativa chegou ao banco mas a
  // resposta se perdeu, a 2ª devolve a mesma venda em vez de duplicar.
  const chave = useRef(randomUUID());

  const itensRef = useRef(itens);
  useEffect(() => {
    itensRef.current = itens;
  });

  useEffect(() => {
    let vivo = true;
    Promise.all([listarTaxas(), listarConsignantes()])
      .then(([t, cs]) => {
        if (!vivo) return;
        setTaxas(t);
        setConsignantes(cs);
        setErroCarga(null);
      })
      .catch((e) => vivo && setErroCarga(mensagemErro(e)));
    // Ao recarregar, atualiza os produtos já adicionados (status/preço podem ter mudado).
    const produtos = itensRef.current.filter((i): i is ItemProduto => i.tipo === 'produto');
    if (recarga > 0 && produtos.length) {
      Promise.all(produtos.map((i) => buscarPorCodigo(i.produto.codigo)))
        .then((ps) => {
          if (!vivo) return;
          setItens((atual) =>
            atual.map((it) => (it.tipo === 'produto' ? { ...it, produto: ps.find((p) => p?.id === it.produto.id) ?? it.produto } : it)),
          );
        })
        .catch(() => {});
    }
    return () => {
      vivo = false;
    };
  }, [recarga]);

  useEffect(() => {
    if (codigoInicial) buscar(codigoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInicial]);

  function alterar(k: number, patch: Partial<ItemAvulso> | Partial<ItemProduto>) {
    setItens((l) => l.map((it, j) => (j === k ? ({ ...it, ...patch } as Item) : it)));
  }

  function adicionarAvulso() {
    setItens((l) => (multi ? [...l, novoAvulso()] : [novoAvulso()]));
    setMsgBusca(null);
  }

  async function buscar(texto = codigo) {
    if (!texto.trim()) return;
    setBuscando(true);
    setMsgBusca(null);
    try {
      const p = await buscarPorCodigo(texto);
      if (!p) {
        setMsgBusca({ texto: `Código ${texto.trim().toUpperCase()} não encontrado.` });
      } else if (itens.some((i) => i.tipo === 'produto' && i.produto.id === p.id)) {
        setMsgBusca({ texto: `${p.codigo} já está nesta venda.` });
      } else if (p.status !== 'Disponível' || p.arquivado) {
        setMsgBusca({ texto: `${p.codigo} está ${p.arquivado ? 'arquivado' : p.status.toLowerCase()}.`, produto: p });
      } else {
        const novo: ItemProduto = { tipo: 'produto', chave: p.id, produto: p, valorTexto: centavosParaTexto(paraCentavos(p.preco_venda)) };
        setItens(multi ? [...itens, novo] : [novo]);
        setCodigo('');
      }
    } catch (e) {
      setMsgBusca({ texto: mensagemErro(e) });
    } finally {
      setBuscando(false);
    }
  }

  const taxa = taxas.find((t) => t.canal === canal && t.forma === forma);
  const taxasDoCanal = taxas.filter((t) => t.canal === canal);
  const semTaxa = forma === 'dinheiro'; // banco força 0%; não há linha em taxas
  const pct = semTaxa ? 0 : (taxa?.percentual ?? 0);
  const rotuloTaxa = forma
    ? `Taxa ${canal === 'loja' ? '' : `${ROTULO_CANAL[canal]} · `}${ROTULO_FORMA[forma]} (${pct.toLocaleString('pt-BR')}%)`
    : 'Taxa';

  const calc = useMemo(() => {
    return itens.map((i) => {
      const unit = lerValor(i.valorTexto);
      if (i.tipo === 'avulso') {
        const valor = unit === null ? null : unit * i.quantidade;
        const r = valor === null ? null : calcularVenda({ precoPadrao: valor, valorBruto: valor, custo: null, taxaPercentual: pct });
        const cons = i.pertence === 'Concessão' ? consignantes.find((x) => x.id === i.consignanteId) : undefined;
        const acordo = cons ? { tipo: cons.tipo_acordo, valor: Number(cons.valor_acordo), marcaRestante: cons.marca_restante } : null;
        const div = r && i.pertence ? dividirLiquido(r.liquido, i.pertence, acordo) : null;
        return { valor, r, div, consignante: cons };
      }
      const valor = unit;
      const preco = paraCentavos(i.produto.preco_venda)!;
      const r = valor === null ? null : calcularVenda({ precoPadrao: preco, valorBruto: valor, custo: paraCentavos(i.produto.custo), taxaPercentual: pct });
      const cons = consignantes.find((x) => x.id === i.produto.consignante_id);
      const acordo = cons
        ? {
            tipo: (i.produto.acordo_tipo ?? cons.tipo_acordo) as 'percentual' | 'fixo',
            valor: Number(i.produto.acordo_valor ?? cons.valor_acordo),
            marcaRestante: cons.marca_restante,
          }
        : null;
      const div = r ? dividirLiquido(r.liquido, i.produto.pertence, acordo) : null;
      return { valor, r, div, consignante: cons };
    });
  }, [itens, pct, consignantes]);

  const totais = calc.reduce(
    (t, x) => {
      if (!x.r || !x.div) return t;
      return {
        bruto: t.bruto + x.r.bruto,
        desconto: t.desconto + x.r.desconto,
        taxa: t.taxa + x.r.taxa,
        liquido: t.liquido + x.r.liquido,
        lucro: t.lucro + x.r.lucroBruto,
        resultado: t.resultado + x.r.resultado,
        div: { coruja: t.div.coruja + x.div.coruja, arquibancada: t.div.arquibancada + x.div.arquibancada, consignante: t.div.consignante + x.div.consignante },
        repasse: t.repasse + efeitoRepasse(x.div, canal),
      };
    },
    { bruto: 0, desconto: 0, taxa: 0, liquido: 0, lucro: 0, resultado: 0, div: { coruja: 0, arquibancada: 0, consignante: 0 } as Divisao, repasse: 0 },
  );

  function dataISO(): string | null {
    const m = data.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  }

  const problemas: string[] = [];
  if (!itens.length) problemas.push('Adicione um item');
  itens.forEach((i, k) => {
    if (i.tipo === 'avulso') {
      if (!i.descricao.trim()) problemas.push('Informe a descrição do item sem cadastro');
      if (calc[k].valor === null || calc[k].valor! <= 0) problemas.push(`Informe o valor de ${nomeItem(i)}`);
      if (!i.pertence) problemas.push(`Escolha a quem pertence ${nomeItem(i)}`);
      if (i.pertence === 'Concessão' && !i.consignanteId) problemas.push(`Escolha o proprietário de ${nomeItem(i)}`);
    } else {
      if (calc[k].valor === null || calc[k].valor! < 0) problemas.push(`Valor inválido em ${i.produto.codigo}`);
      if (i.produto.pertence === 'Concessão' && !i.produto.consignante_id) problemas.push(`${i.produto.codigo}: concessão sem proprietário`);
      if (i.produto.status !== 'Disponível') problemas.push(`${i.produto.codigo} não está mais disponível (${i.produto.status})`);
    }
  });
  if (!forma) problemas.push('Escolha a forma de pagamento');
  if (!dataISO()) problemas.push('Data da venda no formato DD/MM/AAAA');

  async function concluir() {
    if (problemas.length) return avisar(problemas[0], 'erro');
    const ok = await confirmar({
      titulo: 'Confirmar venda?',
      confirmar: `Vender por ${brl(totais.bruto)}`,
      conteudo: (
        <View style={{ gap: 2 }}>
          {itens.map((i, k) => (
            <ParValor
              key={i.chave}
              rotulo={i.tipo === 'produto' ? `${i.produto.descricao} · ${i.produto.tamanho ?? '—'}` : `${i.quantidade}× ${nomeItem(i)}`}
              valor={brl(calc[k].valor)}
            />
          ))}
          <Separador />
          {canal !== 'loja' && <ParValor rotulo="Canal" valor={ROTULO_CANAL[canal]} />}
          <ParValor rotulo="Forma de pagamento" valor={ROTULO_FORMA[forma!]} />
          {totais.desconto !== 0 && <ParValor rotulo="Desconto" valor={brl(totais.desconto)} />}
          {!semTaxa && <ParValor rotulo={`Taxa (${pct.toLocaleString('pt-BR')}%)`} valor={`− ${brl(totais.taxa)}`} />}
          <ParValor rotulo="Cliente paga" valor={brl(totais.bruto)} destaque />
          <ParValor rotulo={`${canal === 'site_arquibancada' ? 'Arquibancada' : 'Coruja'} recebe (líquido)`} valor={brl(totais.liquido)} destaque />
          {pendente && <Aviso texto="Pendente: baixe ao receber." />}
          {itens.some((i) => i.tipo === 'produto' && i.produto.cadastrado_site) && <Aviso tipo="info" texto="Lembrete: remover do site." />}
          <RepasseLinha valor={totais.repasse} />
        </View>
      ),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const payload: ItemVenda[] = itens.map((i, k) =>
        i.tipo === 'produto'
          ? { produto_id: i.produto.id, valor_bruto: paraReais(calc[k].valor!) }
          : {
              descricao: i.descricao.trim(),
              quantidade: i.quantidade,
              valor_bruto: paraReais(calc[k].valor!),
              pertence: i.pertence!,
              consignante_id: i.pertence === 'Concessão' ? i.consignanteId : null,
            },
      );
      const id = await registrarVenda({
        chave: chave.current,
        itens: payload,
        forma: forma!,
        data: dataISO(),
        cliente,
        observacoes: obs,
        pendente,
        origem: itens.every((i) => i.tipo === 'avulso') ? 'avulsa' : origem,
        canal,
      });
      const avulsos = itens.filter((i): i is ItemAvulso => i.tipo === 'avulso');
      if (avulsos.length) {
        guardarRecentes(avulsos.map((a) => ({ descricao: a.descricao.trim(), valor: a.valorTexto, pertence: a.pertence! })));
        setRecentes(lerRecentes());
      }
      setConcluida(await obterVenda(id));
      chave.current = randomUUID();
      verificarAlertasSite();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setItens(avulsoInicial ? [novoAvulso()] : []);
    setForma(null);
    setCanal('loja');
    setCliente('');
    setObs('');
    setPendente(false);
    setData(dataBR(hojeISO()));
    setConcluida(null);
    setMsgBusca(null);
    setCodigo('');
  }

  if (concluida) {
    const v = concluida.venda;
    return (
      <View style={{ gap: ESPACO.lg }}>
        <Aviso tipo="sucesso" texto="Venda registrada." />
        <Cartao>
          {concluida.itens.map((i: any) => (
            <Linha key={i.id} gap={ESPACO.md}>
              <Foto path={i.produto?.foto_path} tamanho={44} />
              <View style={{ flex: 1 }}>
                <T v="forte" linhas={1}>{i.produto ? i.produto.descricao : `${i.quantidade}× ${i.descricao}`}</T>
                <T v="legenda">{i.produto ? `${i.produto.codigo} · Tam. ${i.produto.tamanho ?? '—'}` : `Sem cadastro · ${i.pertence}`}</T>
              </View>
              {i.produto ? <Selo status="Vendida" /> : <T v="forte">{brl(paraCentavos(i.valor_bruto))}</T>}
            </Linha>
          ))}
          <Separador />
          <ParValor rotulo="Valor da venda" valor={brl(paraCentavos(v.valor_bruto))} destaque />
          <ParValor rotulo={`Taxa (${Number(v.taxa_percentual).toLocaleString('pt-BR')}%)`} valor={brl(paraCentavos(v.taxa_valor))} />
          <ParValor rotulo="Líquido" valor={brl(paraCentavos(v.valor_liquido))} destaque />
        </Cartao>
        {(() => {
          // Quem ficou com o dinheiro deve à outra marca a parte dela (repasse semanal).
          const soma = (b: (x: string) => boolean) =>
            concluida.lancamentos.filter((l: any) => b(l.beneficiario)).reduce((s: number, l: any) => s + (paraCentavos(l.valor) ?? 0), 0);
          const repasse = v.canal === 'site_arquibancada' ? 0 - soma((b) => b === 'coruja') : soma((b) => b === 'arquibancada');
          return repasse !== 0 ? (
            <Aviso
              tipo="info"
              texto={repasse > 0 ? `A repassar à Arquibancada: ${brl(repasse)}` : `Arquibancada deve à Coruja: ${brl(-repasse)}`}
              acao={<Botao compacto v="secundario" titulo="Repasses" onPress={() => router.push('/repasses')} />}
            />
          ) : null;
        })()}
        <Botao titulo={avulsoInicial ? 'Nova venda avulsa' : origem === 'baixa_rapida' ? 'Nova baixa' : 'Nova venda'} icone="add" onPress={reiniciar} />
        <Botao v="secundario" titulo="Ver venda" onPress={() => router.push(`/venda/${v.id}`)} />
      </View>
    );
  }

  return (
    <View style={{ gap: ESPACO.lg }}>
      {erroCarga && <Aviso tipo="perigo" texto={erroCarga} />}

      {(multi || itens.length === 0) && (
        <Secao titulo={multi ? 'Adicionar item' : 'Código da etiqueta'}>
          <Linha estilo={{ alignItems: 'flex-end' }}>
            <Campo
              placeholder="Ex.: M1386"
              value={codigo}
              onChangeText={setCodigo}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={() => buscar()}
              returnKeyType="search"
              autoFocus={!codigoInicial && !avulsoInicial}
              style={{ fontSize: 20, fontWeight: '700', letterSpacing: 1 }}
            />
            <Botao titulo="Buscar" icone="search" onPress={() => buscar()} carregando={buscando} />
          </Linha>
          <Linha quebra>
            <Botao compacto v="fantasma" icone="scan-outline" titulo="Escanear tag" onPress={() => router.push('/scanner')} />
            <Botao compacto v="fantasma" icone="flame-outline" titulo="Item sem cadastro" onPress={adicionarAvulso} />
          </Linha>
          {msgBusca && (
            <Aviso
              tipo="alerta"
              texto={msgBusca.texto}
              acao={msgBusca.produto ? <Botao compacto v="secundario" titulo="Abrir" onPress={() => router.push(`/produto/${msgBusca.produto!.id}`)} /> : undefined}
            />
          )}
        </Secao>
      )}

      {itens.map((i, k) => {
        const x = calc[k];
        const remover = <BotaoIcone icone="close" rotulo="Remover" onPress={() => setItens(itens.filter((_, j) => j !== k))} />;

        if (i.tipo === 'avulso') {
          return (
            <Cartao key={i.chave}>
              <Linha estilo={{ justifyContent: 'space-between' }}>
                <Etiqueta texto="Item sem cadastro" />
                {remover}
              </Linha>
              {!i.descricao && recentes.length > 0 && (
                <View style={{ gap: 6 }}>
                  <T v="legenda">Recentes</T>
                  <Linha quebra gap={6}>
                    {recentes.map((r) => (
                      <Chip
                        key={`${r.descricao}|${r.pertence}`}
                        titulo={`${r.descricao} · ${brl(lerValor(r.valor))}`}
                        ativo={false}
                        onPress={() => alterar(k, { descricao: r.descricao, valorTexto: r.valor, pertence: r.pertence })}
                      />
                    ))}
                  </Linha>
                </View>
              )}
              <Campo rotulo="Descrição" value={i.descricao} onChangeText={(t) => alterar(k, { descricao: t })} placeholder="Ex.: Isqueiro Clipper" />
              <Linha estilo={{ alignItems: 'flex-end' }}>
                <View style={{ gap: 4 }}>
                  <T v="legenda">Quantidade</T>
                  <Linha gap={4}>
                    <Botao compacto v="secundario" titulo="−" onPress={() => alterar(k, { quantidade: Math.max(1, i.quantidade - 1) })} estilo={{ minWidth: 44, minHeight: 46 }} />
                    <T v="valor" estilo={{ minWidth: 36, textAlign: 'center' }}>{i.quantidade}</T>
                    <Botao compacto v="secundario" titulo="+" onPress={() => alterar(k, { quantidade: i.quantidade + 1 })} estilo={{ minWidth: 44, minHeight: 46 }} />
                  </Linha>
                </View>
                <Campo
                  rotulo={i.quantidade > 1 ? 'Valor unitário (R$)' : 'Valor (R$)'}
                  value={i.valorTexto}
                  onChangeText={(t) => alterar(k, { valorTexto: t })}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  style={{ fontSize: 20, fontWeight: '700' }}
                />
              </Linha>
              <Chips rotulo="Pertence" opcoes={PERTENCE} valor={i.pertence} onChange={(v) => alterar(k, { pertence: v })} />
              {i.pertence === 'Concessão' && (
                <Selecao
                  rotulo="Proprietário"
                  opcoes={consignantes.map((cs) => ({ valor: cs.id, rotulo: cs.nome }))}
                  valor={i.consignanteId}
                  onChange={(v) => alterar(k, { consignanteId: v })}
                />
              )}
              {x.r && (
                <>
                  <Separador />
                  {i.quantidade > 1 && <ParValor rotulo={`Total (${i.quantidade} × ${brl(lerValor(i.valorTexto))})`} valor={brl(x.r.bruto)} destaque />}
                  {forma && !semTaxa && <ParValor rotulo={rotuloTaxa} valor={`− ${brl(x.r.taxa)}`} />}
                  {forma && <ParValor rotulo="Líquido" valor={brl(x.r.liquido)} destaque />}
                  {forma && x.div && <DivisaoLinha div={x.div} />}
                  {forma && x.div && canal === 'site_arquibancada' && <RepasseLinha valor={efeitoRepasse(x.div, canal)} />}
                </>
              )}
            </Cartao>
          );
        }

        return (
          <Cartao key={i.chave}>
            <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
              <Pressable onPress={() => router.push(`/produto/${i.produto.id}`)}>
                <Foto path={i.produto.foto_path} tamanho={72} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Linha estilo={{ justifyContent: 'space-between' }}>
                  <T v="forte" estilo={{ flex: 1, fontSize: 17 }}>{i.produto.descricao}</T>
                  {remover}
                </Linha>
                <T v="legenda">{i.produto.codigo} · Tam. {i.produto.tamanho ?? '—'} · {i.produto.pertence}{x.consignante ? ` (${x.consignante.nome})` : ''}</T>
                <Selo status={i.produto.status} />
              </View>
            </Linha>
            <Separador />
            <ParValor rotulo="Preço padrão" valor={brl(paraCentavos(i.produto.preco_venda))} />
            <Campo
              rotulo="Valor da venda (R$)"
              value={i.valorTexto}
              onChangeText={(t) => alterar(k, { valorTexto: t })}
              keyboardType="decimal-pad"
              selectTextOnFocus
              erro={x.valor === null ? 'Valor inválido' : null}
              style={{ fontSize: 20, fontWeight: '700' }}
            />
            {x.r && x.r.desconto !== 0 && (
              <ParValor
                rotulo={x.r.desconto > 0 ? 'Desconto' : 'Acréscimo'}
                valor={`${brl(Math.abs(x.r.desconto))}${x.r.descontoPct !== null ? ` (${Math.abs(x.r.descontoPct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}`}
                cor={x.r.desconto > 0 ? c.alerta : undefined}
              />
            )}
            {x.r && forma && (
              <>
                {!semTaxa && <ParValor rotulo={rotuloTaxa} valor={`− ${brl(x.r.taxa)}`} />}
                <ParValor rotulo="Líquido" valor={brl(x.r.liquido)} destaque />
                <ParValor rotulo="Custo" valor={x.r.custoInformado ? brl(paraCentavos(i.produto.custo)) : 'não informado'} />
                <ParValor rotulo="Lucro bruto" valor={brl(x.r.lucroBruto)} />
                <ParValor rotulo="Resultado" valor={brl(x.r.resultado)} cor={x.r.resultado < 0 ? c.perigo : c.primaria} destaque />
                {x.div && <DivisaoLinha div={x.div} />}
                {x.div && canal === 'site_arquibancada' && <RepasseLinha valor={efeitoRepasse(x.div, canal)} />}
              </>
            )}
          </Cartao>
        );
      })}

      {itens.length > 0 && (
        <>
          <Secao titulo="Pagamento">
            <Chips
              opcoes={CANAIS}
              rotulos={ROTULO_CANAL}
              valor={canal}
              onChange={(v) => {
                const novo = v ?? 'loja';
                setCanal(novo);
                // Dinheiro só existe na loja: ao trocar para o site, escolhe de novo.
                if (forma && !formasDoCanal(novo).includes(forma)) setForma(null);
              }}
            />
            <Chips
              opcoes={formasDoCanal(canal)}
              rotulos={{
                ...Object.fromEntries(taxasDoCanal.map((t) => [t.forma, `${t.rotulo} · ${t.percentual.toLocaleString('pt-BR')}%`])),
                dinheiro: ROTULO_FORMA.dinheiro,
              }}
              valor={forma}
              onChange={setForma}
            />
            {canal === 'site_arquibancada' && <Aviso tipo="info" texto="Entra na conta da Arquibancada. A parte da Coruja abate o repasse." />}
            <Chips
              opcoes={['recebido', 'pendente'] as const}
              rotulos={{ recebido: taxa?.liquidacao === 'proximo_dia_util' ? 'Pago (cai no próximo dia útil)' : 'Pago agora', pendente: 'Pagamento pendente' }}
              valor={pendente ? 'pendente' : 'recebido'}
              onChange={(v) => setPendente(v === 'pendente')}
            />
          </Secao>

          <Secao titulo="Detalhes">
            <Linha quebra estilo={{ alignItems: 'flex-start' }}>
              <Campo rotulo="Cliente (opcional)" value={cliente} onChangeText={setCliente} />
              <Campo rotulo="Data da venda" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
            </Linha>
            <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline />
          </Secao>

          {itens.length > 1 && forma && (
            <Cartao>
              <T v="forte">Totais</T>
              <ParValor rotulo="Cliente paga" valor={brl(totais.bruto)} destaque />
              {!semTaxa && <ParValor rotulo="Taxas" valor={`− ${brl(totais.taxa)}`} />}
              <ParValor rotulo="Líquido" valor={brl(totais.liquido)} destaque />
              <ParValor rotulo="Resultado" valor={brl(totais.resultado)} />
              <DivisaoLinha div={totais.div} />
              <RepasseLinha valor={totais.repasse} />
            </Cartao>
          )}

          {problemas.length > 0 && <T v="legenda" cor={c.alerta}>{problemas[0]}</T>}
          <Botao titulo="Revisar venda" icone="checkmark-done" onPress={concluir} carregando={enviando} desabilitado={problemas.length > 0} />
        </>
      )}
    </View>
  );
}

/** Efeito da venda no repasse semanal (positivo: Coruja deve; negativo: Arquibancada deve). */
function RepasseLinha({ valor }: { valor: number }) {
  if (valor === 0) return null;
  return valor > 0
    ? <ParValor rotulo="A repassar à Arquibancada" valor={brl(valor)} />
    : <ParValor rotulo="Abate do repasse" valor={brl(-valor)} />;
}

function DivisaoLinha({ div }: { div: Divisao }) {
  const partes = [
    div.coruja ? `Coruja ${brl(div.coruja)}` : null,
    div.arquibancada ? `Arquibancada ${brl(div.arquibancada)}` : null,
    div.consignante ? `Proprietário ${brl(div.consignante)}` : null,
  ].filter(Boolean);
  return <ParValor rotulo="Divisão" valor={partes.join(' · ') || '—'} />;
}
