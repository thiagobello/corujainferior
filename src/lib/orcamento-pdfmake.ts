// Documento do orçamento para o pdfmake (usado na web: gera o arquivo PDF no
// próprio aparelho). Mesmo visual do HTML usado no celular (orcamento-html.ts).
import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { brlReais } from './dinheiro';
import { LOGO_MARCA } from './logo-marca';
import { numeroOrcamento, OBSERVACOES_ORCAMENTO } from './orcamento-html';

const ESCURO = '#262626';
const CINZA = '#4a4a4a';
const CLARO = '#f4f4f4';
const LINHA_A = '#e9e9e9';
const LINHA_B = '#dadada';

const semBordas = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 7,
  paddingBottom: () => 7,
};

export function montarDocOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]): any {
  const data = new Date(o.criado_em).toLocaleDateString('pt-BR');

  // Tabela: cabeçalho, um bloco por camisa (nome, serviços, valor da camisa) e total.
  const corpo: any[][] = [
    [
      { text: 'Serviços', colSpan: 2, bold: true, fontSize: 13, color: '#fff', fillColor: ESCURO },
      {},
      { text: 'Valor', bold: true, fontSize: 13, color: '#fff', fillColor: ESCURO, alignment: 'right' },
    ],
  ];
  for (const pc of pecas) {
    corpo.push([{ text: pc.nome, colSpan: 3, bold: true, fontSize: 11.5, color: '#fff', fillColor: CINZA }, {}, {}]);
    itens
      .filter((i) => i.peca_id === pc.id)
      .forEach((i, k) => {
        const fundo = k % 2 === 0 ? LINHA_A : LINHA_B;
        const total = brlReais(Number(i.valor_unitario) * i.quantidade);
        corpo.push([
          { text: i.descricao, bold: true, fillColor: fundo },
          { text: i.quantidade > 1 ? `${i.quantidade}×` : '', alignment: 'center', color: '#444', fillColor: fundo },
          {
            stack: i.quantidade > 1 ? [{ text: `${brlReais(i.valor_unitario)} cada`, fontSize: 7.5, color: '#666' }, { text: total, bold: true }] : [{ text: total, bold: true }],
            alignment: 'right',
            fillColor: fundo,
          },
        ]);
      });
    if (pecas.length > 1) {
      corpo.push([
        { text: 'Valor desta camisa', colSpan: 2, alignment: 'right', bold: true, fontSize: 9.5, color: '#333', fillColor: CLARO },
        {},
        { text: brlReais(pc.subtotal), alignment: 'right', bold: true, fontSize: 9.5, color: '#333', fillColor: CLARO },
      ]);
    }
  }
  corpo.push([
    { text: `Valor total${pecas.length > 1 ? ` · ${pecas.length} camisas` : ''}`, colSpan: 2, bold: true, fontSize: 13, color: '#fff', fillColor: ESCURO },
    {},
    { text: brlReais(o.total), bold: true, fontSize: 13, color: '#fff', fillColor: ESCURO, alignment: 'right' },
  ]);

  const obs = OBSERVACOES_ORCAMENTO.map((x) => ({
    text: [{ text: '*  ' }, { text: x.texto }, ...(x.destaque ? [{ text: x.destaque, bold: true }] : [])],
    bold: !!x.forte,
    color: '#fff',
    fontSize: 9.5,
    margin: [0, 2, 0, 2],
  }));

  return {
    pageSize: 'A4',
    pageMargins: [34, 28, 34, 28],
    info: { title: `Orçamento ${numeroOrcamento(o.numero)} - ${o.cliente_nome}` },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1c1c1c' },
    content: [
      {
        columns: [
          { image: LOGO_MARCA, width: 86 },
          {
            stack: [
              { text: 'ORÇAMENTO', fontSize: 20, bold: true, characterSpacing: 2.5 },
              { text: `Nº ${numeroOrcamento(o.numero)} · ${data}`, color: '#555', margin: [0, 3, 0, 0] },
            ],
            alignment: 'right',
            margin: [0, 18, 0, 0],
          },
        ],
      },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 527, h: 2.5, color: ESCURO }], margin: [0, 6, 0, 10] },
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                columns: [
                  { stack: [{ text: 'CLIENTE', fontSize: 7, color: '#777', characterSpacing: 1 }, { text: o.cliente_nome, bold: true, fontSize: 12 }], width: 'auto' },
                  ...(o.contato
                    ? [{ stack: [{ text: 'CONTATO', fontSize: 7, color: '#777', characterSpacing: 1 }, { text: o.contato, bold: true, fontSize: 12 }], width: 'auto', margin: [20, 0, 0, 0] }]
                    : []),
                ],
                fillColor: '#f1f1f1',
              },
            ],
          ],
        },
        layout: { ...semBordas, paddingTop: () => 9, paddingBottom: () => 9 },
        margin: [0, 0, 0, 10],
      },
      { table: { headerRows: 1, widths: ['*', 36, 100], body: corpo, dontBreakRows: true }, layout: semBordas },
      {
        table: { widths: ['*'], body: [[{ stack: obs, fillColor: ESCURO }]] },
        layout: { ...semBordas, paddingLeft: () => 16, paddingTop: () => 10, paddingBottom: () => 10 },
        margin: [0, 12, 0, 0],
        unbreakable: true,
      },
      { text: 'Arquibancada Inferior feat Coruja Sports', alignment: 'center', fontSize: 8, color: '#888', margin: [0, 10, 0, 0] },
    ],
  };
}
