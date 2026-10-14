// Orçamento com várias camisas: cada uma com nome, fotos, serviços
// (separados em Frente / Verso / Mangas e outros) e valor próprio.
import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import {
  GRUPOS_SERVICO, descricaoServico, listarServicos, nomeServico,
  type ItemOrcamento, type PecaOrcamento, type PecaParaSalvar, type Servico,
} from '@/lib/api';
import { brl, brlReais, centavosParaTexto, lerValor, paraCentavos, paraReais } from '@/lib/dinheiro';
import { enviarFoto, escolherFoto } from '@/lib/fotos';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { useDialogos } from './dialogos';
import { Botao, BotaoIcone, Campo, Cartao, Foto, Linha, Separador, T } from './ui';

export interface FotoOrcamento {
  chave: string;
  path?: string; // já enviada
  uri?: string; // nova, ainda local
}

interface Escolha {
  quantidade: number;
  valorTexto: string;
  complemento: string; // ex.: descrição da estampa
}
interface Personalizado {
  chave: string;
  descricao: string;
  quantidade: number;
  valorTexto: string;
}
interface PecaForm {
  chave: string;
  nome: string;
  fotos: FotoOrcamento[];
  escolhas: Record<string, Escolha>; // por servico_id
  personalizados: Personalizado[];
  aberta: boolean;
}

export interface ValoresOrcamento {
  cliente_nome: string;
  contato: string;
  observacoes: string;
  pecas: (Omit<PecaParaSalvar, 'fotos'> & { fotos: FotoOrcamento[] })[];
}

const MAX_FOTOS = 4;
const novaPeca = (): PecaForm => ({ chave: randomUUID(), nome: '', fotos: [], escolhas: {}, personalizados: [], aberta: true });

/** Envia as fotos novas de todas as camisas e devolve as peças prontas para salvar. */
export async function prepararPecas(pecas: ValoresOrcamento['pecas']): Promise<PecaParaSalvar[]> {
  return Promise.all(
    pecas.map(async (p) => ({
      ...p,
      fotos: await Promise.all(p.fotos.map((f) => (f.path ? Promise.resolve(f.path) : enviarFoto(f.uri!, 'orcamentos')))),
    })),
  );
}

function subtotal(p: PecaForm, servicos: Servico[]): number {
  let t = 0;
  for (const [id, e] of Object.entries(p.escolhas)) {
    if (servicos.some((s) => s.id === id)) t += (lerValor(e.valorTexto) ?? 0) * e.quantidade;
  }
  for (const x of p.personalizados) t += (lerValor(x.valorTexto) ?? 0) * x.quantidade;
  return t;
}

export function OrcamentoForm({
  inicial,
  salvando,
  recarga = 0,
  onSalvar,
}: {
  inicial?: { cliente_nome: string; contato: string | null; observacoes: string | null; pecas: PecaOrcamento[]; itens: ItemOrcamento[] };
  salvando: boolean;
  recarga?: number;
  onSalvar: (v: ValoresOrcamento) => void;
}) {
  const c = useCores();
  const { avisar } = useDialogos();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [cliente, setCliente] = useState(inicial?.cliente_nome ?? '');
  const [contato, setContato] = useState(inicial?.contato ?? '');
  const [obs, setObs] = useState(inicial?.observacoes ?? '');
  const [pecas, setPecas] = useState<PecaForm[]>(() => (inicial ? [] : [novaPeca()]));
  const [carregouInicial, setCarregouInicial] = useState(!inicial);
  const [erroCliente, setErroCliente] = useState<string | null>(null);

  useEffect(() => {
    listarServicos().then(setServicos).catch((e) => avisar(mensagemErro(e), 'erro'));
  }, [recarga, avisar]);

  // Edição: monta as camisas quando o catálogo chega (para reconhecer os serviços).
  if (inicial && !carregouInicial && servicos.length) {
    setCarregouInicial(true);
    setPecas(
      inicial.pecas.map((pc) => {
        const escolhas: Record<string, Escolha> = {};
        const personalizados: Personalizado[] = [];
        for (const i of inicial.itens.filter((x) => x.peca_id === pc.id)) {
          const sv = i.servico_id ? servicos.find((s) => s.id === i.servico_id) : undefined;
          const valorTexto = centavosParaTexto(paraCentavos(i.valor_unitario));
          if (sv && !escolhas[sv.id]) {
            const base = descricaoServico(sv);
            const complemento = i.descricao.startsWith(`${base} – `) ? i.descricao.slice(base.length + 3) : '';
            escolhas[sv.id] = { quantidade: i.quantidade, valorTexto, complemento };
          } else {
            personalizados.push({ chave: randomUUID(), descricao: i.descricao, quantidade: i.quantidade, valorTexto });
          }
        }
        return { chave: pc.id, nome: pc.nome, fotos: pc.fotos.map((f) => ({ chave: f, path: f })), escolhas, personalizados, aberta: false };
      }),
    );
  }

  const mudarPeca = (chave: string, f: (p: PecaForm) => PecaForm) => setPecas((ps) => ps.map((p) => (p.chave === chave ? f(p) : p)));
  const total = pecas.reduce((t, p) => t + subtotal(p, servicos), 0);

  function alternar(p: PecaForm, s: Servico) {
    Keyboard.dismiss();
    mudarPeca(p.chave, (x) => {
      const escolhas = { ...x.escolhas };
      if (escolhas[s.id]) delete escolhas[s.id];
      // "A partir de": o valor é digitado no orçamento.
      else escolhas[s.id] = { quantidade: 1, valorTexto: s.a_partir_de ? '' : centavosParaTexto(paraCentavos(s.valor)), complemento: '' };
      return { ...x, escolhas };
    });
  }

  async function adicionarFoto(p: PecaForm, origem: 'camera' | 'galeria') {
    Keyboard.dismiss();
    try {
      const uri = await escolherFoto(origem);
      if (uri) mudarPeca(p.chave, (x) => ({ ...x, fotos: [...x.fotos, { chave: randomUUID(), uri }].slice(0, MAX_FOTOS) }));
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  function problemaDaPeca(p: PecaForm, n: number): string | null {
    const rotulo = p.nome.trim() || `Camisa ${n}`;
    if (!p.nome.trim()) return `Informe o nome da camisa ${n}`;
    const escolhidos = Object.entries(p.escolhas).filter(([id]) => servicos.some((s) => s.id === id));
    if (!escolhidos.length && !p.personalizados.length) return `Selecione os serviços de ${rotulo}`;
    for (const [id, e] of escolhidos) {
      const s = servicos.find((x) => x.id === id)!;
      const v = lerValor(e.valorTexto);
      if (v === null || v <= 0) return `Digite o valor de ${nomeServico(s)} em ${rotulo}`;
    }
    for (const x of p.personalizados) {
      if (!x.descricao.trim()) return `Descreva o item personalizado em ${rotulo}`;
      const v = lerValor(x.valorTexto);
      if (v === null || v < 0) return `Valor inválido em ${x.descricao} (${rotulo})`;
    }
    return null;
  }

  function concluirPeca(p: PecaForm, n: number) {
    const erro = problemaDaPeca(p, n);
    if (erro) return avisar(erro, 'erro');
    Keyboard.dismiss();
    mudarPeca(p.chave, (x) => ({ ...x, aberta: false }));
  }

  function salvar() {
    Keyboard.dismiss();
    if (!cliente.trim()) {
      setErroCliente('Informe o nome do cliente');
      return avisar('Informe o nome do cliente', 'erro');
    }
    setErroCliente(null);
    for (const [k, p] of pecas.entries()) {
      const erro = problemaDaPeca(p, k + 1);
      if (erro) {
        mudarPeca(p.chave, (x) => ({ ...x, aberta: true }));
        return avisar(erro, 'erro');
      }
    }
    onSalvar({
      cliente_nome: cliente.trim(),
      contato: contato.trim(),
      observacoes: obs.trim(),
      pecas: pecas.map((p) => ({
        nome: p.nome.trim(),
        fotos: p.fotos,
        itens: [
          ...servicos
            .filter((s) => p.escolhas[s.id])
            .map((s) => {
              const e = p.escolhas[s.id];
              return {
                servico_id: s.id,
                descricao: e.complemento.trim() ? `${descricaoServico(s)} – ${e.complemento.trim()}` : descricaoServico(s),
                quantidade: e.quantidade,
                valor_unitario: paraReais(lerValor(e.valorTexto)!),
              };
            }),
          ...p.personalizados.map((x) => ({
            servico_id: null,
            descricao: x.descricao.trim(),
            quantidade: x.quantidade,
            valor_unitario: paraReais(lerValor(x.valorTexto)!),
          })),
        ],
      })),
    });
  }

  const quantidade = (valor: number, mudar: (q: number) => void) => (
    <Linha gap={4}>
      <Botao compacto v="secundario" titulo="−" onPress={() => mudar(Math.max(1, valor - 1))} estilo={{ minWidth: 36, minHeight: 36, paddingHorizontal: 0 }} />
      <T v="forte" estilo={{ minWidth: 20, textAlign: 'center' }}>{valor}</T>
      <Botao compacto v="secundario" titulo="+" onPress={() => mudar(valor + 1)} estilo={{ minWidth: 36, minHeight: 36, paddingHorizontal: 0 }} />
    </Linha>
  );

  function renderPeca(p: PecaForm, n: number) {
    const sub = subtotal(p, servicos);
    const selecionados = servicos.filter((s) => p.escolhas[s.id]);

    if (!p.aberta) {
      return (
        <Cartao key={p.chave} onPress={() => mudarPeca(p.chave, (x) => ({ ...x, aberta: true }))}>
          <Linha estilo={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="forte">{p.nome || `Camisa ${n}`}</T>
              <T v="legenda" linhas={2}>
                {[...selecionados.map((s) => descricaoServico(s)), ...p.personalizados.map((x) => x.descricao)].join(' · ') || 'Nenhum serviço'}
              </T>
              {p.fotos.length > 0 && <T v="legenda">{p.fotos.length} foto(s)</T>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <T v="forte">{brl(sub)}</T>
              <T v="legenda" cor={c.primaria}>Editar</T>
            </View>
          </Linha>
        </Cartao>
      );
    }

    return (
      <Cartao key={p.chave} estilo={{ borderColor: c.primaria, borderWidth: 1.5 }}>
        <Linha estilo={{ justifyContent: 'space-between' }}>
          <T v="secao">Camisa {n}</T>
          {pecas.length > 1 && <BotaoIcone icone="trash-outline" rotulo="Remover camisa" cor={c.perigo} onPress={() => setPecas((ps) => ps.filter((x) => x.chave !== p.chave))} />}
        </Linha>
        <Campo value={p.nome} onChangeText={(t) => mudarPeca(p.chave, (x) => ({ ...x, nome: t }))} placeholder="Ex.: Corinthians 2009" style={{ fontWeight: '700' }} />

        <Linha quebra gap={ESPACO.sm}>
          {p.fotos.map((f) => (
            <View key={f.chave}>
              <Foto uri={f.uri} path={f.path} tamanho={64} />
              <Pressable
                accessibilityLabel="Remover foto"
                hitSlop={8}
                onPress={() => mudarPeca(p.chave, (x) => ({ ...x, fotos: x.fotos.filter((y) => y.chave !== f.chave) }))}
                style={{ position: 'absolute', top: -6, right: -6, backgroundColor: c.superficie, borderRadius: 12 }}>
                <Ionicons name="close-circle" size={22} color={c.perigo} />
              </Pressable>
            </View>
          ))}
          {p.fotos.length < MAX_FOTOS && (
            <>
              <Botao compacto v="secundario" icone="camera-outline" titulo="Foto" onPress={() => adicionarFoto(p, 'camera')} />
              <Botao compacto v="secundario" icone="images-outline" titulo="Galeria" onPress={() => adicionarFoto(p, 'galeria')} />
            </>
          )}
        </Linha>

        {GRUPOS_SERVICO.map(({ grupo, rotulo }) => {
          const lista = servicos.filter((s) => s.grupo === grupo && (s.ativo || p.escolhas[s.id]));
          if (!lista.length) return null;
          return (
            <View key={grupo} style={{ gap: 2 }}>
              <T v="secao" estilo={{ marginTop: ESPACO.sm }}>{rotulo}</T>
              {lista.map((s) => {
                const e = p.escolhas[s.id];
                return (
                  <View key={s.id} style={{ gap: ESPACO.xs, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: c.borda }}>
                    <Linha>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!e }} onPress={() => alternar(p, s)} style={{ flex: 1 }}>
                        <Linha>
                          <Ionicons name={e ? 'checkbox' : 'square-outline'} size={22} color={e ? c.primaria : c.texto2} />
                          <T v={e ? 'forte' : 'corpo'} estilo={{ flex: 1 }}>{nomeServico(s)}</T>
                          {!(e && s.a_partir_de) && <T v="legenda">{s.a_partir_de ? 'a partir de ' : ''}{brlReais(s.valor)}</T>}
                        </Linha>
                      </Pressable>
                      {e && !s.a_partir_de && quantidade(e.quantidade, (q) => mudarPeca(p.chave, (x) => ({ ...x, escolhas: { ...x.escolhas, [s.id]: { ...e, quantidade: q } } })))}
                    </Linha>
                    {e && s.a_partir_de && (
                      <View style={{ gap: ESPACO.sm, paddingLeft: 30 }}>
                        <Campo
                          rotulo={`Valor (mín. ${brlReais(s.valor)})`}
                          value={e.valorTexto}
                          onChangeText={(t) => mudarPeca(p.chave, (x) => ({ ...x, escolhas: { ...x.escolhas, [s.id]: { ...e, valorTexto: t } } }))}
                          keyboardType="decimal-pad"
                          placeholder="0,00"
                          autoFocus
                          erro={lerValor(e.valorTexto) !== null && (lerValor(e.valorTexto) ?? 0) < (paraCentavos(s.valor) ?? 0) ? `Abaixo do mínimo de ${brlReais(s.valor)}` : null}
                        />
                        <Campo
                          rotulo="Detalhe (opcional)"
                          value={e.complemento}
                          onChangeText={(t) => mudarPeca(p.chave, (x) => ({ ...x, escolhas: { ...x.escolhas, [s.id]: { ...e, complemento: t } } }))}
                          placeholder="Ex.: escudo retrô nas costas"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {p.personalizados.map((x) => (
          <View key={x.chave} style={{ gap: ESPACO.sm, paddingTop: ESPACO.sm }}>
            <Linha estilo={{ alignItems: 'flex-end' }}>
              <Campo
                rotulo="Item personalizado"
                value={x.descricao}
                onChangeText={(t) => mudarPeca(p.chave, (y) => ({ ...y, personalizados: y.personalizados.map((z) => (z.chave === x.chave ? { ...z, descricao: t } : z)) }))}
                placeholder="Ex.: Ajuste de gola"
              />
              <BotaoIcone icone="close" rotulo="Remover item" onPress={() => mudarPeca(p.chave, (y) => ({ ...y, personalizados: y.personalizados.filter((z) => z.chave !== x.chave) }))} />
            </Linha>
            <Linha estilo={{ alignItems: 'flex-end' }}>
              <Campo
                rotulo="Valor (R$)"
                value={x.valorTexto}
                onChangeText={(t) => mudarPeca(p.chave, (y) => ({ ...y, personalizados: y.personalizados.map((z) => (z.chave === x.chave ? { ...z, valorTexto: t } : z)) }))}
                keyboardType="decimal-pad"
                placeholder="0,00"
              />
              {quantidade(x.quantidade, (q) => mudarPeca(p.chave, (y) => ({ ...y, personalizados: y.personalizados.map((z) => (z.chave === x.chave ? { ...z, quantidade: q } : z)) })))}
            </Linha>
          </View>
        ))}
        <Botao
          compacto
          v="fantasma"
          icone="add"
          titulo="Item personalizado"
          onPress={() => mudarPeca(p.chave, (x) => ({ ...x, personalizados: [...x.personalizados, { chave: randomUUID(), descricao: '', quantidade: 1, valorTexto: '' }] }))}
        />

        <Separador />
        <Linha estilo={{ justifyContent: 'space-between' }}>
          <T v="forte">Valor desta camisa</T>
          <T v="valor">{brl(sub)}</T>
        </Linha>
        <Botao compacto v="secundario" icone="checkmark" titulo="Concluir camisa" onPress={() => concluirPeca(p, n)} />
      </Cartao>
    );
  }

  return (
    <View style={{ gap: ESPACO.lg }}>
      <View style={{ gap: ESPACO.sm }}>
        <Campo rotulo="Cliente" value={cliente} onChangeText={setCliente} erro={erroCliente} autoCapitalize="words" />
        <Campo rotulo="Telefone ou Instagram" value={contato} onChangeText={setContato} placeholder="(11) 99999-9999 ou @cliente" autoCapitalize="none" />
      </View>

      {pecas.map((p, k) => renderPeca(p, k + 1))}
      <Botao
        v="secundario"
        icone="add"
        titulo="Adicionar camisa"
        onPress={() => {
          Keyboard.dismiss();
          setPecas((ps) => [...ps.map((x) => ({ ...x, aberta: false })), novaPeca()]);
        }}
      />

      <Campo rotulo="Anotações (não vão no PDF)" value={obs} onChangeText={setObs} multiline />

      <Cartao>
        {pecas.length > 1 &&
          pecas.map((p, k) => (
            <Linha key={p.chave} estilo={{ justifyContent: 'space-between' }}>
              <T v="legenda">{p.nome || `Camisa ${k + 1}`}</T>
              <T v="legenda">{brl(subtotal(p, servicos))}</T>
            </Linha>
          ))}
        <Linha estilo={{ justifyContent: 'space-between' }}>
          <T v="forte">Valor total</T>
          <T v="valor">{brl(total)}</T>
        </Linha>
      </Cartao>
      <Botao titulo="Salvar orçamento" icone="checkmark" onPress={salvar} carregando={salvando} />
    </View>
  );
}
