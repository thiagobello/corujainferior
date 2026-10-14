import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Botao, Cartao, Carregando, ErroCaixa, Foto, Linha, T, Tela, Vazio } from '@/components/ui';
import { alertasSiteAbertos, resolverAlerta } from '@/lib/api';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { dataBR, dataHoraBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function Site() {
  const c = useCores();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(alertasSiteAbertos);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function agir(id: string, acao: 'removido' | 'adiar' | 'pendente') {
    setOcupado(id + acao);
    try {
      await resolverAlerta(id, acao, 24);
      avisar(acao === 'removido' ? 'Marcado como removido' : acao === 'adiar' ? 'Adiado por 24 h' : 'Mantido pendente');
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <T v="legenda">Vendidos que ainda estão no site.</T>
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && dados.length === 0 && <Vazio icone="checkmark-circle-outline" texto="Nada para remover do site." />}
      {dados?.map((a) => (
        <Cartao key={a.id}>
          <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
            <Foto path={a.produto.foto_path} tamanho={64} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="forte" linhas={2}>{a.produto.descricao}</T>
              <T v="legenda">{a.produto.codigo} · Tam. {a.produto.tamanho ?? '—'} · vendida em {dataBR(a.criado_em)}</T>
              {a.status === 'adiado' && a.adiado_ate && <T v="legenda" cor={c.alerta}>Adiado até {dataHoraBR(a.adiado_ate)}</T>}
            </View>
          </Linha>
          <Linha quebra>
            <Botao compacto titulo="Removido" icone="checkmark" onPress={() => agir(a.id, 'removido')} carregando={ocupado === a.id + 'removido'} />
            {a.status === 'adiado' ? (
              <Botao compacto v="secundario" titulo="Voltar a lembrar" onPress={() => agir(a.id, 'pendente')} carregando={ocupado === a.id + 'pendente'} />
            ) : (
              <Botao compacto v="secundario" titulo="Adiar 24 h" onPress={() => agir(a.id, 'adiar')} carregando={ocupado === a.id + 'adiar'} />
            )}
            <Botao compacto v="fantasma" titulo="Abrir" onPress={() => router.push(`/produto/${a.produto.id}`)} />
          </Linha>
        </Cartao>
      ))}
    </Tela>
  );
}
