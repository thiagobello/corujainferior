import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Botao, Tela } from '@/components/ui';
import { VendaForm } from '@/components/venda-form';
import { usePuxar } from '@/lib/usePuxar';

export default function BaixaRapida() {
  const { codigo, t } = useLocalSearchParams<{ codigo?: string; t?: string }>();
  const [recarga, setRecarga] = useState(0);
  const puxar = usePuxar(() => setRecarga((r) => r + 1));
  return (
    <Tela {...puxar} bordas={[]}>
      {/* `t` força recomeçar quando o scanner envia o mesmo código de novo */}
      <VendaForm key={`${codigo ?? ''}-${t ?? ''}`} multi={false} codigoInicial={codigo} origem="baixa_rapida" recarga={recarga} />
      <Botao v="fantasma" titulo="Vender vários itens" icone="cart-outline" onPress={() => router.push('/venda/nova')} />
    </Tela>
  );
}
