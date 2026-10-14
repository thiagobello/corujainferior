// Configuração dos orçamentos: tabela de serviços (valores) e status.
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, Chips, ErroCaixa, Etiqueta, Linha, Secao, T, Tela } from '@/components/ui';
import { GRUPOS_SERVICO, listarServicos, listarStatusOrcamento, nomeServico, salvarServico, salvarStatusOrcamento, type GrupoServico, type Servico } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brlReais, centavosParaTexto, lerValor, paraCentavos, paraReais } from '@/lib/dinheiro';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO } from '@/lib/tema';
import { useConsulta } from '@/lib/useConsulta';

type FormServico = { id?: string; nome: string; detalhe: string; valor: string; a_partir_de: boolean; ativo: boolean; grupo: GrupoServico };

export default function ConfigOrcamentos() {
  const { admin } = useAuth();
  const { avisar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(async () => {
    const [servicos, status] = await Promise.all([listarServicos(), listarStatusOrcamento()]);
    return { servicos, status };
  });
  const [form, setForm] = useState<FormServico | null>(null);
  const [novoStatus, setNovoStatus] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function executar(chave: string, acao: () => Promise<unknown>, msg: string) {
    setOcupado(chave);
    try {
      await acao();
      avisar(msg);
      await recarregar();
      return true;
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
      return false;
    } finally {
      setOcupado(null);
    }
  }

  function editar(s: Servico) {
    setForm({ id: s.id, nome: s.nome, detalhe: s.detalhe ?? '', valor: centavosParaTexto(paraCentavos(s.valor)), a_partir_de: s.a_partir_de, ativo: s.ativo, grupo: s.grupo });
  }

  async function salvar() {
    if (!form) return;
    const v = lerValor(form.valor);
    if (!form.nome.trim()) return avisar('Informe o nome do serviço', 'erro');
    if (v === null || v < 0) return avisar('Valor inválido', 'erro');
    const ok = await executar('servico', () => salvarServico({ ...form, valor: paraReais(v) }), form.id ? 'Serviço atualizado' : 'Serviço adicionado');
    if (ok) setForm(null);
  }

  async function criarStatus() {
    if (!novoStatus.trim()) return;
    if (await executar('status-novo', () => salvarStatusOrcamento(null, novoStatus, true), `Status “${novoStatus.trim()}” criado`)) setNovoStatus('');
  }

  if (!admin) return <Tela><Aviso texto="Apenas administradores." /></Tela>;

  const editor = form && (
    <Cartao>
      <T v="forte">{form.id ? 'Editar serviço' : 'Novo serviço'}</T>
      <Campo rotulo="Nome" value={form.nome} onChangeText={(t) => setForm({ ...form, nome: t })} placeholder="Ex.: Costura" autoFocus={!form.id} />
      <Chips
        rotulo="Posição"
        opcoes={GRUPOS_SERVICO.map((g) => g.grupo)}
        rotulos={Object.fromEntries(GRUPOS_SERVICO.map((g) => [g.grupo, g.rotulo]))}
        valor={form.grupo}
        onChange={(v) => v && setForm({ ...form, grupo: v })}
      />
      <Campo rotulo="Variação (opcional)" value={form.detalhe} onChangeText={(t) => setForm({ ...form, detalhe: t })} placeholder="Ex.: cor única, colorido, par" />
      <Campo rotulo="Valor (R$)" value={form.valor} onChangeText={(t) => setForm({ ...form, valor: t })} keyboardType="decimal-pad" />
      <Chips
        opcoes={['fixo', 'a_partir'] as const}
        rotulos={{ fixo: 'Valor fixo', a_partir: 'A partir de' }}
        valor={form.a_partir_de ? 'a_partir' : 'fixo'}
        onChange={(v) => setForm({ ...form, a_partir_de: v === 'a_partir' })}
      />
      <Chips
        opcoes={['ativo', 'inativo'] as const}
        rotulos={{ ativo: 'Visível', inativo: 'Oculto' }}
        valor={form.ativo ? 'ativo' : 'inativo'}
        onChange={(v) => setForm({ ...form, ativo: v === 'ativo' })}
      />
      <Linha>
        <Botao v="secundario" titulo="Cancelar" onPress={() => setForm(null)} estilo={{ flex: 1 }} />
        <Botao titulo="Salvar" onPress={salvar} carregando={ocupado === 'servico'} estilo={{ flex: 1 }} />
      </Linha>
    </Cartao>
  );

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}
      {dados && (
        <>
          <Secao titulo="Serviços">
            {form && !form.id ? editor : <Botao icone="add" titulo="Novo serviço" onPress={() => setForm({ nome: '', detalhe: '', valor: '', a_partir_de: false, ativo: true, grupo: 'frente' })} />}
            {GRUPOS_SERVICO.map(({ grupo, rotulo }) => (
              <View key={grupo} style={{ gap: ESPACO.sm }}>
                <T v="legenda" estilo={{ fontWeight: '700' }}>{rotulo}</T>
                {dados.servicos
                  .filter((s) => s.grupo === grupo)
                  .map((s) =>
                    form?.id === s.id ? (
                      <View key={s.id}>{editor}</View>
                    ) : (
                      <Cartao key={s.id} onPress={() => editar(s)} estilo={{ padding: ESPACO.md, opacity: s.ativo ? 1 : 0.55 }}>
                        <Linha estilo={{ justifyContent: 'space-between' }}>
                          <T estilo={{ flex: 1 }}>{nomeServico(s)}</T>
                          {!s.ativo && <Etiqueta texto="Oculto" />}
                          <T v="forte">{s.a_partir_de ? 'a partir de ' : ''}{brlReais(s.valor)}</T>
                        </Linha>
                      </Cartao>
                    ),
                  )}
              </View>
            ))}
            <T v="legenda">Mudanças valem só para novos orçamentos.</T>
          </Secao>

          <Secao titulo="Status">
            {dados.status.map((s) => (
              <Cartao key={s.codigo} estilo={{ padding: ESPACO.md }}>
                <Linha estilo={{ justifyContent: 'space-between' }}>
                  <T v="forte" estilo={{ flex: 1 }}>{s.rotulo}</T>
                  {s.sistema ? (
                    <T v="legenda">Padrão</T>
                  ) : (
                    <Chips
                      opcoes={['ativo', 'inativo'] as const}
                      rotulos={{ ativo: 'Ativo', inativo: 'Inativo' }}
                      valor={s.ativo ? 'ativo' : 'inativo'}
                      onChange={(v) => v && executar(s.codigo, () => salvarStatusOrcamento(s.codigo, s.rotulo, v === 'ativo'), v === 'ativo' ? `${s.rotulo} ativado` : `${s.rotulo} desativado`)}
                    />
                  )}
                </Linha>
              </Cartao>
            ))}
            <Linha estilo={{ alignItems: 'flex-end' }}>
              <Campo rotulo="Novo status" value={novoStatus} onChangeText={setNovoStatus} placeholder="Ex.: Aguardando cliente" onSubmitEditing={criarStatus} />
              <Botao titulo="Criar" onPress={criarStatus} carregando={ocupado === 'status-novo'} estilo={{ minHeight: 46 }} />
            </Linha>
            <T v="legenda">Status inativo não aparece para escolha.</T>
          </Secao>
        </>
      )}
    </Tela>
  );
}
