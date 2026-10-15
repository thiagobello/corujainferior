import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { comprimirFoto } from './comprimir-foto';
import { BUCKET_FOTOS, supabase } from './supabase';

/**
 * Abre a câmera ou a galeria e já devolve a foto reduzida (JPEG, lado maior 1280 px),
 * ou null se cancelado. Comprimir aqui tira o trabalho do toque em "Cadastrar"/"Salvar".
 */
export async function escolherFoto(origem: 'camera' | 'galeria'): Promise<string | null> {
  // quality 1: a única compressão é a de comprimirFoto (evita JPEG regravado duas vezes).
  // Na web, allowsEditing/aspect são ignorados pelo navegador.
  const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [3, 4] };
  let r: ImagePicker.ImagePickerResult;
  if (origem === 'camera') {
    if (Platform.OS !== 'web') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) throw new Error('Permissão de câmera negada. Libere nas configurações do aparelho.');
    }
    r = await ImagePicker.launchCameraAsync(opcoes);
  } else {
    r = await ImagePicker.launchImageLibraryAsync(opcoes);
  }
  return r.canceled ? null : comprimirFoto(r.assets[0].uri);
}

/** Envia a foto (já comprimida por escolherFoto) e devolve o caminho salvo. */
export async function enviarFoto(uri: string, pasta = ''): Promise<string> {
  const dados = await (await fetch(uri)).arrayBuffer();
  const caminho = `${pasta ? `${pasta}/` : ''}${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, dados, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return caminho;
}
