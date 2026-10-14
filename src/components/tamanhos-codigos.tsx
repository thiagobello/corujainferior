// Bloco "Tamanhos e códigos" do cadastro: uma linha por tamanho com a
// quantidade e a faixa de códigos (ex.: M · 5 · M1387 – M1391). Os códigos
// vêm sugeridos na sequência; tocar neles abre a edição de cada um.
// Código digitado é conferido no banco; a checagem final é em criar_produtos.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { sugerirCodigos, verificarCodigo } from '@/lib/api';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { Aviso, Botao, BotaoIcone, Campo, Linha, T } from './ui';

export interface CodigosRef {
  /** Códigos para enviar (um por unidade, na ordem) ou o erro a corrigir. */
  obter: () => { codigos: string[]; erro: string | null };
}

type Status = { estado: 'verificando' } | { estado: 'ok'; codigo: string } | { estado: 'erro'; msg: string };

const limpar = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "M1387–1391" quando os números são seguidos; senão uma lista curta. */
function faixa(codigos: string[]): string {
  const cs = codigos.filter(Boolean);
  if (!cs.length) return '—';
  if (cs.length === 1) return cs[0];
  const m = cs.map((x) => x.match(/^([A-Z]+)(\d+)$/));
  const seguidos = m.every((x, i) => x && x[1] === m[0]![1] && (i === 0 || Number(x[2]) === Number(m[i - 1]![2]) + 1));
  if (seguidos) return `${cs[0]}–${m[m.length - 1]![2]}`;
  return cs.length <= 3 ? cs.join(', ') : `${cs.slice(0, 2).join(', ')} +${cs.length - 2}`;
}

export function TamanhosCodigos({
  prefixo,
  tamanhos,
  qtds,
  onQtd,
  onRemover,
  recarga = 0,
  ref,
}: {
  prefixo: string | null;
  tamanhos: string[];
  qtds: Record<string, number>;
  onQtd: (tamanho: string, qtd: number) => void;
  onRemover: (tamanho: string) => void;
  recarga?: number;
  ref: Ref<CodigosRef>;
}) {
  const c = useCores();
  // Unidades na ordem dos tamanhos; a chave (ex.: "M#3") prende a edição à unidade.
  const unidades = tamanhos.flatMap((t) => Array.from({ length: qtds[t] ?? 1 }, (_, k) => ({ chave: `${t}#${k + 1}`, tamanho: t })));
  const n = unidades.length;
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seq = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!prefixo || n === 0) return;
    let vivo = true;
    sugerirCodigos(prefixo, n)
      .then((r) => vivo && (setSugestoes(r), setErroSugestao(null)))
      .catch((e) => vivo && setErroSugestao(mensagemErro(e)));
    return () => {
      vivo = false;
    };
  }, [prefixo, n, recarga]);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const valor = (i: number) => editados[unidades[i].chave] ?? sugestoes[i] ?? '';
  const valores = unidades.map((_, i) => limpar(valor(i)));
  const repetidos = new Set(valores.filter((v, i, a) => v && a.indexOf(v) !== i));

  function problema(i: number): string | null {
    const k = unidades[i].chave;
    const v = valores[i];
    if (k in editados && !v) return 'Informe o código';
    if (v && repetidos.has(v)) return 'Repetido';
    const st = status[k];
    return st?.estado === 'erro' ? st.msg : null;
  }

  function digitar(i: number, texto: string) {
    const k = unidades[i].chave;
    setEditados((e) => ({ ...e, [k]: texto }));
    clearTimeout(timers.current[k]);
    const cod = limpar(texto);
    if (!cod || !prefixo) {
      setStatus(({ [k]: _, ...resto }) => resto);
      return;
    }
    setStatus((st) => ({ ...st, [k]: { estado: 'verificando' } }));
    const id = (seq.current[k] = (seq.current[k] ?? 0) + 1);
    timers.current[k] = setTimeout(async () => {
      try {
        const r = await verificarCodigo(cod, prefixo);
        if (seq.current[k] !== id) return;
        setStatus((st) => ({ ...st, [k]: r.disponivel ? { estado: 'ok', codigo: r.codigo! } : { estado: 'erro', msg: r.motivo ?? 'Código indisponível' } }));
      } catch (e) {
        if (seq.current[k] === id) setStatus((st) => ({ ...st, [k]: { estado: 'erro', msg: mensagemErro(e) } }));
      }
    }, 450);
  }

  /** Volta os códigos do tamanho para a sequência sugerida. */
  function restaurar(t: string) {
    const ks = unidades.filter((u) => u.tamanho === t).map((u) => u.chave);
    for (const k of ks) {
      clearTimeout(timers.current[k]);
      seq.current[k] = (seq.current[k] ?? 0) + 1;
    }
    setEditados((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !ks.includes(k))));
    setStatus((st) => Object.fromEntries(Object.entries(st).filter(([k]) => !ks.includes(k))));
  }

  useImperativeHandle(ref, () => ({
    obter: () => {
      if (!prefixo) return { codigos: [], erro: 'Escolha a categoria para gerar os códigos' };
      for (let i = 0; i < n; i++) {
        const rotulo = ` (tamanho ${unidades[i].tamanho})`;
        if (!valores[i]) return { codigos: [], erro: `Informe o código${rotulo}` };
        const p = problema(i);
        if (p) return { codigos: [], erro: `${valores[i]}${rotulo}: ${p}` };
        if (unidades[i].chave in editados && status[unidades[i].chave]?.estado !== 'ok') {
          return { codigos: [], erro: `Aguarde a conferência do código ${valores[i]}` };
        }
      }
      return { codigos: valores, erro: null };
    },
  }));

  if (!tamanhos.length) return null;

  return (
    <View style={[s.bloco, { borderColor: c.borda, backgroundColor: c.superficie }]}>
      {erroSugestao && <Aviso tipo="alerta" texto={`Sem sugestão de código: ${erroSugestao}`} />}
      {tamanhos.map((t, ti) => {
        const idx = unidades.flatMap((u, i) => (u.tamanho === t ? [i] : []));
        const qtd = idx.length;
        const comProblema = idx.some((i) => problema(i));
        const editadoAqui = idx.some((i) => unidades[i].chave in editados);
        const aberto = abertos.has(t) || comProblema;
        const alternar = () =>
          setAbertos((a) => {
            const novo = new Set(a);
            if (novo.has(t)) novo.delete(t);
            else novo.add(t);
            return novo;
          });
        return (
          <View key={t} style={[s.linha, ti > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borda }]}>
            <Linha gap={ESPACO.sm}>
              <View style={[s.tamanho, { backgroundColor: c.primariaSuave }]}>
                <T v="forte" cor={c.primaria}>{t}</T>
              </View>
              <Linha gap={0}>
                <BotaoIcone icone="remove-circle-outline" rotulo={`Menos ${t}`} cor={qtd > 1 ? c.texto : c.borda} onPress={() => qtd > 1 && onQtd(t, qtd - 1)} />
                <T v="forte" estilo={{ minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{qtd}</T>
                <BotaoIcone icone="add-circle-outline" rotulo={`Mais ${t}`} onPress={() => onQtd(t, qtd + 1)} />
              </Linha>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Códigos do tamanho ${t}`}
                disabled={!prefixo}
                onPress={alternar}
                style={({ pressed }) => [s.codigos, { opacity: pressed ? 0.6 : 1 }]}>
                {prefixo ? (
                  <>
                    <T v="mono" cor={comProblema ? c.perigo : editadoAqui ? c.primaria : c.texto2} estilo={{ fontSize: 14, letterSpacing: 0, flexShrink: 1 }} linhas={1}>
                      {faixa(idx.map((i) => valores[i]))}
                    </T>
                    <Ionicons name={aberto ? 'chevron-up' : 'create-outline'} size={16} color={c.texto2} />
                  </>
                ) : (
                  <T v="legenda">escolha a categoria</T>
                )}
              </Pressable>
              <BotaoIcone icone="close" rotulo={`Remover tamanho ${t}`} cor={c.texto2} onPress={() => onRemover(t)} />
            </Linha>

            {aberto && prefixo && (
              <View style={{ gap: ESPACO.xs, paddingTop: ESPACO.sm }}>
                <Linha quebra gap={ESPACO.sm} estilo={{ alignItems: 'flex-start' }}>
                  {idx.map((i) => {
                    const st = status[unidades[i].chave];
                    return (
                      <View key={unidades[i].chave} style={{ flexGrow: 1, flexBasis: 120, maxWidth: 220 }}>
                        <Campo
                          value={valor(i)}
                          onChangeText={(x) => digitar(i, x)}
                          placeholder={sugestoes[i] ?? `${prefixo}…`}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          erro={problema(i)}
                          ajuda={st?.estado === 'verificando' ? 'Conferindo…' : st?.estado === 'ok' ? 'Disponível' : undefined}
                          style={{ fontWeight: '700', letterSpacing: 1, minHeight: 40 }}
                        />
                      </View>
                    );
                  })}
                </Linha>
                {editadoAqui && <Botao compacto v="fantasma" titulo="Usar sugeridos" onPress={() => restaurar(t)} />}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: ESPACO.md, paddingVertical: ESPACO.xs },
  linha: { paddingVertical: ESPACO.sm },
  tamanho: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  codigos: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 36 },
});
