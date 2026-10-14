import { StyleSheet, View } from 'react-native';

import type { GrupoProduto } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { ESPACO, useCores } from '@/lib/tema';
import type { Produto } from '@/lib/tipos';
import { Cartao, Etiqueta, Foto, Linha, Selo, T } from './ui';

/** Uma unidade: descrição em destaque, código como informação secundária. */
export function ProdutoLinha({ p, onPress, mostrarCusto = false }: { p: Produto; onPress?: () => void; mostrarCusto?: boolean }) {
  return (
    <Cartao onPress={onPress} estilo={s.cartao}>
      <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
        <Foto path={p.foto_path} tamanho={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Linha estilo={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <T v="forte" linhas={2} estilo={{ flex: 1 }}>{p.descricao}</T>
            <Selo status={p.status} />
          </Linha>
          <T v="legenda">
            {p.codigo} · Tam. {p.tamanho ?? '—'}{mostrarCusto ? ` · custo ${brlReais(p.custo)}` : ''}
          </T>
          <T v="forte" estilo={{ fontVariant: ['tabular-nums'] }}>{brlReais(p.preco_venda)}</T>
        </View>
      </Linha>
    </Cartao>
  );
}

/** Produtos de mesma descrição: um item com tamanhos e quantidades disponíveis. */
export function GrupoLinha({ g, onPress }: { g: GrupoProduto; onPress: () => void }) {
  const c = useCores();
  const preco = Number(g.preco_min) === Number(g.preco_max) ? brlReais(g.preco_min) : `${brlReais(g.preco_min)} a ${brlReais(g.preco_max)}`;
  const codigos = g.codigos.length > 3 ? `${g.codigos.slice(0, 3).join(', ')} +${g.codigos.length - 3}` : g.codigos.join(', ');
  return (
    <Cartao onPress={onPress} estilo={s.cartao}>
      <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
        <Foto path={g.foto_path} tamanho={60} />
        <View style={{ flex: 1, gap: 4 }}>
          <Linha estilo={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <T v="forte" linhas={2} estilo={{ flex: 1 }}>{g.descricao}</T>
            {g.status_unico ? (
              <Selo status={g.status_unico} />
            ) : g.disponiveis === 0 ? (
              <Etiqueta texto="Sem estoque" />
            ) : null}
          </Linha>
          {g.unidades > 1 && (
            <Linha quebra gap={6}>
              {g.tamanhos.map((t) => (
                <Etiqueta
                  key={t.tamanho ?? '-'}
                  texto={`${t.tamanho ?? '—'} · ${t.disponiveis}`}
                  cor={t.disponiveis > 0 ? c.primaria : c.texto2}
                  fundo={t.disponiveis > 0 ? c.primariaSuave : c.neutroSuave}
                />
              ))}
            </Linha>
          )}
          <T v="legenda" linhas={1}>
            {g.unidades > 1 ? `${g.disponiveis} de ${g.unidades} disponíveis · ${codigos}` : `${codigos} · Tam. ${g.tamanhos[0]?.tamanho ?? '—'}`}
          </T>
          <T v="forte" estilo={{ fontVariant: ['tabular-nums'] }}>{preco}</T>
        </View>
      </Linha>
    </Cartao>
  );
}

const s = StyleSheet.create({
  cartao: { padding: ESPACO.md },
});
