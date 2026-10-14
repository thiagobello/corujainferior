import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { BUCKET_FOTOS, supabase } from './supabase';

/** Abre a câmera ou a galeria. Retorna a URI local ou null se cancelado. */
export async function escolherFoto(origem: 'camera' | 'galeria'): Promise<string | null> {
  const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [3, 4] };
  if (origem === 'camera') {
    if (Platform.OS !== 'web') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) throw new Error('Permissão de câmera negada. Libere nas configurações do aparelho.');
    }
    const r = await ImagePicker.launchCameraAsync(opcoes);
    return r.canceled ? null : r.assets[0].uri;
  }
  const r = await ImagePicker.launchImageLibraryAsync(opcoes);
  return r.canceled ? null : r.assets[0].uri;
}

/** Envia a foto ao armazenamento e devolve o caminho salvo no produto. */
export async function enviarFoto(uri: string, pasta = ''): Promise<string> {
  const resp = await fetch(uri);
  const dados = await resp.arrayBuffer();
  const tipo = resp.headers.get('content-type')?.startsWith('image/') ? resp.headers.get('content-type')! : 'image/jpeg';
  const ext = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : 'jpg';
  const caminho = `${pasta ? `${pasta}/` : ''}${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, dados, { contentType: tipo, upsert: false });
  if (error) throw error;
  return caminho;
}
