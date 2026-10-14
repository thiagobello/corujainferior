import { useState } from 'react';

/** Estado do "puxar para atualizar" para telas sem consulta própria. */
export function usePuxar(acao: () => unknown) {
  const [atualizando, setAtualizando] = useState(false);
  async function onAtualizar() {
    setAtualizando(true);
    try {
      await acao();
    } finally {
      setAtualizando(false);
    }
  }
  return { atualizando, onAtualizar };
}
