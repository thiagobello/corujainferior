import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { calcularPeriodo, FiltroPeriodo } from '@/components/periodo';
import { Aviso, Botao, Cartao, Carregando, Chips, ErroCaixa, Estatistica, Linha, ParValor, Secao, Separador, T, Tela } from '@/components/ui';
import { resumoFinanceiro, totalRepassePendente } from '@/lib/api';
import { brlReais } from '@/lib/dinheiro';
import { exportarPlanilha } from '@/lib/exportar';
import { mensagemErro } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { ROTULO_FORMA, dataBR } from '@/lib/tipos';
import { useConsulta } from '@/lib/useConsulta';

type Marca = 'coruja' | 'arquibancada' | 'consignante';

export default function Painel() {
  const c = useCores();
  const { avisar } = useDialogos();
  const [periodo, setPeriodo] = useState(calcularPeriodo('mes'));
  const [marca, setMarca] = useState<Marca | null>(null);
  const { dados: r, erro, carregando, recarregar } = useConsulta(
    async () => {
      const [resumo, repasse] = await Promise.all([resumoFinanceiro(periodo.inicio, periodo.fim, marca), totalRepassePendente()]);
      return { ...resumo, repasse_pendente: repasse };
    },
    [periodo.inicio, periodo.fim, marca],
  );

  async function exportar() {
    if (!r) return;
    try {
      const linhas: Record<string, unknown>[] = [
        { Indicador: 'Período', Valor: `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)}` },
        { Indicador: 'Filtro de marca', Valor: marca ?? 'Todas' },
        { Indicador: 'Quantidade de vendas', Valor: r.vendas },
        { Indicador: 'Itens vendidos', Valor: r.itens },
        { Indicador: 'Faturamento de itens sem cadastro', Valor: Number(r.avulsos ?? 0) },
        { Indicador: 'Faturamento bruto', Valor: Number(r.bruto) },
        { Indicador: 'Descontos concedidos', Valor: Number(r.descontos) },
        { Indicador: 'Taxas de pagamento', Valor: Number(r.taxas) },
        { Indicador: 'Recebimento líquido (vendas do período)', Valor: Number(r.liquido) },
        { Indicador: 'Custo dos produtos vendidos', Valor: Number(r.custos) },
        { Indicador: 'Lucro bruto', Valor: Number(r.lucro_bruto) },
        { Indicador: 'Resultado após taxas', Valor: Number(r.resultado) },
        { Indicador: 'Atribuído à Coruja Sports', Valor: Number(r.marcas.coruja) },
        { Indicador: 'Atribuído à Arquibancada Inferior', Valor: Number(r.marcas.arquibancada) },
        { Indicador: 'Devido a proprietários (concessão)', Valor: Number(r.marcas.consignantes) },
        { Indicador: 'Efetivamente recebido no período', Valor: Number(r.recebido_periodo) },
        { Indicador: 'A receber (total)', Valor: Number(r.a_receber) },
        { Indicador: 'A repassar à Arquibancada (hoje)', Valor: Number(r.repasse_pendente) },
        ...r.por_forma.map((f: any) => ({ Indicador: `Vendas em ${ROTULO_FORMA[f.forma as keyof typeof ROTULO_FORMA]}`, Valor: Number(f.bruto), Quantidade: f.vendas })),
        ...r.mais_vendidos.map((m: any, i: number) => ({ Indicador: `Mais vendido #${i + 1}: ${m.descricao}`, Valor: Number(m.bruto), Quantidade: m.quantidade })),
      ];
      await exportarPlanilha(`painel-${periodo.inicio}-a-${periodo.fim}`, linhas);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    }
  }

  const maxForma = r ? Math.max(1, ...r.por_forma.map((f: any) => Number(f.bruto))) : 1;

  return (
    <Tela atualizando={carregando} onAtualizar={recarregar}>
      <FiltroPeriodo onChange={setPeriodo} />
      <Chips
        opcoes={['coruja', 'arquibancada', 'consignante'] as const}
        rotulos={{ coruja: 'Coruja Sports', arquibancada: 'Arquibancada Inferior', consignante: 'Concessão' }}
        valor={marca}
        onChange={setMarca}
        permiteVazio
      />
      {erro && <ErroCaixa erro={erro} onTentar={recarregar} />}
      {!r && carregando && <Carregando />}
      {r && (
        <>
          <Linha quebra gap={ESPACO.sm}>
            <Estatistica rotulo="Vendas" valor={String(r.vendas)} detalhe={`${r.itens} item(ns)`} />
            <Estatistica
              rotulo="Faturamento bruto"
              valor={brlReais(r.bruto)}
              detalhe={[
                Number(r.descontos) ? `${brlReais(r.descontos)} em descontos` : null,
                Number(r.avulsos) ? `${brlReais(r.avulsos)} sem cadastro` : null,
              ].filter(Boolean).join(' · ') || undefined}
            />
            <Estatistica rotulo="Taxas" valor={brlReais(r.taxas)} cor={c.alerta} />
            <Estatistica rotulo="Líquido" valor={brlReais(r.liquido)} />
            <Estatistica
              rotulo="Custo"
              valor={brlReais(r.custos)}
              detalhe={r.itens_sem_custo ? `${r.itens_sem_custo} peça(s) sem custo` : undefined}
            />
            <Estatistica rotulo="Lucro bruto" valor={brlReais(r.lucro_bruto)} />
            <Estatistica rotulo="Resultado" valor={brlReais(r.resultado)} cor={Number(r.resultado) < 0 ? c.perigo : c.primaria} />
          </Linha>
          {marca && (
            <Aviso tipo="info" texto="Totais só das peças desta marca. Recebimentos são da loja toda." />
          )}

          <Secao titulo="Divisão do líquido">
            <Cartao>
              <ParValor rotulo="Coruja Sports" valor={brlReais(r.marcas.coruja)} />
              <ParValor rotulo="Arquibancada Inferior" valor={brlReais(r.marcas.arquibancada)} />
              <ParValor rotulo="Proprietários (concessão)" valor={brlReais(r.marcas.consignantes)} />
              <Separador />
              <ParValor
                rotulo="Total"
                valor={brlReais(Number(r.marcas.coruja) + Number(r.marcas.arquibancada) + Number(r.marcas.consignantes))}
                destaque
              />
            </Cartao>
          </Secao>

          <Secao titulo="Vendido × recebido">
            <Cartao>
              <ParValor rotulo="Recebido no período" valor={brlReais(r.recebido_periodo)} destaque />
              <ParValor rotulo="A receber" valor={brlReais(r.a_receber)} />
              <ParValor rotulo="Pendências" valor={`${r.pagamentos_pendentes} · ${brlReais(r.valor_pendente_manual)}`} />
              <Botao compacto v="fantasma" titulo="Ver a receber ›" onPress={() => router.push('/pagamentos')} />
            </Cartao>
          </Secao>

          <Secao titulo="Por forma de pagamento">
            <Cartao>
              {r.por_forma.length === 0 && <T v="legenda">Sem vendas no período.</T>}
              {r.por_forma.map((f: any) => (
                <View key={f.forma} style={{ gap: 4, paddingVertical: 4 }}>
                  <Linha estilo={{ justifyContent: 'space-between' }}>
                    <T>{ROTULO_FORMA[f.forma as keyof typeof ROTULO_FORMA]} · {f.vendas}</T>
                    <T v="forte">{brlReais(f.bruto)}</T>
                  </Linha>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.superficie2 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.primaria, width: `${(Number(f.bruto) / maxForma) * 100}%` }} />
                  </View>
                </View>
              ))}
            </Cartao>
          </Secao>

          <Secao titulo="Mais vendidos">
            <Cartao>
              {r.mais_vendidos.length === 0 && <T v="legenda">Sem vendas no período.</T>}
              {r.mais_vendidos.map((m: any, i: number) => (
                <ParValor key={i} rotulo={`${i + 1}. ${m.descricao}`} valor={`${m.quantidade}× · ${brlReais(m.bruto)}`} />
              ))}
            </Cartao>
          </Secao>

          <Secao titulo="Operação">
            <Linha quebra gap={ESPACO.sm}>
              <Cartao estilo={{ flexGrow: 1, flexBasis: 150 }} onPress={() => router.push('/reservas')}>
                <T v="legenda">Reservas</T>
                <T v="valor" cor={c.alerta}>{r.reservas_ativas}</T>
              </Cartao>
              <Cartao estilo={{ flexGrow: 1, flexBasis: 150 }} onPress={() => router.push('/reservas')}>
                <T v="legenda">Empréstimos</T>
                <T v="valor" cor={c.info}>{r.emprestimos_ativos}</T>
              </Cartao>
              <Cartao estilo={{ flexGrow: 1, flexBasis: 150 }} onPress={() => router.push('/repasses')}>
                <T v="legenda">A repassar à Arquibancada</T>
                <T v="valor" cor={r.repasse_pendente > 0 ? c.alerta : undefined}>{brlReais(r.repasse_pendente)}</T>
              </Cartao>
              <Cartao estilo={{ flexGrow: 1, flexBasis: 150 }} onPress={() => router.push('/site')}>
                <T v="legenda">Remover do site</T>
                <T v="valor" cor={r.alertas_site ? c.perigo : undefined}>{r.alertas_site}</T>
              </Cartao>
            </Linha>
          </Secao>

          <Botao v="secundario" icone="download-outline" titulo="Exportar XLSX" onPress={exportar} />
        </>
      )}
    </Tela>
  );
}
