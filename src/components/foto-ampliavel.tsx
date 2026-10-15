// Miniatura que abre a foto em tela cheia ao tocar (detalhe do produto).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { urlFoto } from '@/lib/supabase';
import { Foto } from './ui';

export function FotoAmpliavel({ path, tamanho, raio }: { path?: string | null; tamanho?: number; raio?: number }) {
  const [aberta, setAberta] = useState(false);
  const insets = useSafeAreaInsets();
  const src = urlFoto(path);

  // Sem foto: só o ícone, nada para ampliar.
  if (!src) return <Foto path={path} tamanho={tamanho} raio={raio} />;

  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Ampliar foto" onPress={() => setAberta(true)}>
        {({ pressed }) => (
          <View style={{ opacity: pressed ? 0.8 : 1 }}>
            <Foto path={path} tamanho={tamanho} raio={raio} />
          </View>
        )}
      </Pressable>

      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable accessibilityLabel="Fechar foto" style={s.fundo} onPress={() => setAberta(false)}>
          <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
          <View style={[s.fechar, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={26} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  fechar: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
