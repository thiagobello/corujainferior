import { useCores } from '@/lib/tema';
import { Etiqueta } from './ui';

/** Cor por status: pendente (alerta), aprovado/pronta (azul), recusado (vermelho), demais (roxo). */
export function SeloOrcamento({ codigo, rotulo }: { codigo: string; rotulo?: string }) {
  const c = useCores();
  const [cor, fundo] =
    codigo === 'pendente'
      ? [c.alerta, c.alertaSuave]
      : codigo === 'recusado'
        ? [c.perigo, c.perigoSuave]
        : codigo === 'aprovado' || codigo === 'pronta_retirada'
          ? [c.primaria, c.primariaSuave]
          : [c.info, c.infoSuave];
  return <Etiqueta texto={rotulo ?? codigo} cor={cor} fundo={fundo} />;
}
