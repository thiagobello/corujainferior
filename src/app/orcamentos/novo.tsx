import { router } from 'expo-router';
import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { OrcamentoForm, prepararPecas, type ValoresOrcamento } from '@/components/orcamento-form';
import { Tela } from '@/components/ui';
import { salvarOrcamento } from '@/lib/api';
import { mensagemErro } from '@/lib/supabase';
import { usePuxar } from '@/lib/usePuxar';

export default function NovoOrcamento() {
  const { avisar } = useDialogos();
  const [salvando, setSalvando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const puxar = usePuxar(() => setRecarga((r) => r + 1));

  async function salvar(v: ValoresOrcamento) {
    setSalvando(true);
    try {
      const pecas = await prepararPecas(v.pecas);
      const id = await salvarOrcamento(null, { cliente_nome: v.cliente_nome, contato: v.contato, observacoes: v.observacoes }, pecas);
      avisar('Orçamento criado');
      router.replace(`/orcamentos/${id}`);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Tela {...puxar}>
      <OrcamentoForm salvando={salvando} onSalvar={salvar} recarga={recarga} />
    </Tela>
  );
}
