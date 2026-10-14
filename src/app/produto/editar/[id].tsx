import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { ProdutoForm, type ValoresForm } from '@/components/produto-form';
import { Aviso, Carregando, ErroCaixa, Tela } from '@/components/ui';
import { atualizarProduto, obterProduto } from '@/lib/api';
import { enviarFoto } from '@/lib/fotos';
import { mensagemErro } from '@/lib/supabase';
import { useConsulta } from '@/lib/useConsulta';

export default function EditarProduto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { avisar } = useDialogos();
  const { dados: p, erro, carregando, recarregar } = useConsulta(() => obterProduto(id), [id]);
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState(0);
  async function atualizar() {
    await recarregar();
    setVersao((v) => v + 1); // remonta o formulário com os dados recarregados
  }

  async function salvar(v: ValoresForm) {
    setSalvando(true);
    try {
      const { prefixo: _p, ...dados } = v.dados;
      if (v.fotoLocal) dados.foto_path = await enviarFoto(v.fotoLocal);
      await atualizarProduto(id, dados);
      avisar('Alterações salvas');
      router.back();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <Tela onAtualizar={atualizar}><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (carregando && !p) return <Tela><Carregando /></Tela>;
  if (!p) return null;
  return (
    <Tela atualizando={carregando} onAtualizar={atualizar}>
      {p.status === 'Vendida' && (
        <Aviso tipo="info" texto="Vendido: mudar valores aqui não altera a venda." />
      )}
      <ProdutoForm key={versao} inicial={p} modo="editar" salvando={salvando} onSalvar={salvar} />
    </Tela>
  );
}
