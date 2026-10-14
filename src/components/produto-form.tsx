import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import { listarConsignantes, obterProduto, sugerirModelos, type DadosProduto, type ModeloSugerido } from '@/lib/api';
import { brl, centavosParaTexto, lerValor, paraReais } from '@/lib/dinheiro';
import { escolherFoto } from '@/lib/fotos';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import {
  CONDICOES, PERTENCE, TAMANHOS_ADULTO, TAMANHOS_INFANTIL, TIPOS,
  type Condicao, type Consignante, type Pertence, type Produto, type Tipo,
} from '@/lib/tipos';
import { CategoriaSelect } from './categoria-select';
import { useDialogos } from './dialogos';
import { Selecao } from './selecao';
import { TamanhosCodigos, type CodigosRef } from './tamanhos-codigos';
import { Aviso, Botao, Campo, Cartao, Chips, Foto, Linha, Secao, T } from './ui';

export interface ValoresForm {
  dados: DadosProduto & { prefixo: string };
  tamanhos: string[]; // um por unidade (5 no M = ['M','M','M','M','M'])
  codigos: string[]; // um por unidade
  fotoLocal: string | null; // nova foto escolhida (ainda não enviada)
}

const TODOS_TAMANHOS = [...TAMANHOS_ADULTO, ...TAMANHOS_INFANTIL, 'Único'];
const MAX_UNIDADES = 50;
export const OPCOES_TAMANHO = [
  ...TAMANHOS_ADULTO.map((t) => ({ valor: t, rotulo: t })),
  ...TAMANHOS_INFANTIL.map((t) => ({ valor: t, rotulo: `${t} (infantil)` })),
  { valor: 'Único', rotulo: 'Único' },
];
const ordenar = (ts: string[]) =>
  [...ts].sort((a, b) => {
    const ia = TODOS_TAMANHOS.indexOf(a);
    const ib = TODOS_TAMANHOS.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

function Erro({ texto }: { texto?: string }) {
  const c = useCores();
  return texto ? <T v="legenda" cor={c.perigo}>{texto}</T> : null;
}

export function ProdutoForm({
  inicial,
  modo,
  salvando,
  recarga = 0,
  onSalvar,
}: {
  inicial?: Produto;
  modo: 'novo' | 'editar';
  salvando: boolean;
  /** Muda ao puxar a tela para baixo: recarrega categorias, sugestões e consignantes. */
  recarga?: number;
  onSalvar: (v: ValoresForm) => void;
}) {
  const c = useCores();
  const { avisar } = useDialogos();
  const novo = modo === 'novo';
  const [prefixo, setPrefixo] = useState<string | null>(inicial?.prefixo ?? null);
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [tamanhos, setTamanhos] = useState<string[]>(inicial?.tamanho ? [inicial.tamanho] : []);
  const [qtds, setQtds] = useState<Record<string, number>>({}); // unidades por tamanho (cadastro)
  const [modelos, setModelos] = useState<ModeloSugerido[]>([]);
  const [vinculo, setVinculo] = useState<ModeloSugerido | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [fotoBase, setFotoBase] = useState<string | null>(null); // foto do modelo vinculado
  const buscaSeq = useRef(0);
  const [outroTamanho, setOutroTamanho] = useState('');
  const [cor, setCor] = useState(inicial?.cor ?? '');
  const [tipo, setTipo] = useState<Tipo | null>(inicial?.tipo ?? null);
  const [condicao, setCondicao] = useState<Condicao | null>(inicial?.condicao ?? null);
  const [pertence, setPertence] = useState<Pertence | null>(inicial?.pertence ?? null);
  const [consignanteId, setConsignanteId] = useState<string | null>(inicial?.consignante_id ?? null);
  const [acordoProprio, setAcordoProprio] = useState(Boolean(inicial?.acordo_tipo));
  const [acordoTipo, setAcordoTipo] = useState<'percentual' | 'fixo'>(inicial?.acordo_tipo ?? 'percentual');
  const [acordoValor, setAcordoValor] = useState(inicial?.acordo_valor != null ? String(inicial.acordo_valor).replace('.', ',') : '');
  const [custo, setCusto] = useState(inicial?.custo != null ? centavosParaTexto(lerValor(inicial.custo)) : '');
  const [preco, setPreco] = useState(inicial ? centavosParaTexto(lerValor(inicial.preco_venda)) : '');
  const [site, setSite] = useState<'sim' | 'nao' | 'nv'>(
    inicial?.cadastrado_site === true ? 'sim' : inicial?.cadastrado_site === false ? 'nao' : novo ? 'nao' : 'nv',
  );
  const [obs, setObs] = useState(inicial?.observacoes ?? '');
  const [fotoLocal, setFotoLocal] = useState<string | null>(null);
  const [consignantes, setConsignantes] = useState<Consignante[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const codigosRef = useRef<CodigosRef>(null);

  useEffect(() => {
    listarConsignantes().then(setConsignantes).catch(() => {});
  }, [recarga]);

  // Autocomplete: modelos já cadastrados com descrição parecida.
  const vinculado = !!vinculo && descricao.trim() === vinculo.descricao;
  const termo = descricao.trim();
  useEffect(() => {
    if (!novo || vinculado || termo.length < 2) return;
    const n = ++buscaSeq.current;
    const t = setTimeout(() => {
      sugerirModelos(termo)
        .then((r) => n === buscaSeq.current && setModelos(r))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [termo, novo, vinculado]);
  const mostrarModelos = novo && !vinculado && termo.length >= 2 && modelos.length > 0;

  async function vincular(m: ModeloSugerido) {
    Keyboard.dismiss();
    setVinculando(true);
    try {
      const p = await obterProduto(m.produto_base);
      setPrefixo(p.prefixo);
      setDescricao(m.descricao);
      setCor(p.cor ?? '');
      setTipo(p.tipo);
      setCondicao(p.condicao);
      setPertence(p.pertence);
      setConsignanteId(p.consignante_id);
      setAcordoProprio(Boolean(p.acordo_tipo));
      if (p.acordo_tipo) setAcordoTipo(p.acordo_tipo);
      setAcordoValor(p.acordo_valor != null ? String(p.acordo_valor).replace('.', ',') : '');
      setCusto(p.custo != null ? centavosParaTexto(lerValor(p.custo)) : '');
      setPreco(centavosParaTexto(lerValor(p.preco_venda)));
      setFotoBase(p.foto_path);
      setVinculo(m);
      setModelos([]);
      setErros({});
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setVinculando(false);
    }
  }

  function desvincular() {
    setVinculo(null);
    setFotoBase(null);
  }

  // Uma unidade por peça física: 5 no M = 5 unidades, cada uma com código.
  const unidades = novo ? tamanhos.flatMap((t) => Array.from({ length: qtds[t] ?? 1 }, () => t)) : [];
  const totalUnidades = novo ? unidades.length : 1;
  const mudarQtd = (t: string, q: number) => setQtds((x) => ({ ...x, [t]: Math.min(Math.max(1, q), MAX_UNIDADES) }));

  const custoC = lerValor(custo);
  const precoC = lerValor(preco);
  const lucro = precoC !== null && custoC !== null ? precoC - custoC : null;
  // Tamanhos fora da lista padrão (EG, G1…) entram na própria lista do dropdown.
  const extras = tamanhos.filter((t) => !TODOS_TAMANHOS.includes(t));
  const opcoesTamanho = [...OPCOES_TAMANHO, ...extras.map((t) => ({ valor: t, rotulo: t }))];

  async function pegarFoto(origem: 'camera' | 'galeria') {
    Keyboard.dismiss();
    try {
      const uri = await escolherFoto(origem);
      if (uri) setFotoLocal(uri);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  function adicionarTamanho(fechar: () => void) {
    const t = outroTamanho.trim().toUpperCase();
    if (!t) return;
    setTamanhos(novo ? ordenar([...new Set([...tamanhos, t])]) : [t]);
    setOutroTamanho('');
    if (!novo) fechar();
  }

  function salvar() {
    Keyboard.dismiss();
    const e: Record<string, string> = {};
    if (!prefixo) e.prefixo = 'Escolha a categoria';
    const cods = novo && prefixo && tamanhos.length ? codigosRef.current?.obter() : null;
    if (cods?.erro) e.codigos = cods.erro;
    if (!descricao.trim()) e.descricao = 'Informe a descrição';
    if (!tamanhos.length) e.tamanhos = 'Escolha o tamanho';
    else if (novo && totalUnidades > MAX_UNIDADES) e.tamanhos = `Máximo de ${MAX_UNIDADES} unidades por cadastro`;
    if (!tipo) e.tipo = 'Escolha o tipo';
    if (!condicao) e.condicao = 'Escolha a condição';
    if (!pertence) e.pertence = 'Escolha a quem pertence';
    if (custoC === null || custoC < 0) e.custo = 'Informe o custo';
    if (precoC === null || precoC <= 0) e.preco = 'Informe o preço de venda';
    if (!fotoLocal && !fotoBase && !inicial?.foto_path) e.foto = 'Adicione uma foto';
    if (pertence === 'Concessão' && !consignanteId) e.consignante = 'Escolha o proprietário';
    const acordoNum = acordoValor.trim() ? Number(acordoValor.replace(',', '.')) : null;
    if (pertence === 'Concessão' && acordoProprio && (acordoNum === null || !Number.isFinite(acordoNum) || acordoNum < 0 || (acordoTipo === 'percentual' && acordoNum > 100))) {
      e.acordo = 'Valor do acordo inválido';
    }
    setErros(e);
    const qtd = Object.keys(e).length;
    if (qtd) {
      avisar(qtd === 1 ? Object.values(e)[0] : `Preencha os ${qtd} campos destacados`, 'erro');
      return;
    }
    const concessao = pertence === 'Concessão';
    onSalvar({
      dados: {
        prefixo: prefixo!,
        descricao: descricao.trim(),
        tamanho: novo ? undefined : tamanhos[0],
        cor: cor.trim() || null,
        tipo,
        condicao,
        pertence: pertence!,
        consignante_id: concessao ? consignanteId : null,
        acordo_tipo: concessao && acordoProprio ? acordoTipo : null,
        acordo_valor: concessao && acordoProprio ? acordoNum : null,
        custo: paraReais(custoC!),
        preco_venda: paraReais(precoC!),
        cadastrado_site: site === 'sim' ? true : site === 'nao' ? false : null,
        observacoes: obs.trim() || null,
        // Foto do modelo vinculado (sem nova foto): reaproveita o mesmo arquivo.
        foto_path: !fotoLocal && fotoBase ? fotoBase : undefined,
      },
      tamanhos: novo ? unidades : tamanhos,
      codigos: cods?.codigos ?? [],
      fotoLocal,
    });
  }

  const rodapeTamanho = (fechar: () => void) => (
    <Linha estilo={{ alignItems: 'flex-end' }}>
      <Campo rotulo="Outro tamanho" value={outroTamanho} onChangeText={setOutroTamanho} placeholder="Ex.: EG" autoCapitalize="characters" onSubmitEditing={() => adicionarTamanho(fechar)} />
      <Botao compacto v="secundario" titulo="Adicionar" onPress={() => adicionarTamanho(fechar)} estilo={{ minHeight: 46 }} />
    </Linha>
  );

  return (
    <View style={{ gap: ESPACO.xl }}>
      <T v="legenda">Campos obrigatórios, exceto cor e observações.</T>

      <Secao titulo="Produto">
        {novo ? (
          <>
            <CategoriaSelect key={`cat-${recarga}`} valor={prefixo} onChange={setPrefixo} erro={erros.prefixo} />
          </>
        ) : (
          <Linha estilo={{ justifyContent: 'space-between' }}>
            <T v="legenda">{inicial?.categoria}</T>
            <T v="mono">{inicial?.codigo}</T>
          </Linha>
        )}
        <Campo
          rotulo="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Ex.: Brasil Home 2022"
          erro={erros.descricao}
          autoCorrect={false}
        />
        {mostrarModelos && (
          <Cartao estilo={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            <T v="legenda" estilo={{ paddingHorizontal: ESPACO.md, paddingTop: ESPACO.sm }}>Já cadastrados — toque para copiar os dados</T>
            {modelos.map((m) => (
              <Pressable
                key={m.produto_base}
                accessibilityRole="button"
                onPress={() => vincular(m)}
                disabled={vinculando}
                style={({ pressed }) => ({ padding: ESPACO.md, backgroundColor: pressed ? c.superficie2 : 'transparent', borderTopWidth: 0.5, borderTopColor: c.borda })}>
                <T v="forte">{m.descricao}</T>
                <T v="legenda">
                  {m.disponiveis} de {m.unidades} disponíveis{m.tamanhos.length ? ` · ${ordenar(m.tamanhos).join(', ')}` : ''}
                </T>
              </Pressable>
            ))}
          </Cartao>
        )}
        {vinculado && (
          <Aviso
            tipo="info"
            texto={`Dados e foto copiados de “${vinculo!.descricao}”.`}
            acao={<Botao compacto v="secundario" titulo="Desvincular" onPress={desvincular} />}
          />
        )}
        {novo ? (
          <Selecao
            multi
            rotulo="Tamanhos e códigos"
            placeholder={tamanhos.length ? 'Alterar tamanhos' : 'Escolha os tamanhos'}
            opcoes={opcoesTamanho}
            valor={tamanhos}
            onChange={(v) => setTamanhos(ordenar(v))}
            erro={erros.tamanhos}
            rodape={rodapeTamanho}
          />
        ) : (
          <Selecao
            rotulo="Tamanho"
            placeholder="Escolha o tamanho"
            opcoes={opcoesTamanho}
            valor={tamanhos[0] ?? null}
            onChange={(v) => setTamanhos(v ? [v] : [])}
            erro={erros.tamanhos}
            rodape={rodapeTamanho}
          />
        )}
        {novo && (
          // key: trocar a categoria recomeça as sugestões e descarta códigos digitados.
          <TamanhosCodigos
            key={prefixo ?? 'sem-categoria'}
            ref={codigosRef}
            prefixo={prefixo}
            tamanhos={tamanhos}
            qtds={qtds}
            onQtd={mudarQtd}
            onRemover={(t) => setTamanhos(tamanhos.filter((x) => x !== t))}
            recarga={recarga}
          />
        )}
        <Erro texto={erros.codigos} />
        {novo && totalUnidades > 1 && (
          <T v="legenda">{totalUnidades} produtos · toque no código para editar</T>
        )}
        <Campo rotulo="Cor (opcional)" value={cor} onChangeText={setCor} />
      </Secao>

      <Secao titulo="Tipo e condição">
        <Chips opcoes={TIPOS} valor={tipo} onChange={setTipo} />
        <Erro texto={erros.tipo} />
        <Chips opcoes={CONDICOES} valor={condicao} onChange={setCondicao} />
        <Erro texto={erros.condicao} />
      </Secao>

      <Secao titulo="Pertence">
        <Chips opcoes={PERTENCE} valor={pertence} onChange={setPertence} />
        <Erro texto={erros.pertence} />
        {pertence === 'Concessão' && (
          <Cartao>
            {consignantes.length === 0 ? (
              <T v="legenda">Cadastre o proprietário em Mais › Concessão.</T>
            ) : (
              <Selecao
                rotulo="Proprietário"
                opcoes={consignantes.map((x) => ({
                  valor: x.id,
                  rotulo: `${x.nome} · ${x.tipo_acordo === 'percentual' ? `${x.valor_acordo}%` : brl(lerValor(x.valor_acordo))}`,
                }))}
                valor={consignanteId}
                onChange={setConsignanteId}
                erro={erros.consignante}
              />
            )}
            <Chips
              opcoes={['padrao', 'proprio'] as const}
              rotulos={{ padrao: 'Acordo padrão', proprio: 'Acordo desta peça' }}
              valor={acordoProprio ? 'proprio' : 'padrao'}
              onChange={(v) => setAcordoProprio(v === 'proprio')}
            />
            {acordoProprio && (
              <>
                <Chips opcoes={['percentual', 'fixo'] as const} rotulos={{ percentual: '% do líquido', fixo: 'Valor fixo' }} valor={acordoTipo} onChange={(v) => v && setAcordoTipo(v)} />
                <Campo rotulo={acordoTipo === 'percentual' ? '% do proprietário' : 'Valor do proprietário (R$)'} value={acordoValor} onChangeText={setAcordoValor} keyboardType="decimal-pad" erro={erros.acordo} />
              </>
            )}
          </Cartao>
        )}
      </Secao>

      <Secao titulo="Valores">
        <Linha quebra estilo={{ alignItems: 'flex-start' }}>
          <Campo rotulo="Custo (R$)" value={custo} onChangeText={setCusto} keyboardType="decimal-pad" placeholder="0,00" erro={erros.custo} />
          <Campo rotulo="Preço de venda (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="0,00" erro={erros.preco} />
        </Linha>
        {lucro !== null && (
          <T v="legenda" cor={lucro < 0 ? c.perigo : undefined}>Lucro estimado: {brl(lucro)}</T>
        )}
      </Secao>

      <Secao titulo="Foto">
        <Linha gap={ESPACO.md}>
          <Foto uri={fotoLocal} path={fotoLocal ? null : (fotoBase ?? inicial?.foto_path)} tamanho={88} />
          <View style={{ gap: ESPACO.sm, flex: 1 }}>
            <Botao compacto v="secundario" icone="camera-outline" titulo="Tirar foto" onPress={() => pegarFoto('camera')} />
            <Botao compacto v="secundario" icone="images-outline" titulo="Galeria" onPress={() => pegarFoto('galeria')} />
          </View>
        </Linha>
        <Erro texto={erros.foto} />
        {novo && totalUnidades > 1 && <T v="legenda">Mesma foto para todas as unidades.</T>}
      </Secao>

      <Secao titulo="Site">
        <Chips
          opcoes={(novo ? ['sim', 'nao'] : ['sim', 'nao', 'nv']) as ('sim' | 'nao' | 'nv')[]}
          rotulos={{ sim: 'No site', nao: 'Fora do site', nv: 'Não verificado' }}
          valor={site}
          onChange={(v) => v && setSite(v)}
        />
      </Secao>

      <Campo rotulo="Observações (opcional)" value={obs} onChangeText={setObs} multiline />

      <Botao
        titulo={novo ? (totalUnidades > 1 ? `Cadastrar ${totalUnidades} produtos` : 'Cadastrar') : 'Salvar alterações'}
        icone="checkmark"
        onPress={salvar}
        carregando={salvando}
      />
    </View>
  );
}
