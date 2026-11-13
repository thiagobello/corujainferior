import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { GeradorImagemOrcamento, type GeradorImagem } from '@/components/orcamento-imagem';
import { Selecao } from '@/components/selecao';
import { SeloOrcamento } from '@/components/status-orcamento';
import { Aviso, Botao, Cartao, Carregando, ErroCaixa, Foto, Linha, ParValor, Secao, Separador, T, Tela } from '@/components/ui';
import { alterarStatusOrcamento, listarStatusOrcamento, obterOrcamento } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { numeroOrcamento } from '@/lib/orcamento';
import { baixarImagem, compartilharImagem, podeCompartilhar, type ArquivoImagem } from '@/lib/orcamento-imagem';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO } from '@/lib/tema';
import { dataBR, dataHoraBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

export default function DetalheOrcamento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(async () => {
    const [o, status] = await Promise.all([obterOrcamento(id), listarStatusOrcamento()]);
    return { ...o, status };
  }, [id]);
  const gerador = useRef<GeradorImagem>(null);
  const [gerando, setGerando] = useState(false);
  // Imagem pronta (web): o compartilhar precisa sair de um toque do usuário.
  const [imagemPronta, setImagemPronta] = useState<{ arquivo: ArquivoImagem; versao: string } | null>(null);
  const [mudando, setMudando] = useState(false);

  if (erro) return <Tela onAtualizar={recarregar}><ErroCaixa erro={erro} onTentar={recarregar} /></Tela>;
  if (!dados) return <Tela><Carregando /></Tela>;
  const { orcamento: o, pecas, itens, historico, status } = dados;
  const rotulo = (cod: string | null) => status.find((s) => s.codigo === cod)?.rotulo ?? cod ?? '';

  async function gerarImagem() {
    if (!gerador.current) return;
    setGerando(true);
    try {
      const arquivo = await gerador.current.gerar();
      if (Platform.OS === 'web') setImagemPronta({ arquivo, versao: o.atualizado_em });
      else await compartilharImagem(arquivo);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setGerando(false);
    }
  }

  async function entregarImagem(acao: 'compartilhar' | 'baixar') {
    if (!imagemPronta) return;
    try {
      const r = acao === 'compartilhar' ? await compartilharImagem(imagemPronta.arquivo) : await baixarImagem(imagemPronta.arquivo);
      if (r === 'baixado') avisar('Imagem baixada');
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  // Imagem gerada antes de uma edição fica desatualizada.
  const imagem = imagemPronta?.versao === o.atualizado_em ? imagemPronta.arquivo : null;

  async function mudarStatus(novo: string | null) {
    if (!novo || novo === o.status) return;
    setMudando(true);
    try {
      await alterarStatusOrcamento(o.id, novo);
      avisar(`Status: ${rotulo(novo)}`);
      await recarregar();
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setMudando(false);
    }
  }

  const opcoesStatus = status.filter((s) => s.ativo || s.codigo === o.status).map((s) => ({ valor: s.codigo, rotulo: s.rotulo }));

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <Stack.Screen options={{ title: `Orçamento ${numeroOrcamento(o.numero)}` }} />
      <GeradorImagemOrcamento ref={gerador} orcamento={o} pecas={pecas} itens={itens} />
      <View style={{ gap: 4 }}>
        <Linha estilo={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <T v="titulo" estilo={{ flex: 1 }}>{o.cliente_nome}</T>
          <SeloOrcamento codigo={o.status} rotulo={rotulo(o.status)} />
        </Linha>
        <T v="legenda" selecionavel>
          Nº {numeroOrcamento(o.numero)} · {dataBR(o.criado_em)}{o.contato ? ` · ${o.contato}` : ''}
        </T>
      </View>

      <Linha>
        <Botao titulo="Gerar imagem" icone="image-outline" onPress={gerarImagem} carregando={gerando} estilo={{ flex: 1 }} />
        <Botao v="secundario" titulo="Editar" icone="create-outline" onPress={() => router.push(`/orcamentos/editar/${o.id}`)} estilo={{ flex: 1 }} />
      </Linha>

      {imagem && (
        <Aviso
          tipo="sucesso"
          texto="Imagem pronta."
          acao={
            <Linha gap={ESPACO.xs}>
              {podeCompartilhar(imagem) && <Botao compacto titulo="Compartilhar" icone="share-outline" onPress={() => entregarImagem('compartilhar')} />}
              <Botao compacto v="secundario" titulo="Baixar" icone="download-outline" onPress={() => entregarImagem('baixar')} />
            </Linha>
          }
        />
      )}

      <Selecao rotulo={mudando ? 'Alterando status…' : 'Status'} opcoes={opcoesStatus} valor={o.status} onChange={mudarStatus} />

      {pecas.map((pc) => (
        <Cartao key={pc.id}>
          <T v="forte" estilo={{ fontSize: 17 }}>{pc.nome}</T>
          {pc.fotos.length > 0 && (
            <Linha quebra gap={ESPACO.sm}>
              {pc.fotos.map((f) => <Foto key={f} path={f} tamanho={80} raio={10} />)}
            </Linha>
          )}
          {itens.filter((i) => i.peca_id === pc.id).map((i) => (
            <ParValor
              key={i.id}
              rotulo={i.quantidade > 1 ? `${i.quantidade}× ${i.descricao}` : i.descricao}
              valor={brlReais(Number(i.valor_unitario) * i.quantidade)}
            />
          ))}
          <Separador />
          <ParValor rotulo="Valor desta camisa" valor={brlReais(pc.subtotal)} destaque />
        </Cartao>
      ))}

      <Cartao>
        <ParValor rotulo={`Valor total · ${pecas.length} ${pecas.length === 1 ? 'camisa' : 'camisas'}`} valor={brlReais(o.total)} destaque />
      </Cartao>

      {o.observacoes && (
        <Secao titulo="Anotações">
          <Cartao>
            <T>{o.observacoes}</T>
          </Cartao>
        </Secao>
      )}

      <Secao titulo="Histórico">
        <Cartao>
          {historico.map((h, k) => (
            <View key={h.id}>
              {k > 0 && <Separador />}
              <Linha estilo={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                <T>{h.status_anterior ? `${rotulo(h.status_anterior)} → ${rotulo(h.status_novo)}` : `Criado como ${rotulo(h.status_novo)}`}</T>
                <T v="legenda">{dataHoraBR(h.criado_em)}</T>
              </Linha>
            </View>
          ))}
        </Cartao>
      </Secao>
    </Tela>
  );
}
