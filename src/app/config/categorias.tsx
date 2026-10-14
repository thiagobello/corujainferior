// Gerenciamento de categorias: criar, renomear, arquivar/reativar e excluir.
// Categoria com produtos não pode ser excluída (os códigos dela já estão
// nas etiquetas); nesse caso, arquivar a tira do cadastro.
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Aviso, Botao, Campo, Cartao, Carregando, ErroCaixa, Etiqueta, Linha, Secao, T, Tela, Vazio } from '@/components/ui';
import { arquivarCategoria, criarCategoria, excluirCategoria, listarCategorias, renomearCategoria, type Categoria } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO } from '@/lib/tema';
import { useConsulta } from '@/lib/useConsulta';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, '');

/** Sugere uma sigla livre a partir do nome ("Camisa Retrô" → "CR"). */
function sugerirSigla(nome: string, usadas: Set<string>): string {
  const palavras = semAcento(nome).split(/\s+/).filter((p) => p.length > 2);
  const letras = semAcento(nome).replace(/ /g, '');
  const candidatas = [
    palavras.map((p) => p[0]).join('').slice(0, 3),
    letras.slice(0, 1),
    letras.slice(0, 2),
    letras.slice(0, 3),
    ...letras.slice(1).split('').map((l) => letras[0] + l),
  ].filter((x) => x && x.length <= 3);
  return candidatas.find((x) => !usadas.has(x)) ?? '';
}

const codigo = (c: Categoria, n: number) => c.prefixo + String(n).padStart(c.digitos, '0');

export default function Categorias() {
  const { admin } = useAuth();
  const { avisar, confirmar } = useDialogos();
  const { dados, erro, carregando, recarregar } = useConsulta(listarCategorias);
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState<string | null>(null); // null = usar sugestão
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const usadas = new Set((dados ?? []).map((c) => c.prefixo));
  const siglaFinal = sigla ?? sugerirSigla(nome, usadas);
  const ativas = (dados ?? []).filter((c) => !c.arquivada);
  const arquivadas = (dados ?? []).filter((c) => c.arquivada);

  async function executar(id: string, acao: () => Promise<unknown>, msg: string) {
    setOcupado(id);
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

  async function criar() {
    if (!nome.trim()) return avisar('Informe o nome', 'erro');
    if (!siglaFinal) return avisar('Informe a sigla', 'erro');
    const ok = await executar('criar', () => criarCategoria(nome, siglaFinal), `Categoria “${nome.trim()}” criada`);
    if (ok) {
      setNome('');
      setSigla(null);
      setCriando(false);
    }
  }

  async function salvarNome(c: Categoria) {
    if (await executar(c.prefixo, () => renomearCategoria(c.prefixo, novoNome), 'Nome atualizado')) setEditando(null);
  }

  async function arquivar(c: Categoria) {
    const ok = await confirmar({
      titulo: c.arquivada ? `Reativar “${c.descricao}”?` : `Arquivar “${c.descricao}”?`,
      mensagem: c.arquivada
        ? 'Volta ao cadastro de produtos.'
        : 'Sai do cadastro. Os produtos continuam à venda.',
      confirmar: c.arquivada ? 'Reativar' : 'Arquivar',
    });
    if (ok) executar(c.prefixo, () => arquivarCategoria(c.prefixo, !c.arquivada), c.arquivada ? 'Categoria reativada' : 'Categoria arquivada');
  }

  async function excluir(c: Categoria) {
    const ok = await confirmar({
      titulo: `Excluir “${c.descricao}”?`,
      mensagem: `Sem produtos. A sigla ${c.prefixo} fica livre.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (ok) executar(c.prefixo, () => excluirCategoria(c.prefixo), 'Categoria excluída');
  }

  if (!admin) return <Tela><Aviso texto="Apenas administradores." /></Tela>;

  const item = (c: Categoria) => (
    <Cartao key={c.prefixo}>
      {editando === c.prefixo ? (
        <>
          <Campo rotulo="Nome" value={novoNome} onChangeText={setNovoNome} autoFocus onSubmitEditing={() => salvarNome(c)} />
          <Linha>
            <Botao compacto v="secundario" titulo="Cancelar" onPress={() => setEditando(null)} estilo={{ flex: 1 }} />
            <Botao compacto titulo="Salvar" onPress={() => salvarNome(c)} carregando={ocupado === c.prefixo} estilo={{ flex: 1 }} />
          </Linha>
        </>
      ) : (
        <>
          <Linha estilo={{ justifyContent: 'space-between' }}>
            <T v="forte" estilo={{ flex: 1 }}>{c.descricao}</T>
            <Etiqueta texto={c.prefixo} />
          </Linha>
          <T v="legenda">
            {c.produtos === 0 ? 'Sem produtos' : `${c.produtos} produtos · ${c.disponiveis} disponíveis`}
            {!c.arquivada ? ` · próximo ${codigo(c, c.proximo)}` : ''}
          </T>
          <Linha quebra>
            <Botao compacto v="fantasma" icone="create-outline" titulo="Renomear" onPress={() => { setEditando(c.prefixo); setNovoNome(c.descricao); }} />
            <Botao
              compacto
              v="fantasma"
              icone={c.arquivada ? 'arrow-undo-outline' : 'archive-outline'}
              titulo={c.arquivada ? 'Reativar' : 'Arquivar'}
              onPress={() => arquivar(c)}
              desabilitado={ocupado === c.prefixo}
            />
            {c.produtos === 0 && (
              <Botao compacto v="fantasma" icone="trash-outline" titulo="Excluir" onPress={() => excluir(c)} desabilitado={ocupado === c.prefixo} />
            )}
          </Linha>
        </>
      )}
    </Cartao>
  );

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      {criando ? (
        <Cartao>
          <T v="forte">Nova categoria</T>
          <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Camisa Retrô" autoFocus />
          <Campo
            rotulo="Sigla (1 a 3 letras)"
            value={siglaFinal}
            onChangeText={(t) => setSigla(semAcento(t).replace(/ /g, '').slice(0, 3))}
            autoCapitalize="characters"
            ajuda={siglaFinal ? `Códigos ${siglaFinal}001, ${siglaFinal}002… (não muda depois)` : undefined}
          />
          <Linha>
            <Botao v="secundario" titulo="Cancelar" onPress={() => { setCriando(false); setNome(''); setSigla(null); }} estilo={{ flex: 1 }} />
            <Botao titulo="Criar" onPress={criar} carregando={ocupado === 'criar'} estilo={{ flex: 1 }} />
          </Linha>
        </Cartao>
      ) : (
        <Botao icone="add" titulo="Nova categoria" onPress={() => setCriando(true)} />
      )}

      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {carregando && !dados && <Carregando />}

      {dados && (
        <>
          <Secao titulo={`Ativas (${ativas.length})`}>
            {ativas.length === 0 ? <Vazio texto="Nenhuma categoria ativa." /> : ativas.map(item)}
          </Secao>
          {arquivadas.length > 0 && (
            <Secao titulo={`Arquivadas (${arquivadas.length})`}>
              <View style={{ gap: ESPACO.sm }}>{arquivadas.map(item)}</View>
            </Secao>
          )}
          <T v="legenda">Só dá para excluir categoria sem produtos.</T>
        </>
      )}
    </Tela>
  );
}
