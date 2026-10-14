// Lembrete de remover do site peças vendidas que estavam cadastradas.
// O estado vive no banco (alertas_site), então sobrevive a fechar o popup
// ou recarregar a página; só some quando é resolvido ou adiado.
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';

import { alertasSiteAbertos, resolverAlerta, type AlertaSite } from '@/lib/api';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { useDialogos } from './dialogos';
import { Botao, Foto, Linha, T } from './ui';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
/** Chamar após uma venda para checar novos alertas imediatamente. */
export function verificarAlertasSite() {
  ouvintes.forEach((f) => f());
}

export function AlertaSitePopup() {
  const c = useCores();
  const { avisar } = useDialogos();
  const caminho = usePathname();
  const [alertas, setAlertas] = useState<AlertaSite[]>([]);
  const [fechado, setFechado] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const todos = await alertasSiteAbertos();
      const agora = Date.now();
      setAlertas(todos.filter((a) => a.status === 'pendente' || (a.adiado_ate && new Date(a.adiado_ate).getTime() <= agora)));
    } catch {
      // silencioso: a lista completa fica na tela "Remover do site"
    }
  }, []);

  useEffect(() => {
    // carregar só altera o estado depois do await (resposta do servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    ouvintes.add(carregar);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && carregar());
    const t = setInterval(carregar, 5 * 60 * 1000);
    return () => {
      ouvintes.delete(carregar);
      sub.remove();
      clearInterval(t);
    };
  }, [carregar]);

  const visiveis = alertas.filter((a) => !fechado.has(a.id));
  const atual = visiveis[0];
  if (!atual || caminho === '/site') return null;

  async function agir(acao: 'removido' | 'adiar') {
    setOcupado(true);
    try {
      await resolverAlerta(atual.id, acao, 24);
      setAlertas((l) => l.filter((a) => a.id !== atual.id));
      avisar(acao === 'removido' ? 'Removido do site' : 'Adiado por 24 h');
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setFechado(new Set([...fechado, atual.id]))}>
      <View style={s.fundo}>
        <View style={[s.caixa, { backgroundColor: c.superficie }]}>
          <T v="secao" cor={c.alerta}>Remover do site</T>
          <T v="titulo" estilo={{ fontSize: 19 }}>Vendida e ainda no site</T>
          <Pressable onPress={() => { setFechado(new Set([...fechado, atual.id])); router.push(`/produto/${atual.produto.id}`); }}>
            <Linha gap={ESPACO.md}>
              <Foto path={atual.produto.foto_path} tamanho={64} />
              <View style={{ flex: 1 }}>
                <T v="forte" linhas={2}>{atual.produto.descricao}</T>
                <T v="legenda">{atual.produto.codigo} · Tam. {atual.produto.tamanho ?? '—'}</T>
              </View>
            </Linha>
          </Pressable>
          {visiveis.length > 1 && <T v="legenda">+{visiveis.length - 1} aguardando</T>}
          <Botao titulo="Já removi" icone="checkmark" onPress={() => agir('removido')} carregando={ocupado} />
          <Linha>
            <Botao v="secundario" titulo="Adiar 24 h" onPress={() => agir('adiar')} desabilitado={ocupado} estilo={{ flex: 1 }} />
            <Botao
              v="secundario"
              titulo="Manter pendente"
              onPress={() => setFechado(new Set([...fechado, atual.id]))}
              desabilitado={ocupado}
              estilo={{ flex: 1 }}
            />
          </Linha>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: ESPACO.lg },
  caixa: { width: '100%', maxWidth: 460, borderRadius: 16, padding: ESPACO.xl, gap: ESPACO.md },
});
