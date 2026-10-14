import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { useDialogos } from '@/components/dialogos';
import { Cartao, Linha, Secao, T, Tela, type Icone } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePuxar } from '@/lib/usePuxar';
import { ESPACO, useCores } from '@/lib/tema';

function Item({ icone, titulo, desc, href, onPress }: { icone: Icone; titulo: string; desc?: string; href?: Href; onPress?: () => void }) {
  const c = useCores();
  return (
    <Cartao onPress={onPress ?? (() => router.push(href!))} estilo={{ padding: ESPACO.md }}>
      <Linha gap={ESPACO.md}>
        <Ionicons name={icone} size={22} color={c.primaria} />
        <View style={{ flex: 1 }}>
          <T v="forte">{titulo}</T>
          {desc ? <T v="legenda">{desc}</T> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.texto2} />
      </Linha>
    </Cartao>
  );
}

export default function Mais() {
  const { perfil, admin, sair, recarregarPerfil } = useAuth();
  const { confirmar } = useDialogos();
  const puxar = usePuxar(recarregarPerfil);
  return (
    <Tela {...puxar}>
      <T v="legenda">
        {perfil?.nome} · {perfil?.email} · {admin ? 'Administrador' : 'Vendedor'}
      </T>
      <Secao titulo="Financeiro">
        <Item icone="stats-chart-outline" titulo="Painel" desc="Vendas, recebimentos e marcas" href="/painel" />
      </Secao>
      <Secao titulo="Operação">
        <Item icone="scan-outline" titulo="Escanear tag" desc="Buscar pelo código da etiqueta" href="/scanner" />
        <Item icone="flame-outline" titulo="Venda avulsa" desc="Sem cadastro (ex.: isqueiros)" href="/venda/avulsa" />
        <Item icone="cart-outline" titulo="Nova venda" desc="Vários itens" href="/venda/nova" />
        <Item icone="receipt-outline" titulo="Vendas" desc="Histórico e cancelamento" href="/vendas" />
        <Item icone="wallet-outline" titulo="A receber" desc="Pendências e cartão a cair" href="/pagamentos" />
        <Item icone="swap-horizontal-outline" titulo="Repasses" desc="A pagar à Arquibancada" href="/repasses" />
        <Item icone="bookmark-outline" titulo="Reservas" desc="Reservas e empréstimos" href="/reservas" />
        <Item icone="globe-outline" titulo="Remover do site" desc="Vendidos ainda no site" href="/site" />
      </Secao>
      <Secao titulo="Configurações">
        {admin && <Item icone="construct-outline" titulo="Serviços e status" desc="Orçamentos" href="/config/orcamentos" />}
        {admin && <Item icone="pricetags-outline" titulo="Categorias" href="/config/categorias" />}
        <Item icone="card-outline" titulo="Taxas" desc="Pix, débito e crédito" href="/config/taxas" />
        <Item icone="people-outline" titulo="Concessão" desc="Proprietários e acordos" href="/config/consignantes" />
        {admin && <Item icone="person-circle-outline" titulo="Usuários" href="/config/usuarios" />}
      </Secao>
      <Item
        icone="log-out-outline"
        titulo="Sair"
        onPress={async () => {
          if (await confirmar({ titulo: 'Sair da conta?', confirmar: 'Sair' })) sair();
        }}
      />
    </Tela>
  );
}
