import { useState } from 'react';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Cartao, Carregando, Chips, ErroCaixa, Linha, T, Tela } from '@/components/ui';
import { definirUsuario, listarUsuarios } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mensagemErro } from '@/lib/supabase';
import type { Perfil } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function Usuarios() {
  const { admin, perfil: eu } = useAuth();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarUsuarios);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function alterar(u: Perfil, papel: Perfil['papel'], ativo: boolean) {
    setOcupado(u.id);
    try {
      await definirUsuario(u.id, papel, ativo);
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setOcupado(null);
    }
  }

  if (!admin) return <Tela><Aviso texto="Apenas administradores." /></Tela>;
  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Aviso
        tipo="info"
        texto="Quem cria conta no login entra como vendedor."
      />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados?.map((u) => (
        <Cartao key={u.id}>
          <Linha estilo={{ justifyContent: 'space-between' }}>
            <T v="forte">{u.nome}{u.id === eu?.id ? ' (você)' : ''}</T>
            {ocupado === u.id && <T v="legenda">salvando…</T>}
          </Linha>
          <T v="legenda">{u.email}</T>
          <Chips opcoes={['vendedor', 'admin'] as const} rotulos={{ vendedor: 'Vendedor', admin: 'Administrador' }} valor={u.papel} onChange={(p) => p && alterar(u, p, u.ativo)} />
          <Chips opcoes={['ativo', 'inativo'] as const} rotulos={{ ativo: 'Ativo', inativo: 'Sem acesso' }} valor={u.ativo ? 'ativo' : 'inativo'} onChange={(v) => v && alterar(u, u.papel, v === 'ativo')} />
        </Cartao>
      ))}
    </Tela>
  );
}
