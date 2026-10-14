import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mensagemErro } from './supabase';

/** Carrega dados ao focar a tela (e quando `deps` mudam) e expõe
 *  recarregar/erro/carregando. */
export function useConsulta<T>(buscar: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const seq = useRef(0);
  const buscarRef = useRef(buscar);
  useEffect(() => {
    buscarRef.current = buscar;
  });
  const chave = JSON.stringify(deps);

  const recarregar = useCallback(async () => {
    const n = ++seq.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await buscarRef.current();
      if (n === seq.current) setDados(r);
    } catch (e) {
      if (n === seq.current) setErro(mensagemErro(e));
    } finally {
      if (n === seq.current) setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      recarregar();
      // `chave` é intencional: recarrega quando os parâmetros da consulta mudam.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recarregar, chave]),
  );

  return { dados, erro, carregando, recarregar, setDados };
}
