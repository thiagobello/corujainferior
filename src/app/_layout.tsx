import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogosProvider } from '@/components/dialogos';
import { Login } from '@/components/login';
import { Aviso, Botao, Carregando, Tela, T } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SUPABASE_CONFIGURADO } from '@/lib/supabase';
import { useCores } from '@/lib/tema';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const esquema = useColorScheme();
  const c = useCores();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  const base = esquema === 'dark' ? DarkTheme : DefaultTheme;
  const tema = { ...base, colors: { ...base.colors, background: c.fundo, card: c.superficie, primary: c.primaria, text: c.texto, border: c.borda } };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={tema}>
        <DialogosProvider>
          {SUPABASE_CONFIGURADO ? (
            <AuthProvider>
              <Portao />
            </AuthProvider>
          ) : (
            <SemConfiguracao />
          )}
        </DialogosProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Portao() {
  const { sessao, perfil, carregando, sair } = useAuth();
  if (carregando) return <Tela bordas={['top', 'bottom']}><Carregando texto="Carregando…" /></Tela>;
  if (!sessao) return <Login />;
  if (!perfil?.ativo) {
    return (
      <Tela bordas={['top', 'bottom']}>
        <T v="titulo">Acesso desativado</T>
        <Aviso texto="Usuário inativo. Peça acesso a um administrador." />
        <Botao v="secundario" titulo="Sair" onPress={sair} />
      </Tela>
    );
  }
  return (
    <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="produto/[id]" options={{ title: 'Produto' }} />
      <Stack.Screen name="grupo" options={{ title: 'Produto' }} />
      <Stack.Screen name="scanner" options={{ title: 'Escanear tag' }} />
      <Stack.Screen name="repasses" options={{ title: 'Repasses' }} />
      <Stack.Screen name="produto/editar/[id]" options={{ title: 'Editar produto' }} />
      <Stack.Screen name="venda/nova" options={{ title: 'Nova venda' }} />
      <Stack.Screen name="venda/avulsa" options={{ title: 'Venda avulsa' }} />
      <Stack.Screen name="vendas" options={{ title: 'Vendas' }} />
      <Stack.Screen name="venda/[id]" options={{ title: 'Venda' }} />
      <Stack.Screen name="pagamentos" options={{ title: 'A receber' }} />
      <Stack.Screen name="reservas" options={{ title: 'Reservas' }} />
      <Stack.Screen name="site" options={{ title: 'Remover do site' }} />
      <Stack.Screen name="painel" options={{ title: 'Painel' }} />
      <Stack.Screen name="orcamentos/novo" options={{ title: 'Novo orçamento' }} />
      <Stack.Screen name="orcamentos/[id]" options={{ title: 'Orçamento' }} />
      <Stack.Screen name="orcamentos/editar/[id]" options={{ title: 'Editar orçamento' }} />
      <Stack.Screen name="config/orcamentos" options={{ title: 'Serviços e status' }} />
      <Stack.Screen name="config/categorias" options={{ title: 'Categorias' }} />
      <Stack.Screen name="config/taxas" options={{ title: 'Taxas' }} />
      <Stack.Screen name="config/consignantes" options={{ title: 'Concessão' }} />
      <Stack.Screen name="config/usuarios" options={{ title: 'Usuários' }} />
    </Stack>
  );
}

function SemConfiguracao() {
  return (
    <Tela bordas={['top', 'bottom']}>
      <T v="titulo">Configuração pendente</T>
      <Aviso
        tipo="info"
        texto="Preencha o .env.local (veja o README) e reinicie o servidor."
      />
    </Tela>
  );
}
