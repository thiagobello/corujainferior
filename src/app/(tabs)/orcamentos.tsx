import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SeloOrcamento } from '@/components/status-orcamento';
import { Botao, Campo, Cartao, Carregando, Chips, ErroCaixa, Foto, Linha, T, Tela, Vazio } from '@/components/ui';
import { listarOrcamentos, listarStatusOrcamento } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { numeroOrcamento } from '@/lib/orcamento-html';
import { ESPACO } from '@/lib/tema';
import { dataBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function Orcamentos() {
  const { dados, erro, carregando, recarregar } = useConsulta(async () => {
    const [orcamentos, status] = await Promise.all([listarOrcamentos(), listarStatusOrcamento()]);
    return { orcamentos, status };
  });
  const [filtro, setFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const rotulo = (cod: string) => dados?.status.find((s) => s.codigo === cod)?.rotulo ?? cod;
  const termo = busca.trim().toLowerCase();
  const lista = (dados?.orcamentos ?? []).filter(
    (o) =>
      (!filtro || o.status === filtro) &&
      (!termo || o.cliente_nome.toLowerCase().includes(termo) || (o.contato ?? '').toLowerCase().includes(termo) || numeroOrcamento(o.numero).includes(termo)),
  );
  // Filtros: status ativos e os que ainda têm orçamentos.
  const usados = new Set((dados?.orcamentos ?? []).map((o) => o.status));
  const opcoes = (dados?.status ?? []).filter((s) => s.ativo || usados.has(s.codigo));

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar} bordas={[]}>
      <Botao icone="add" titulo="Novo orçamento" onPress={() => router.push('/orcamentos/novo')} />
      <Campo placeholder="Buscar cliente ou número" value={busca} onChangeText={setBusca} autoCorrect={false} />
      <Chips
        opcoes={opcoes.map((s) => s.codigo)}
        rotulos={Object.fromEntries(opcoes.map((s) => [s.codigo, `${s.rotulo} (${(dados?.orcamentos ?? []).filter((o) => o.status === s.codigo).length})`]))}
        valor={filtro}
        onChange={setFiltro}
        permiteVazio
      />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && lista.length === 0 && <Vazio icone="document-text-outline" texto="Nenhum orçamento." />}
      {lista.map((o) => (
        <Cartao key={o.id} onPress={() => router.push(`/orcamentos/${o.id}`)} estilo={{ padding: ESPACO.md }}>
          <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
            <Foto path={(o.pecas ?? []).flatMap((p) => p.fotos)[0]} tamanho={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Linha estilo={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <T v="forte" linhas={1} estilo={{ flex: 1 }}>{o.cliente_nome}</T>
                <SeloOrcamento codigo={o.status} rotulo={rotulo(o.status)} />
              </Linha>
              <T v="legenda" linhas={1}>
                {[...(o.pecas ?? [])].sort((a, b) => a.ordem - b.ordem).map((p) => p.nome).join(' · ')}
              </T>
              <T v="legenda">Nº {numeroOrcamento(o.numero)} · {dataBR(o.criado_em)}{o.contato ? ` · ${o.contato}` : ''}</T>
              <T v="forte">{brlReais(o.total)}</T>
            </View>
          </Linha>
        </Cartao>
      ))}
    </Tela>
  );
}
