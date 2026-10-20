// Dropdown (seleção única ou múltipla) que funciona igual no celular e no
// navegador: um campo que abre uma lista em modal.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ESPACO, useCores } from '@/lib/tema';
import { Botao, Campo, T } from './ui';

export interface Opcao {
  valor: string;
  rotulo: string;
}

interface Base {
  rotulo?: string;
  opcoes: Opcao[];
  placeholder?: string;
  erro?: string | null;
  /** Conteúdo extra no rodapé da lista (ex.: criar nova categoria). */
  rodape?: (fechar: () => void) => ReactNode;
}

type Props =
  | (Base & { multi?: false; valor: string | null | undefined; onChange: (v: string | null) => void; permiteVazio?: boolean })
  | (Base & { multi: true; valor: string[]; onChange: (v: string[]) => void; permiteVazio?: never });

export function Selecao(props: Props) {
  const c = useCores();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const { rotulo, opcoes, placeholder = 'Selecionar', erro, rodape } = props;

  const selecionados = props.multi ? props.valor : props.valor ? [props.valor] : [];
  const rotulos = selecionados.map((v) => opcoes.find((o) => o.valor === v)?.rotulo ?? v);
  const texto = rotulos.length ? rotulos.join(', ') : placeholder;
  const filtradas = busca.trim()
    ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;

  const fechar = () => {
    setAberto(false);
    setBusca('');
  };

  function tocar(v: string) {
    if (props.multi) {
      props.onChange(props.valor.includes(v) ? props.valor.filter((x) => x !== v) : [...props.valor, v]);
    } else {
      props.onChange(props.valor === v && props.permiteVazio ? null : v);
      fechar();
    }
  }

  return (
    <View style={{ gap: 4, flexGrow: 1, flexShrink: 1, minWidth: 140 }}>
      {rotulo && <T v="legenda">{rotulo}</T>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rotulo ? `${rotulo}: ${texto}` : texto}
        onPress={() => {
          Keyboard.dismiss();
          setAberto(true);
        }}
        style={({ pressed }) => [
          s.campo,
          { backgroundColor: c.superficie, borderColor: erro ? c.perigo : c.borda, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: rotulos.length ? c.texto : c.texto2 }}>
          {texto}
        </Text>
        {!props.multi && props.permiteVazio && props.valor ? (
          <Pressable accessibilityLabel="Limpar" hitSlop={8} onPress={() => props.onChange(null)}>
            <Ionicons name="close-circle" size={18} color={c.texto2} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={c.texto2} />
        )}
      </Pressable>
      {erro ? <T v="legenda" cor={c.perigo}>{erro}</T> : null}

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={fechar}>
        <Pressable style={s.fundo} onPress={fechar}>
          <Pressable style={[s.caixa, { backgroundColor: c.superficie }]} onPress={() => {}}>
            <T v="forte">{rotulo ?? placeholder}</T>
            {opcoes.length > 20 && <Campo placeholder="Buscar…" value={busca} onChangeText={setBusca} limpar />}
            <FlatList
              data={filtradas}
              keyExtractor={(o) => o.valor}
              style={{ flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<T v="legenda">Nada encontrado.</T>}
              renderItem={({ item }) => {
                const ativo = selecionados.includes(item.valor);
                return (
                  <Pressable
                    accessibilityRole={props.multi ? 'checkbox' : 'button'}
                    accessibilityState={{ checked: ativo, selected: ativo }}
                    onPress={() => tocar(item.valor)}
                    style={({ pressed }) => [s.item, { borderBottomColor: c.borda, backgroundColor: pressed ? c.superficie2 : 'transparent' }]}>
                    <Text style={{ flex: 1, fontSize: 16, color: c.texto, fontWeight: ativo ? '600' : '400' }}>{item.rotulo}</Text>
                    {props.multi ? (
                      <Ionicons name={ativo ? 'checkbox' : 'square-outline'} size={22} color={ativo ? c.primaria : c.texto2} />
                    ) : ativo ? (
                      <Ionicons name="checkmark" size={20} color={c.primaria} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
            {rodape?.(fechar)}
            {props.multi && <Botao titulo={`Concluir${props.valor.length ? ` (${props.valor.length})` : ''}`} onPress={fechar} />}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  campo: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: ESPACO.md, flexDirection: 'row', alignItems: 'center', gap: ESPACO.sm },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: ESPACO.lg },
  caixa: { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: 16, padding: ESPACO.lg, gap: ESPACO.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, gap: ESPACO.sm },
});
