// Escanear Tag — etapa 7. Por enquanto: localização pelo código digitado
// (alternativa manual exigida para quando câmera/OCR não estiverem
// disponíveis). A leitura por câmera + OCR será conectada aqui.
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Aviso, Botao, Campo, Cartao, Foto, Linha, ParValor, Selo, T, Tela } from '@/components/ui';
import { buscarPorCodigo } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { usePuxar } from '@/lib/usePuxar';
import { ESPACO } from '@/lib/tema';
import type { Produto } from '@/lib/tipos';

export default function Scanner() {
  const [codigo, setCodigo] = useState('');
  const [produto, setProduto] = useState<Produto | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  const puxar = usePuxar(() => (produto ? buscar() : undefined));

  async function buscar() {
    if (!codigo.trim()) return;
    setBuscando(true);
    setMsg(null);
    setProduto(null);
    try {
      const p = await buscarPorCodigo(codigo);
      if (p) setProduto(p);
      else setMsg(`Código ${codigo.trim().toUpperCase()} não encontrado.`);
    } catch (e) {
      setMsg(mensagemErro(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Tela {...puxar}>
      <Aviso tipo="info" texto="Leitura pela câmera em breve. Digite o código da etiqueta." />
      <Linha estilo={{ alignItems: 'flex-end' }}>
        <Campo
          rotulo="Código da etiqueta"
          placeholder="Ex.: M1386"
          value={codigo}
          onChangeText={setCodigo}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={buscar}
          returnKeyType="search"
          style={{ fontSize: 22, fontWeight: '700', letterSpacing: 1 }}
        />
        <Botao titulo="Buscar" icone="search" onPress={buscar} carregando={buscando} />
      </Linha>
      {msg && <Aviso texto={msg} />}
      {produto && (
        <Cartao>
          <Linha gap={ESPACO.md} estilo={{ alignItems: 'flex-start' }}>
            <Foto path={produto.foto_path} tamanho={110} raio={10} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="titulo" estilo={{ fontSize: 19 }}>{produto.descricao}</T>
              <T v="legenda">{produto.codigo}</T>
              <Selo status={produto.status} />
            </View>
          </Linha>
          <ParValor rotulo="Tamanho" valor={produto.tamanho ?? '—'} />
          <ParValor rotulo="Pertence" valor={produto.pertence} />
          <ParValor rotulo="Preço atual" valor={brlReais(produto.preco_venda)} destaque />
          <Linha>
            <Botao v="secundario" titulo="Abrir produto" onPress={() => router.push(`/produto/${produto.id}`)} estilo={{ flex: 1 }} />
            <Botao
              titulo="Baixa rápida"
              icone="flash"
              desabilitado={produto.status !== 'Disponível'}
              onPress={() => router.navigate({ pathname: '/baixa', params: { codigo: produto.codigo, t: String(Date.now()) } })}
              estilo={{ flex: 1 }}
            />
          </Linha>
          {produto.status !== 'Disponível' && <T v="legenda">Produto {produto.status.toLowerCase()}: não pode ser vendido.</T>}
        </Cartao>
      )}
    </Tela>
  );
}
