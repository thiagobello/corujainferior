import { useState } from 'react';

import { Tela } from '@/components/ui';
import { VendaForm } from '@/components/venda-form';
import { usePuxar } from '@/lib/usePuxar';

/** Venda de item sem cadastro (ex.: isqueiros): lançado só na hora da venda. */
export default function VendaAvulsa() {
  const [recarga, setRecarga] = useState(0);
  const puxar = usePuxar(() => setRecarga((r) => r + 1));
  return (
    <Tela {...puxar}>
      <VendaForm multi origem="venda" avulsoInicial recarga={recarga} />
    </Tela>
  );
}
