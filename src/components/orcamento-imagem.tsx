// Celular (app): a imagem é uma view montada fora da tela e capturada com
// react-native-view-shot. Mesmo visual do canvas da web (lib/orcamento-canvas.ts),
// desenhado aqui com metade das medidas (540 pt) e exportado com 1080 px.
import { useImperativeHandle, useRef, type Ref } from 'react';
import { Image, PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { ItemOrcamento, Orcamento, PecaOrcamento } from '@/lib/api';
import { LOGO_MARCA } from '@/lib/logo-marca';
import {
  type ArquivoImagem, CORES_ORCAMENTO as C, conteudoOrcamento, LARGURA_IMAGEM, nomeArquivoOrcamento, OBSERVACOES_ORCAMENTO, RODAPE_ORCAMENTO,
} from '@/lib/orcamento';

export interface GeradorImagem {
  gerar(): Promise<ArquivoImagem>;
}

const LARGURA = LARGURA_IMAGEM / 2;
const p = (n: number) => n / 2; // medidas do desenho de 1080 px

export function GeradorImagemOrcamento({ ref, orcamento, pecas, itens }: {
  ref: Ref<GeradorImagem>;
  orcamento: Orcamento;
  pecas: PecaOrcamento[];
  itens: ItemOrcamento[];
}) {
  const view = useRef<View>(null);
  const altura = useRef(0);
  const logoPronta = useRef(false);

  useImperativeHandle(ref, () => ({
    async gerar() {
      // Espera a primeira medida e a logo (até ~2 s) antes de capturar.
      for (let t = 0; t < 40 && (!altura.current || !logoPronta.current); t++) await new Promise((r) => setTimeout(r, 50));
      const escala = LARGURA_IMAGEM / LARGURA / PixelRatio.get();
      const uri = await captureRef(view, {
        format: 'png',
        result: 'tmpfile',
        width: LARGURA * escala,
        height: altura.current * escala,
        // A view está fora da tela: no iOS só o renderInContext desenha nesse caso.
        useRenderInContext: Platform.OS === 'ios',
      });
      return { nome: nomeArquivoOrcamento(orcamento), uri };
    },
  }), [orcamento]);

  const c = conteudoOrcamento(orcamento, pecas, itens);

  return (
    <View pointerEvents="none" style={s.fora}>
      <View ref={view} collapsable={false} style={s.folha} onLayout={(e) => { altura.current = e.nativeEvent.layout.height; }}>
        <View style={s.topo}>
          <Image source={{ uri: LOGO_MARCA }} style={s.logo} onLoad={() => { logoPronta.current = true; }} onError={() => { logoPronta.current = true; }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.titulo}>ORÇAMENTO</Text>
            <Text style={s.numero}>{c.titulo}</Text>
          </View>
        </View>
        <View style={s.barra} />

        <View style={s.cliente}>
          <Text style={s.rotulo}>CLIENTE</Text>
          <Text style={s.valorCliente}>{c.cliente}</Text>
          {c.contato && (
            <>
              <Text style={[s.rotulo, { marginTop: p(18) }]}>CONTATO</Text>
              <Text style={s.valorCliente}>{c.contato}</Text>
            </>
          )}
        </View>

        <View style={s.tabela}>
          <View style={[s.linha, s.cabecalho]}>
            <Text style={[s.branco, { fontSize: p(40) }]}>Serviços</Text>
            <Text style={[s.branco, { fontSize: p(40) }]}>Valor</Text>
          </View>
          {c.camisas.map((camisa, k) => (
            <View key={k}>
              <View style={[s.linha, { backgroundColor: C.camisa }]}>
                <Text style={[s.branco, { fontSize: p(38), flex: 1 }]}>{camisa.nome}</Text>
              </View>
              {camisa.linhas.map((ln, i) => (
                <View key={i} style={[s.linha, { backgroundColor: i % 2 === 0 ? C.linhaA : C.linhaB, alignItems: 'flex-start' }]}>
                  <Text style={s.servico}>{ln.descricao}</Text>
                  <View style={{ alignItems: 'flex-end', width: p(250) }}>
                    {ln.unitario && <Text style={s.unitario}>{ln.unitario}</Text>}
                    <Text style={s.valor}>{ln.valor}</Text>
                  </View>
                </View>
              ))}
              {camisa.subtotal && (
                <View style={[s.linha, { backgroundColor: C.subtotal, justifyContent: 'flex-end', gap: p(40) }]}>
                  <Text style={s.subtotal}>Valor desta camisa</Text>
                  <Text style={s.subtotal}>{camisa.subtotal}</Text>
                </View>
              )}
            </View>
          ))}
          <View style={[s.linha, s.total]}>
            <Text style={[s.branco, { fontSize: p(40), flex: 1 }]}>{c.rotuloTotal}</Text>
            <Text style={[s.branco, { fontSize: p(44) }]}>{c.total}</Text>
          </View>
        </View>

        <View style={s.obs}>
          {OBSERVACOES_ORCAMENTO.map((x, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: p(18) }}>
              <Text style={[s.textoObs, s.negrito]}>•</Text>
              <Text style={[s.textoObs, { flex: 1 }, x.forte && s.negrito]}>
                {x.texto}
                {x.destaque && <Text style={s.negrito}>{x.destaque}</Text>}
              </Text>
            </View>
          ))}
        </View>

        <Text style={s.rodape}>{RODAPE_ORCAMENTO}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Fora da área visível, mas montada (a captura precisa da view desenhada).
  fora: { position: 'absolute', left: -LARGURA * 3, top: 0, width: LARGURA },
  folha: { width: LARGURA, backgroundColor: '#fff', paddingHorizontal: p(60), paddingTop: p(56), paddingBottom: p(48) },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: p(180 * (160 / 140)), height: p(180) },
  titulo: { fontSize: p(64), fontWeight: '800', letterSpacing: p(5), color: C.texto },
  numero: { fontSize: p(34), color: C.suave, marginTop: p(6) },
  barra: { height: p(6), backgroundColor: C.escuro, marginTop: p(22), marginBottom: p(32) },
  cliente: { backgroundColor: C.cliente, borderRadius: p(24), padding: p(30), marginBottom: p(32) },
  rotulo: { fontSize: p(24), letterSpacing: p(2), color: C.rotulo },
  valorCliente: { fontSize: p(42), fontWeight: '700', color: C.texto, marginTop: p(4) },
  tabela: { borderRadius: p(24), overflow: 'hidden' },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: p(30), paddingVertical: p(22), gap: p(24) },
  cabecalho: { backgroundColor: C.escuro },
  total: { backgroundColor: C.escuro, paddingVertical: p(28) },
  branco: { color: '#fff', fontWeight: '700' },
  servico: { flex: 1, fontSize: p(34), lineHeight: p(44), fontWeight: '700', color: C.texto },
  unitario: { fontSize: p(26), color: '#666' },
  valor: { fontSize: p(34), lineHeight: p(44), fontWeight: '700', color: C.texto },
  subtotal: { fontSize: p(30), fontWeight: '700', color: '#333' },
  obs: { backgroundColor: C.escuro, borderRadius: p(24), padding: p(30), gap: p(10), marginTop: p(32) },
  textoObs: { color: '#fff', fontSize: p(31), lineHeight: p(44) },
  negrito: { fontWeight: '700' },
  rodape: { textAlign: 'center', color: C.rodape, fontSize: p(26), marginTop: p(36) },
});
