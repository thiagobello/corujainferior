import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { armazenamento } from './armazenamento';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const chave = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const SUPABASE_CONFIGURADO = Boolean(url && chave);

export const supabase = createClient(url || 'http://localhost', chave || 'sem-chave', {
  auth: {
    storage: armazenamento,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const BUCKET_FOTOS = 'produtos';

export function urlFoto(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl;
}

/** Mensagem legível para erros do Supabase/Postgres e de rede. */
export function mensagemErro(e: unknown): string {
  if (!e) return 'Erro desconhecido';
  const err = e as { message?: string; code?: string; details?: string };
  const msg = err.message ?? String(e);
  if (/Failed to fetch|Network request failed|NetworkError/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  }
  if (err.code === '23505') return 'Registro duplicado: este item já existe.';
  if (err.code === '42501') return msg.includes('administradores') ? msg : 'Você não tem permissão para esta ação.';
  return msg;
}
