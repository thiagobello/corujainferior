import { useEffect, useState } from 'react';

import { listarCategorias, type Categoria } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mensagemErro } from '@/lib/supabase';
import { useDialogos } from './dialogos';
import { Selecao } from './selecao';
import { T } from './ui';

/** Dropdown de categorias. Criar/arquivar fica em Mais › Categorias. */
export function CategoriaSelect({
  valor,
  onChange,
  rotulo = 'Categoria',
  permiteVazio,
  incluirArquivadas,
  erro,
}: {
  valor: string | null | undefined;
  onChange: (prefixo: string | null) => void;
  rotulo?: string;
  permiteVazio?: boolean;
  /** Filtros mostram também as arquivadas (ainda têm produtos). */
  incluirArquivadas?: boolean;
  erro?: string | null;
}) {
  const { avisar } = useDialogos();
  const { admin } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => {
    listarCategorias().then(setCategorias).catch((e) => avisar(mensagemErro(e), 'erro'));
  }, [avisar]);

  const visiveis = categorias.filter((c) => incluirArquivadas || !c.arquivada || c.prefixo === valor);

  return (
    <Selecao
      rotulo={rotulo}
      placeholder={permiteVazio ? 'Todas' : 'Escolha a categoria'}
      opcoes={visiveis.map((c) => ({ valor: c.prefixo, rotulo: c.arquivada ? `${c.descricao} (arquivada)` : c.descricao }))}
      valor={valor}
      onChange={onChange}
      permiteVazio={permiteVazio}
      erro={erro}
      rodape={
        incluirArquivadas
          ? undefined
          : () => <T v="legenda">{admin ? 'Gerencie em Mais › Categorias.' : 'Nova categoria: peça a um administrador.'}</T>
      }
    />
  );
}
