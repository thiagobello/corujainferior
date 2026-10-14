import { router } from 'expo-router';
import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { ProdutoForm, type ValoresForm } from '@/components/produto-form';
import { ProdutoLinha } from '@/components/produto-linha';
import { Aviso, Botao, Tela } from '@/components/ui';
import { criarProdutos } from '@/lib/api';
import { enviarFoto } from '@/lib/fotos';
import { mensagemErro } from '@/lib/supabase';
import { usePuxar } from '@/lib/usePuxar';
import type { Produto } from '@/lib/tipos';

export default function Cadastrar() {
  const { avisar } = useDialogos();
  const [salvando, setSalvando] = useState(false);
  const [criados, setCriados] = useState<Produto[] | null>(null);
  const [chave, setChave] = useState(0);
  const [recarga, setRecarga] = useState(0);
  // Puxar para baixo recarrega categorias e sugestões de código sem apagar o que foi preenchido.
  const puxar = usePuxar(() => setRecarga((r) => r + 1));

  async function salvar(v: ValoresForm) {
    setSalvando(true);
    try {
      // Nova foto é enviada; sem nova foto, usa a do modelo vinculado (se houver).
      const foto_path = v.fotoLocal ? await enviarFoto(v.fotoLocal) : (v.dados.foto_path ?? null);
      const r = await criarProdutos({ ...v.dados, foto_path }, v.tamanhos, v.codigos);
      setCriados(r);
      avisar(r.length > 1 ? `${r.length} produtos cadastrados` : `Produto ${r[0].codigo} cadastrado`);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  if (criados) {
    return (
      <Tela bordas={[]}>
        <Aviso tipo="sucesso" texto={criados.length > 1 ? `${criados.length} produtos cadastrados.` : 'Produto cadastrado.'} />
        {criados.map((p) => (
          <ProdutoLinha key={p.id} p={p} onPress={() => router.push(`/produto/${p.id}`)} />
        ))}
        <Botao titulo="Cadastrar outro" icone="add" onPress={() => { setCriados(null); setChave((k) => k + 1); }} />
        <Botao v="secundario" titulo="Ir para o estoque" onPress={() => router.navigate('/')} />
      </Tela>
    );
  }

  return (
    <Tela {...puxar} bordas={[]}>
      <ProdutoForm key={chave} modo="novo" salvando={salvando} onSalvar={salvar} recarga={recarga} />
    </Tela>
  );
}
