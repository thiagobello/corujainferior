// Confirmações e avisos que funcionam igual no celular e no navegador
// (Alert.alert do React Native não tem botões na web).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ESPACO, useCores } from '@/lib/tema';
import { Botao, T } from './ui';

interface OpcoesConfirmacao {
  titulo: string;
  mensagem?: string;
  conteudo?: ReactNode;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
}

interface Dialogos {
  confirmar: (o: OpcoesConfirmacao) => Promise<boolean>;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro') => void;
}

const Ctx = createContext<Dialogos | null>(null);

export function useDialogos(): Dialogos {
  const d = useContext(Ctx);
  if (!d) throw new Error('DialogosProvider ausente');
  return d;
}

export function DialogosProvider({ children }: { children: ReactNode }) {
  const c = useCores();
  const [conf, setConf] = useState<OpcoesConfirmacao | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; tipo: 'sucesso' | 'erro' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirmar = useCallback((o: OpcoesConfirmacao) => {
    resolver.current?.(false);
    setConf(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);

  const fechar = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConf(null);
  };

  const avisar = useCallback((msg: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    if (timer.current) clearTimeout(timer.current);
    setAviso({ msg, tipo });
    timer.current = setTimeout(() => setAviso(null), tipo === 'erro' ? 6000 : 3000);
  }, []);

  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}
      <Modal visible={!!conf} transparent animationType="fade" onRequestClose={() => fechar(false)}>
        <Pressable style={s.fundo} onPress={() => fechar(false)}>
          <Pressable style={[s.caixa, { backgroundColor: c.superficie }]} onPress={() => {}}>
            <T v="titulo" estilo={{ fontSize: 19 }}>{conf?.titulo}</T>
            {conf?.mensagem ? <T>{conf.mensagem}</T> : null}
            {conf?.conteudo}
            <View style={s.botoes}>
              <Botao v="secundario" titulo={conf?.cancelar ?? 'Cancelar'} onPress={() => fechar(false)} estilo={{ flex: 1 }} />
              <Botao v={conf?.perigo ? 'perigo' : 'primario'} titulo={conf?.confirmar ?? 'Confirmar'} onPress={() => fechar(true)} estilo={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {aviso && (
        <Pressable
          onPress={() => setAviso(null)}
          accessibilityLiveRegion="polite"
          style={[s.toast, { backgroundColor: aviso.tipo === 'erro' ? c.perigo : c.texto }]}>
          <Text style={{ color: c.superficie, fontSize: 15, fontWeight: '500' }}>{aviso.msg}</Text>
        </Pressable>
      )}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: ESPACO.lg },
  caixa: { width: '100%', maxWidth: 460, borderRadius: 16, padding: ESPACO.xl, gap: ESPACO.md, maxHeight: '90%' },
  botoes: { flexDirection: 'row', gap: ESPACO.sm, marginTop: ESPACO.sm },
  toast: {
    position: 'absolute',
    bottom: 96,
    left: ESPACO.lg,
    right: ESPACO.lg,
    alignSelf: 'center',
    maxWidth: 520,
    marginHorizontal: 'auto',
    padding: ESPACO.lg,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
});
