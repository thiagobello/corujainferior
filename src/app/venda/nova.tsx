import { useState } from 'react';

import { Tela } from '@/components/ui';
import { VendaForm } from '@/components/venda-form';
import { usePuxar } from '@/lib/usePuxar';

export default function NovaVenda() {
  const [recarga, setRecarga] = useState(0);
  const puxar = usePuxar(() => setRecarga((r) => r + 1));
  return (
    <Tela {...puxar}>
      <VendaForm multi origem="venda" recarga={recarga} />
    </Tela>
  );
}
