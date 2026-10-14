import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { CategoriaSelect } from '@/components/categoria-select';
import { useDialogos } from '@/components/dialogos';
import { OPCOES_TAMANHO } from '@/components/produto-form';
import { GrupoLinha } from '@/components/produto-linha';
import { Selecao } from '@/components/selecao';
import { Botao, BotaoIcone, Campo, Carregando, Chips, ErroCaixa, Linha, T, Vazio } from '@/components/ui';
import { listarGrupos, todosProdutos, type FiltrosEstoque, type GrupoProduto } from '@/lib/api';
import { exportarPlanilha } from '@/lib/exportar';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, LARGURA_MAX, useCores } from '@/lib/tema';
import { CONDICOES, PERTENCE, ROTULO_FORMA, STATUS, TIPOS, dataBR, rotuloSite } from '@/lib/tipos';

export default function Estoque() {
  const c = useCores();
  const navigation = useNavigation();
  const { avisar, confirmar } = useDialogos();
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<FiltrosEstoque>({});
  const [abertos, setAbertos] = useState(false);
  const [grupos, setGrupos] = useState<GrupoProduto[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [puxando, setPuxando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const seq = useRef(0);

  const chaveFiltros = JSON.stringify({ ...filtros, busca });

  const carregar = useCallback(
    async (pag: number) => {
      const n = ++seq.current;
      setCarregando(true);
      setErro(null);
      try {
        const r = await listarGrupos(JSON.parse(chaveFiltros) as FiltrosEstoque, pag);
        if (n !== seq.current) return;
        setGrupos((atual) => (pag === 0 ? r.grupos : [...atual, ...r.grupos]));
        setTotal(r.total);
        setTemMais(r.temMais);
        setPagina(pag);
      } catch (e) {
        if (n === seq.current) setErro(mensagemErro(e));
      } finally {
        if (n === seq.current) setCarregando(false);
      }
    },
    [chaveFiltros],
  );
  const carregarRef = useRef(carregar);
  useEffect(() => {
    carregarRef.current = carregar;
  });

  // Busca com pequeno atraso enquanto digita.
  useEffect(() => {
    const t = setTimeout(() => carregar(0), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  // Ao voltar para a tela, atualiza a lista com os filtros atuais.
  useFocusEffect(
    useCallback(() => {
      carregarRef.current(0);
    }, []),
  );

  async function puxarParaAtualizar() {
    setPuxando(true);
    await carregar(0);
    setPuxando(false);
  }

  const exportarRef = useRef<() => void>(() => {});
  useEffect(() => {
    exportarRef.current = async () => {
      let formato: 'xlsx' | 'csv' = 'xlsx';
      const ok = await confirmar({
        titulo: 'Exportar estoque',
        mensagem: 'Unidades do filtro atual.',
        conteudo: <EscolhaFormato onChange={(f) => (formato = f)} />,
        confirmar: 'Exportar',
      });
      if (!ok) return;
      try {
        const todos = await todosProdutos(JSON.parse(chaveFiltros) as FiltrosEstoque);
        await exportarPlanilha(
          `estoque-${new Date().toISOString().slice(0, 10)}`,
          todos.map((p) => ({
            Descrição: p.descricao,
            Código: p.codigo,
            Tamanho: p.tamanho ?? '',
            Cor: p.cor ?? '',
            Categoria: p.categoria ?? '',
            Tipo: p.tipo ?? '',
            Condição: p.condicao ?? '',
            Pertence: p.pertence,
            Consignante: p.consignante_nome ?? '',
            Custo: p.custo === null ? '' : Number(p.custo),
            'Preço de venda': Number(p.preco_venda),
            'Lucro estimado': Number(p.lucro_estimado),
            Status: p.status,
            'Forma de pagamento': p.forma_venda ? ROTULO_FORMA[p.forma_venda] : '',
            'Valor vendido': p.valor_vendido == null ? '' : Number(p.valor_vendido),
            'Taxa (%)': p.taxa_venda_percentual ?? '',
            'Taxa (R$)': p.taxa_venda_valor ?? '',
            'Data da venda': p.data_venda ? dataBR(p.data_venda) : '',
            'Cadastrado no site': rotuloSite(p.cadastrado_site),
            Observações: p.observacoes ?? '',
          })),
          formato,
        );
      } catch (e) {
        avisar(mensagemErro(e), 'erro');
      }
    };
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ marginRight: ESPACO.md }}>
          <BotaoIcone icone="download-outline" rotulo="Exportar estoque" onPress={() => exportarRef.current()} />
        </View>
      ),
    });
  }, [navigation]);

  const set = <K extends keyof FiltrosEstoque>(k: K) => (v: FiltrosEstoque[K] | null) => setFiltros((f) => ({ ...f, [k]: v }));
  const qtdFiltros = Object.values(filtros).filter(Boolean).length;

  const cabecalho = (
    <View style={{ gap: ESPACO.md, paddingBottom: ESPACO.sm }}>
      <Linha>
        <Campo
          placeholder="Buscar descrição ou código"
          value={busca}
          onChangeText={setBusca}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <Botao
          compacto
          v={qtdFiltros ? 'primario' : 'secundario'}
          icone="options-outline"
          titulo={qtdFiltros ? String(qtdFiltros) : 'Filtros'}
          onPress={() => setAbertos(!abertos)}
          estilo={{ minHeight: 46 }}
        />
      </Linha>
      {abertos && (
        <View style={{ gap: ESPACO.md, padding: ESPACO.md, backgroundColor: c.superficie, borderRadius: 12, borderWidth: 1, borderColor: c.borda }}>
          <Linha quebra estilo={{ alignItems: 'flex-start' }}>
            <CategoriaSelect valor={filtros.prefixo} onChange={set('prefixo')} permiteVazio incluirArquivadas />
            <Selecao rotulo="Tamanho" placeholder="Todos" opcoes={OPCOES_TAMANHO} valor={filtros.tamanho} onChange={set('tamanho')} permiteVazio />
          </Linha>
          <Chips rotulo="Status" opcoes={STATUS} valor={filtros.status} onChange={set('status')} permiteVazio />
          <Chips rotulo="Tipo" opcoes={TIPOS} valor={filtros.tipo} onChange={set('tipo')} permiteVazio />
          <Chips rotulo="Condição" opcoes={CONDICOES} valor={filtros.condicao} onChange={set('condicao')} permiteVazio />
          <Chips rotulo="Pertence" opcoes={PERTENCE} valor={filtros.pertence} onChange={set('pertence')} permiteVazio />
          <Chips
            rotulo="Cadastrado no site"
            opcoes={['sim', 'nao', 'nv'] as const}
            rotulos={{ sim: 'Sim', nao: 'Não', nv: 'Não verificado' }}
            valor={filtros.site}
            onChange={set('site')}
            permiteVazio
          />
          {qtdFiltros > 0 && <Botao compacto v="fantasma" titulo="Limpar filtros" onPress={() => setFiltros({})} />}
        </View>
      )}
      {erro && <ErroCaixa erro={erro} onTentar={() => carregar(0)} />}
      {!erro && (
        <T v="legenda">{carregando && pagina === 0 && !puxando ? 'Buscando…' : `${total} ${total === 1 ? 'produto' : 'produtos'}`}</T>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.fundo }}
      contentContainerStyle={{ padding: ESPACO.lg, gap: ESPACO.sm, width: '100%', maxWidth: LARGURA_MAX, alignSelf: 'center' }}
      data={grupos}
      keyExtractor={(g) => g.grupo}
      ListHeaderComponent={cabecalho}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={puxarParaAtualizar} />}
      renderItem={({ item }) => (
        <GrupoLinha
          g={item}
          onPress={() =>
            item.produto_unico
              ? router.push(`/produto/${item.produto_unico}`)
              : router.push({ pathname: '/grupo', params: { g: item.grupo } })
          }
        />
      )}
      ListEmptyComponent={!carregando && !erro ? <Vazio texto="Nenhum produto encontrado." /> : null}
      ListFooterComponent={
        carregando && pagina > 0 ? <Carregando /> : temMais ? <Botao v="secundario" titulo="Carregar mais" onPress={() => carregar(pagina + 1)} /> : null
      }
      onEndReached={() => temMais && !carregando && carregar(pagina + 1)}
      onEndReachedThreshold={0.5}
    />
  );
}

function EscolhaFormato({ onChange }: { onChange: (f: 'xlsx' | 'csv') => void }) {
  const [f, setF] = useState<'xlsx' | 'csv'>('xlsx');
  return (
    <Chips
      opcoes={['xlsx', 'csv'] as const}
      rotulos={{ xlsx: 'Excel (XLSX)', csv: 'CSV' }}
      valor={f}
      onChange={(v) => {
        if (v) {
          setF(v);
          onChange(v);
        }
      }}
    />
  );
}
