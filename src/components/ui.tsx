import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { urlFoto } from '@/lib/supabase';
import { corStatus, ESPACO, LARGURA_MAX, useCores } from '@/lib/tema';
import type { Status } from '@/lib/tipos';

export type Icone = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------
export function Tela({
  children,
  rolagem = true,
  atualizando,
  onAtualizar,
  bordas = ['bottom'],
  estilo,
}: {
  children: ReactNode;
  rolagem?: boolean;
  atualizando?: boolean;
  onAtualizar?: () => void;
  bordas?: ('top' | 'bottom' | 'left' | 'right')[];
  estilo?: StyleProp<ViewStyle>;
}) {
  const c = useCores();
  const conteudo = <View style={[s.conteudo, estilo]}>{children}</View>;
  return (
    <SafeAreaView edges={bordas} style={{ flex: 1, backgroundColor: c.fundo }}>
      {rolagem ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: ESPACO.xl * 2 }}
          refreshControl={onAtualizar ? <RefreshControl refreshing={!!atualizando} onRefresh={onAtualizar} /> : undefined}>
          {conteudo}
        </ScrollView>
      ) : (
        conteudo
      )}
    </SafeAreaView>
  );
}

export function Cartao({ children, estilo, onPress }: { children: ReactNode; estilo?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useCores();
  const base = [s.cartao, { backgroundColor: c.superficie, borderColor: c.borda }, estilo];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.7 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

export function Linha({ children, estilo, gap = ESPACO.sm, quebra }: { children: ReactNode; estilo?: StyleProp<ViewStyle>; gap?: number; quebra?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: quebra ? 'wrap' : 'nowrap' }, estilo]}>{children}</View>;
}

export function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <View style={{ gap: ESPACO.sm }}>
      <Linha estilo={{ justifyContent: 'space-between' }}>
        <T v="secao">{titulo}</T>
        {acao}
      </Linha>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------
type VarianteTexto = 'titulo' | 'secao' | 'corpo' | 'forte' | 'legenda' | 'mono' | 'valor';
export function T({
  children,
  v = 'corpo',
  cor,
  estilo,
  linhas,
  selecionavel,
}: {
  children: ReactNode;
  v?: VarianteTexto;
  cor?: string;
  estilo?: StyleProp<TextStyle>;
  linhas?: number;
  selecionavel?: boolean;
}) {
  const c = useCores();
  const variantes: Record<VarianteTexto, TextStyle> = {
    titulo: { fontSize: 22, fontWeight: '700', color: c.texto },
    secao: { fontSize: 13, fontWeight: '700', color: c.texto2, textTransform: 'uppercase', letterSpacing: 0.5 },
    corpo: { fontSize: 15, color: c.texto },
    forte: { fontSize: 15, fontWeight: '600', color: c.texto },
    legenda: { fontSize: 13, color: c.texto2 },
    mono: { fontSize: 15, fontWeight: '700', color: c.texto, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
    valor: { fontSize: 20, fontWeight: '700', color: c.texto, fontVariant: ['tabular-nums'] },
  };
  return (
    <Text numberOfLines={linhas} selectable={selecionavel} style={[variantes[v], cor ? { color: cor } : null, estilo]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------
type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma';
export function Botao({
  titulo,
  onPress,
  v = 'primario',
  icone,
  carregando,
  desabilitado,
  estilo,
  compacto,
}: {
  titulo: string;
  onPress: () => void;
  v?: VarianteBotao;
  icone?: Icone;
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: StyleProp<ViewStyle>;
  compacto?: boolean;
}) {
  const c = useCores();
  const cores: Record<VarianteBotao, { fundo: string; texto: string; borda: string }> = {
    primario: { fundo: c.primaria, texto: c.primariaTexto, borda: c.primaria },
    secundario: { fundo: c.superficie, texto: c.texto, borda: c.borda },
    perigo: { fundo: c.perigoSuave, texto: c.perigo, borda: c.perigoSuave },
    fantasma: { fundo: 'transparent', texto: c.primaria, borda: 'transparent' },
  };
  const k = cores[v];
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={onPress}
      style={({ pressed }) => [
        s.botao,
        compacto && s.botaoCompacto,
        { backgroundColor: k.fundo, borderColor: k.borda, opacity: inativo ? 0.5 : pressed ? 0.75 : 1 },
        estilo,
      ]}>
      {carregando ? (
        <ActivityIndicator color={k.texto} />
      ) : (
        <>
          {icone && <Ionicons name={icone} size={compacto ? 16 : 18} color={k.texto} />}
          <Text style={{ color: k.texto, fontWeight: '600', fontSize: compacto ? 14 : 16 }}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

export function BotaoIcone({ icone, onPress, rotulo, cor }: { icone: Icone; onPress: () => void; rotulo: string; cor?: string }) {
  const c = useCores();
  return (
    <Pressable accessibilityLabel={rotulo} onPress={onPress} hitSlop={8} style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icone} size={22} color={cor ?? c.texto} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------
export function Campo({
  rotulo,
  erro,
  ajuda,
  estilo,
  limpar,
  ...props
}: TextInputProps & {
  rotulo?: string;
  erro?: string | null;
  ajuda?: string;
  estilo?: StyleProp<ViewStyle>;
  /** Campo de busca: mostra um X que apaga o texto (só quando há texto). */
  limpar?: boolean;
}) {
  const c = useCores();
  const mostrarX = !!limpar && !!props.value;
  return (
    // minWidth em vez de flexBasis: em coluna, flexBasis viraria altura.
    <View style={[{ gap: 4, flexGrow: 1, flexShrink: 1, minWidth: 140 }, estilo]}>
      {rotulo && <T v="legenda">{rotulo}</T>}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor={c.texto2}
          {...props}
          style={[
            s.campo,
            { backgroundColor: c.superficie, borderColor: erro ? c.perigo : c.borda, color: c.texto },
            props.multiline && { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
            props.style,
            mostrarX && { paddingRight: 44 },
          ]}
        />
        {mostrarX && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpar busca"
            onPress={() => props.onChangeText?.('')}
            style={({ pressed }) => [s.limpar, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name="close-circle" size={20} color={c.texto2} />
          </Pressable>
        )}
      </View>
      {erro ? <T v="legenda" cor={c.perigo}>{erro}</T> : ajuda ? <T v="legenda">{ajuda}</T> : null}
    </View>
  );
}

/** Seleção por "chips". Com `multi`, value é um array. */
export function Chips<V extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  rotulos,
  permiteVazio,
}: {
  opcoes: readonly V[];
  valor: V | null | undefined;
  onChange: (v: V | null) => void;
  rotulo?: string;
  rotulos?: Partial<Record<V, string>>;
  permiteVazio?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      {rotulo && <T v="legenda">{rotulo}</T>}
      <Linha quebra gap={6}>
        {opcoes.map((o) => (
          <Chip key={o} titulo={rotulos?.[o] ?? o} ativo={valor === o} onPress={() => onChange(valor === o && permiteVazio ? null : o)} />
        ))}
      </Linha>
    </View>
  );
}

export function ChipsMulti<V extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  rotulos,
}: {
  opcoes: readonly V[];
  valor: V[];
  onChange: (v: V[]) => void;
  rotulo?: string;
  rotulos?: Partial<Record<V, string>>;
}) {
  return (
    <View style={{ gap: 6 }}>
      {rotulo && <T v="legenda">{rotulo}</T>}
      <Linha quebra gap={6}>
        {opcoes.map((o) => (
          <Chip
            key={o}
            titulo={rotulos?.[o] ?? o}
            ativo={valor.includes(o)}
            onPress={() => onChange(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o])}
          />
        ))}
      </Linha>
    </View>
  );
}

export function Chip({ titulo, ativo, onPress }: { titulo: string; ativo: boolean; onPress: () => void }) {
  const c = useCores();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        { backgroundColor: ativo ? c.primaria : c.superficie, borderColor: ativo ? c.primaria : c.borda, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={{ color: ativo ? c.primariaTexto : c.texto, fontWeight: ativo ? '600' : '400', fontSize: 14 }}>{titulo}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------
export function Selo({ status }: { status: Status }) {
  const c = useCores();
  const k = corStatus(c, status);
  return (
    <View style={[s.selo, { backgroundColor: k.fundo }]}>
      <Text style={{ color: k.texto, fontSize: 12, fontWeight: '700' }}>{status}</Text>
    </View>
  );
}

export function Etiqueta({ texto, cor, fundo }: { texto: string; cor?: string; fundo?: string }) {
  const c = useCores();
  return (
    <View style={[s.selo, { backgroundColor: fundo ?? c.neutroSuave }]}>
      <Text style={{ color: cor ?? c.texto2, fontSize: 12, fontWeight: '600' }}>{texto}</Text>
    </View>
  );
}

export function Estatistica({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  const c = useCores();
  return (
    <View style={[s.estat, { backgroundColor: c.superficie, borderColor: c.borda }]}>
      <T v="legenda">{rotulo}</T>
      <T v="valor" cor={cor}>{valor}</T>
      {detalhe ? <T v="legenda">{detalhe}</T> : null}
    </View>
  );
}

export function ParValor({ rotulo, valor, destaque, cor }: { rotulo: string; valor: ReactNode; destaque?: boolean; cor?: string }) {
  return (
    <Linha estilo={{ justifyContent: 'space-between', paddingVertical: 3 }}>
      <T v={destaque ? 'forte' : 'legenda'}>{rotulo}</T>
      {typeof valor === 'string' ? (
        <T v={destaque ? 'forte' : 'corpo'} cor={cor} estilo={{ fontVariant: ['tabular-nums'] }}>
          {valor}
        </T>
      ) : (
        valor
      )}
    </Linha>
  );
}

export function Foto({ path, uri, tamanho = 56, raio = 8 }: { path?: string | null; uri?: string | null; tamanho?: number; raio?: number }) {
  const c = useCores();
  const src = uri ?? urlFoto(path);
  if (!src) {
    return (
      <View style={{ width: tamanho, height: tamanho, borderRadius: raio, backgroundColor: c.superficie2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="shirt-outline" size={tamanho * 0.45} color={c.texto2} />
      </View>
    );
  }
  return <Image source={{ uri: src }} style={{ width: tamanho, height: tamanho, borderRadius: raio, backgroundColor: c.superficie2 }} contentFit="cover" transition={150} />;
}

export function Aviso({ texto, tipo = 'alerta', acao }: { texto: string; tipo?: 'alerta' | 'perigo' | 'info' | 'sucesso'; acao?: ReactNode }) {
  const c = useCores();
  const k = {
    alerta: [c.alertaSuave, c.alerta, 'warning-outline'],
    perigo: [c.perigoSuave, c.perigo, 'alert-circle-outline'],
    info: [c.infoSuave, c.info, 'information-circle-outline'],
    sucesso: [c.primariaSuave, c.primaria, 'checkmark-circle-outline'],
  }[tipo] as [string, string, Icone];
  return (
    <View style={[s.aviso, { backgroundColor: k[0] }]}>
      <Ionicons name={k[2]} size={20} color={k[1]} />
      <Text style={{ color: k[1], flex: 1, fontSize: 14, lineHeight: 20 }}>{texto}</Text>
      {acao}
    </View>
  );
}

export function Carregando({ texto }: { texto?: string }) {
  const c = useCores();
  return (
    <View style={{ padding: ESPACO.xl, alignItems: 'center', gap: ESPACO.sm }}>
      <ActivityIndicator color={c.primaria} />
      {texto ? <T v="legenda">{texto}</T> : null}
    </View>
  );
}

export function Vazio({ icone = 'file-tray-outline', texto, acao }: { icone?: Icone; texto: string; acao?: ReactNode }) {
  const c = useCores();
  return (
    <View style={{ padding: ESPACO.xl, alignItems: 'center', gap: ESPACO.sm }}>
      <Ionicons name={icone} size={36} color={c.texto2} />
      <T v="legenda" estilo={{ textAlign: 'center' }}>{texto}</T>
      {acao}
    </View>
  );
}

export function ErroCaixa({ erro, onTentar }: { erro: string; onTentar?: () => void }) {
  return <Aviso tipo="perigo" texto={erro} acao={onTentar ? <Botao compacto v="secundario" titulo="Tentar de novo" onPress={onTentar} /> : undefined} />;
}

export function Separador() {
  const c = useCores();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.borda, marginVertical: ESPACO.xs }} />;
}

const s = StyleSheet.create({
  conteudo: { width: '100%', maxWidth: LARGURA_MAX, alignSelf: 'center', padding: ESPACO.lg, gap: ESPACO.lg },
  cartao: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: ESPACO.lg, gap: ESPACO.sm },
  botao: {
    minHeight: 48,
    paddingHorizontal: ESPACO.lg,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ESPACO.sm,
  },
  botaoCompacto: { minHeight: 36, paddingHorizontal: ESPACO.md },
  campo: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: ESPACO.md, fontSize: 16 },
  // Área de toque de 44 px dentro do campo, colada à direita.
  limpar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  estat: { flexGrow: 1, flexBasis: 150, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: ESPACO.md, gap: 2 },
  aviso: { flexDirection: 'row', gap: ESPACO.sm, alignItems: 'center', padding: ESPACO.md, borderRadius: 10 },
});
