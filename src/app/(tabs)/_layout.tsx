import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { AlertaSitePopup } from '@/components/alerta-site';
import type { Icone } from '@/components/ui';
import { useCores } from '@/lib/tema';

const icone = (nome: Icone) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={nome} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const c = useCores();
  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: c.primaria,
          tabBarInactiveTintColor: c.texto2,
          tabBarStyle: { backgroundColor: c.superficie, borderTopColor: c.borda },
          headerStyle: { backgroundColor: c.superficie },
          headerTintColor: c.texto,
        }}>
        <Tabs.Screen name="index" options={{ title: 'Estoque', tabBarIcon: icone('cube-outline') }} />
        <Tabs.Screen name="baixa" options={{ title: 'Baixa Rápida', tabBarIcon: icone('flash-outline') }} />
        <Tabs.Screen name="cadastrar" options={{ title: 'Cadastrar', headerTitle: 'Cadastrar produto', tabBarIcon: icone('add-circle-outline') }} />
        <Tabs.Screen name="orcamentos" options={{ title: 'Orçamentos', tabBarIcon: icone('document-text-outline') }} />
        <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: icone('menu-outline') }} />
      </Tabs>
      <AlertaSitePopup />
    </>
  );
}
