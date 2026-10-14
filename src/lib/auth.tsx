import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Perfil } from './tipos';

interface Auth {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  admin: boolean;
  sair: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('AuthProvider ausente');
  return a;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarPerfil(s: Session | null) {
    if (!s) {
      setPerfil(null);
      return;
    }
    const { data } = await supabase.from('perfis').select('*').eq('id', s.user.id).maybeSingle();
    setPerfil((data as Perfil) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        // Fora do callback para não travar o cliente de auth.
        setTimeout(() => carregarPerfil(s), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        sessao,
        perfil,
        carregando,
        admin: perfil?.papel === 'admin' && perfil.ativo,
        sair: async () => {
          await supabase.auth.signOut();
        },
        recarregarPerfil: () => carregarPerfil(sessao),
      }}>
      {children}
    </Ctx.Provider>
  );
}
