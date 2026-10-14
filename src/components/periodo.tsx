import { useState } from 'react';
import { View } from 'react-native';

import { ESPACO } from '@/lib/tema';
import { hojeISO } from '@/lib/tipos';
import { Campo, Chips, Linha } from './ui';

export type Periodo = { inicio: string; fim: string };
type Opcao = 'hoje' | '7d' | 'mes' | 'mes_passado' | 'ano' | 'tudo' | 'personalizado';

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function calcularPeriodo(o: Opcao): Periodo {
  const hoje = new Date();
  const h = hojeISO();
  switch (o) {
    case 'hoje':
      return { inicio: h, fim: h };
    case '7d':
      return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)), fim: h };
    case 'mes':
      return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: h };
    case 'mes_passado':
      return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), fim: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
    case 'ano':
      return { inicio: iso(new Date(hoje.getFullYear(), 0, 1)), fim: h };
    default:
      return { inicio: '2000-01-01', fim: '2100-12-31' };
  }
}

const br = (s: string) => s.split('-').reverse().join('/');
const deBr = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function FiltroPeriodo({ onChange, inicial = 'mes' }: { onChange: (p: Periodo) => void; inicial?: Opcao }) {
  const [opcao, setOpcao] = useState<Opcao>(inicial);
  const p0 = calcularPeriodo('mes');
  const [ini, setIni] = useState(br(p0.inicio));
  const [fim, setFim] = useState(br(p0.fim));

  function escolher(o: Opcao | null) {
    if (!o) return;
    setOpcao(o);
    if (o !== 'personalizado') onChange(calcularPeriodo(o));
  }
  function aplicarPersonalizado(i: string, f: string) {
    const a = deBr(i);
    const b = deBr(f);
    if (a && b) onChange({ inicio: a, fim: b });
  }

  return (
    <View style={{ gap: ESPACO.sm }}>
      <Chips
        opcoes={['hoje', '7d', 'mes', 'mes_passado', 'ano', 'tudo', 'personalizado'] as const}
        rotulos={{ hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', mes_passado: 'Mês passado', ano: 'Este ano', tudo: 'Tudo', personalizado: 'Personalizado' }}
        valor={opcao}
        onChange={escolher}
      />
      {opcao === 'personalizado' && (
        <Linha>
          <Campo rotulo="De (DD/MM/AAAA)" value={ini} onChangeText={(t) => { setIni(t); aplicarPersonalizado(t, fim); }} keyboardType="numbers-and-punctuation" />
          <Campo rotulo="Até" value={fim} onChangeText={(t) => { setFim(t); aplicarPersonalizado(ini, t); }} keyboardType="numbers-and-punctuation" />
        </Linha>
      )}
    </View>
  );
}
