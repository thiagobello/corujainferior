import { useColorScheme } from 'react-native';

import type { Status } from './tipos';

const claro = {
  fundo: '#F4F5F7',
  superficie: '#FFFFFF',
  superficie2: '#EEF0F3',
  borda: '#DADDE3',
  texto: '#14171C',
  texto2: '#5B6270',
  primaria: '#1D5FD1',
  primariaTexto: '#FFFFFF',
  primariaSuave: '#E6EEFC',
  perigo: '#C2362B',
  perigoSuave: '#FBE9E7',
  alerta: '#A35F00',
  alertaSuave: '#FFF3DC',
  info: '#6D3FC7',
  infoSuave: '#F0EAFB',
  neutroSuave: '#E9EBEF',
};

const escuro: typeof claro = {
  fundo: '#0E1013',
  superficie: '#171A1F',
  superficie2: '#1F232A',
  borda: '#2C313A',
  texto: '#ECEEF2',
  texto2: '#9AA1AE',
  primaria: '#5B95F5',
  primariaTexto: '#06101F',
  primariaSuave: '#13264A',
  perigo: '#F06A5E',
  perigoSuave: '#3A1714',
  alerta: '#F0B44C',
  alertaSuave: '#3A2A0E',
  info: '#AE8CF2',
  infoSuave: '#2A1C47',
  neutroSuave: '#262A31',
};

export type Cores = typeof claro;

export function useCores(): Cores {
  return useColorScheme() === 'dark' ? escuro : claro;
}

export function corStatus(c: Cores, s: Status): { fundo: string; texto: string } {
  switch (s) {
    case 'Disponível':
      return { fundo: c.primariaSuave, texto: c.primaria };
    case 'Vendida':
      return { fundo: c.neutroSuave, texto: c.texto2 };
    case 'Reservada':
      return { fundo: c.alertaSuave, texto: c.alerta };
    case 'Emprestada':
      return { fundo: c.infoSuave, texto: c.info };
  }
}

export const ESPACO = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const LARGURA_MAX = 1040;
