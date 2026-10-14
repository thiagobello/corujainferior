import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { OrcamentoForm, prepararPecas, type ValoresOrcamento } from '@/components/orcamento-form';
import { Carregando, ErroCaixa, Tela } from '@/components/ui';
import { obterOrcamento, salvarOrcamento } from '@/lib/api';
import { mensagemErro } from '@/lib/supabase';
import { useConsulta } from '@/lib/useConsulta';

export default function EditarOrcamento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(() => obterOrcamento(id), [id]);
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState(0);

  async function salvar(v: ValoresOrcamento) {
    setSalvando(true);
    try {
      const pecas = await prepararPecas(v.pecas);
      await salvarOrcamento(id, { cliente_nome: v.cliente_nome, contato: v.contato, observacoes: v.observacoes }, pecas);
      avisar('Orçamento atualizado');
      router.back();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <Tela onAtualizar={recarregar}><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (!dados) return <Tela><Carregando /></Tela>;
  const o = dados.orcamento;
  return (
    <Tela atualizando={carregando} onAtualizar={async () => { await recarregar(); setVersao((x) => x + 1); }}>
      <OrcamentoForm
        key={versao}
        inicial={{ cliente_nome: o.cliente_nome, contato: o.contato, observacoes: o.observacoes, pecas: dados.pecas, itens: dados.itens }}
        salvando={salvando}
        onSalvar={salvar}
        recarga={versao}
      />
    </Tela>
  );
}
