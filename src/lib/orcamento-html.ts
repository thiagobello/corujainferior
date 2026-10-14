// HTML do PDF do orçamento (A4), no estilo da tabela de valores da marca.
import type { ItemOrcamento, Orcamento, PecaOrcamento } from './api';
import { brlReais } from './dinheiro';
import { LOGO_MARCA } from './logo-marca';

// Observações impressas abaixo da tabela (mesmas da tabela de valores).
export const OBSERVACOES_ORCAMENTO: { texto: string; destaque?: string; forte?: boolean }[] = [
  { texto: 'Nem sempre é possível a remoção de todas as manchas.', forte: true },
  { texto: 'Tempo médio para conclusão - ', destaque: '20 dias úteis' },
  { texto: 'Formas de pagamento: ', destaque: 'Pix e Cartão de Crédito - até 3x sem juros', forte: true },
];

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const numeroOrcamento = (n: number) => String(n).padStart(4, '0');

export function montarHtmlOrcamento(o: Orcamento, pecas: PecaOrcamento[], itens: ItemOrcamento[]): string {
  const data = new Date(o.criado_em).toLocaleDateString('pt-BR');

  // Um bloco por camisa: nome, serviços e valor da camisa (fotos ficam só no app).
  const blocos = pecas
    .map((pc) => {
      const linhasItens = itens
        .filter((i) => i.peca_id === pc.id)
        .map(
          (i) => `
      <tr>
        <td class="serv">${esc(i.descricao)}</td>
        <td class="qtd">${i.quantidade > 1 ? `${i.quantidade}×` : ''}</td>
        <td class="val">${i.quantidade > 1 ? `<span class="unit">${brlReais(i.valor_unitario)} cada</span>` : ''}${brlReais(Number(i.valor_unitario) * i.quantidade)}</td>
      </tr>`,
        )
        .join('');
      return `
      <tr class="peca"><td colspan="3">${esc(pc.nome)}</td></tr>
      ${linhasItens}
      ${pecas.length > 1 ? `<tr class="subtotal"><td colspan="2">Valor desta camisa</td><td class="val">${brlReais(pc.subtotal)}</td></tr>` : ''}`;
    })
    .join('');

  const obs = OBSERVACOES_ORCAMENTO.map(
    (x) => `<li class="${x.forte ? 'forte' : ''}">${esc(x.texto)}${x.destaque ? `<b>${esc(x.destaque)}</b>` : ''}</li>`,
  ).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Orçamento ${numeroOrcamento(o.numero)} - ${esc(o.cliente_nome)}</title>
<style>
  @page { size: A4; margin: 10mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1c1c1c; font-size: 13px; }
  .topo { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #262626; padding-bottom: 8px; }
  .topo img { height: 74px; }
  .titulo { text-align: right; }
  .titulo h1 { margin: 0; font-size: 26px; letter-spacing: 3px; font-weight: 800; }
  .titulo p { margin: 4px 0 0; color: #555; }
  .cliente { display: flex; gap: 24px; margin: 12px 0; padding: 10px 16px; background: #f1f1f1; border-radius: 10px; }
  .cliente div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
  .cliente div b { font-size: 15px; }
  tr.peca td { background: #4a4a4a !important; color: #fff; font-size: 15px; font-weight: 800; padding: 9px 16px; }
  tr.subtotal td { background: #f4f4f4 !important; font-weight: 700; font-size: 13px; color: #333; text-align: right; }
  tbody tr { page-break-inside: avoid; }
  tfoot { display: table-row-group; } /* total não se repete em cada página */
  table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; }
  thead th { background: #262626; color: #fff; font-size: 17px; font-weight: 800; padding: 12px 16px; text-align: left; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 8px 16px; font-weight: 700; font-size: 14px; }
  tbody tr:nth-child(odd) td { background: #e9e9e9; }
  tbody tr:nth-child(even) td { background: #dadada; }
  td.qtd { width: 50px; text-align: center; color: #444; }
  td.val { width: 150px; text-align: right; white-space: nowrap; }
  td.val .unit { display: block; font-size: 10px; font-weight: 400; color: #666; }
  tfoot td { background: #262626; color: #fff; padding: 12px 16px; font-size: 17px; font-weight: 800; }
  tfoot td:last-child { text-align: right; }
  .obs { page-break-inside: avoid; break-inside: avoid; margin-top: 14px; background: #262626; color: #fff; border-radius: 12px; padding: 12px 18px 12px 34px; }
  .obs ul { margin: 0; padding: 0; }
  .obs li { margin: 4px 0; font-size: 13px; list-style: '*  '; }
  .obs li.forte { font-weight: 700; }
  .fim { page-break-inside: avoid; break-inside: avoid; }
  .rodape { margin: 10px 0 0; text-align: center; font-size: 10px; color: #888; }
</style>
</head>
<body>
  <div class="topo">
    <img src="${LOGO_MARCA}" alt="Arquibancada Inferior feat Coruja Sports" />
    <div class="titulo">
      <h1>ORÇAMENTO</h1>
      <p>Nº ${numeroOrcamento(o.numero)} · ${data}</p>
    </div>
  </div>

  <div class="cliente">
    <div><span>Cliente</span><b>${esc(o.cliente_nome)}</b></div>
    ${o.contato ? `<div><span>Contato</span><b>${esc(o.contato)}</b></div>` : ''}
  </div>

  <table>
    <thead><tr><th colspan="2">Serviços</th><th>Valor</th></tr></thead>
    <tbody>${blocos}</tbody>
    <tfoot><tr><td colspan="2">Valor total${pecas.length > 1 ? ` · ${pecas.length} camisas` : ''}</td><td>${brlReais(o.total)}</td></tr></tfoot>
  </table>

  <div class="fim">
    <div class="obs"><ul>${obs}</ul></div>
    <p class="rodape">Arquibancada Inferior feat Coruja Sports</p>
  </div>
</body>
</html>`;
}
