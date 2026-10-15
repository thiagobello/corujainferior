// Produto com vários tamanhos: resumo por tamanho e cada unidade.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { FotoAmpliavel } from '@/components/foto-ampliavel';
import { Cartao, Carregando, ErroCaixa, Etiqueta, Linha, Secao, Selo, T, Tela, Vazio } from '@/components/ui';
import { unidadesDoGrupo } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { ESPACO, useCores } from '@/lib/tema';
import { TAMANHOS_ADULTO, TAMANHOS_INFANTIL, type Produto } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

const ORDEM = [...TAMANHOS_ADULTO, ...TAMANHOS_INFANTIL, 'Único'];
const ordem = (t: string | null) => {
  const i = ORDEM.indexOf(t ?? '');
  return i === -1 ? 999 : i;
};

export default function Grupo() {
  const { g } = useLocalSearchParams<{ g: string }>();
  const c = useCores();
  const { dados, erro, carregando, recarregar } = useConsulta(() => unidadesDoGrupo(g), [g]);

  if (erro) return <Tela onAtualizar={recarregar}><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (!dados) return <Tela><Carregando /></Tela>;
  if (dados.length === 0) return <Tela onAtualizar={recarregar}><Vazio texto="Nenhuma unidade encontrada." /></Tela>;

  const unidades = [...dados].sort((a, b) => ordem(a.tamanho) - ordem(b.tamanho) || (a.numero ?? 0) - (b.numero ?? 0));
  const foto = unidades.find((u) => u.status === 'Disponível' && u.foto_path)?.foto_path ?? unidades.find((u) => u.foto_path)?.foto_path;
  const disponiveis = unidades.filter((u) => u.status === 'Disponível');
  const precos = (disponiveis.length ? disponiveis : unidades).map((u) => Number(u.preco_venda));
  const preco = Math.min(...precos) === Math.max(...precos) ? brlReais(precos[0]) : `${brlReais(Math.min(...precos))} a ${brlReais(Math.max(...precos))}`;

  const porTamanho = new Map<string, { disp: number; total: number }>();
  for (const u of unidades) {
    const k = u.tamanho ?? '—';
    const x = porTamanho.get(k) ?? { disp: 0, total: 0 };
    x.total++;
    if (u.status === 'Disponível') x.disp++;
    porTamanho.set(k, x);
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Stack.Screen options={{ title: unidades[0].descricao }} />
      <Linha gap={ESPACO.lg} estilo={{ alignItems: 'flex-start' }}>
        <FotoAmpliavel path={foto} tamanho={110} raio={12} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="titulo" estilo={{ fontSize: 20 }}>{unidades[0].descricao}</T>
          <T v="valor">{preco}</T>
          <T v="legenda">{disponiveis.length} de {unidades.length} disponíveis</T>
        </View>
      </Linha>

      <Secao titulo="Disponíveis por tamanho">
        <Linha quebra gap={6}>
          {[...porTamanho.entries()].map(([t, x]) => (
            <Etiqueta
              key={t}
              texto={`${t} · ${x.disp}${x.disp !== x.total ? ` de ${x.total}` : ''}`}
              cor={x.disp ? c.primaria : c.texto2}
              fundo={x.disp ? c.primariaSuave : c.neutroSuave}
            />
          ))}
        </Linha>
      </Secao>

      <Secao titulo="Unidades">
        {unidades.map((u: Produto) => (
          <Cartao key={u.id} onPress={() => router.push(`/produto/${u.id}`)} estilo={{ padding: ESPACO.md }}>
            <Linha estilo={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="forte">Tamanho {u.tamanho ?? '—'}</T>
                <T v="legenda">{u.codigo}{u.reserva_cliente ? ` · ${u.reserva_cliente}` : ''}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Selo status={u.status} />
                <T v="legenda">{brlReais(u.preco_venda)}</T>
              </View>
            </Linha>
          </Cartao>
        ))}
      </Secao>
    </Tela>
  );
}
