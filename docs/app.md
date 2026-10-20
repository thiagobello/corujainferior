# App (telas, componentes e módulos)

## Navegação

`src/app/_layout.tsx` monta `SafeAreaProvider` → tema → `DialogosProvider` → `AuthProvider` → `Portao`:
- sem variáveis de ambiente → "Configuração pendente";
- sem sessão → `Login` (primeira conta vira admin);
- perfil inativo → aviso;
- logado → `Stack` com as abas e as telas de detalhe.

### Menu inferior — `src/app/(tabs)/`
| Aba | Arquivo | Conteúdo |
|---|---|---|
| Estoque | `index.tsx` | Busca ampla (sem acento, trechos, várias palavras; X para limpar), filtros (categoria, tamanho, status, tipo, condição, pertence, site), lista **agrupada por descrição** (`listar_grupos`), paginação infinita, exportar XLSX/CSV pelo ícone do cabeçalho |
| Baixa Rápida | `baixa.tsx` | `VendaForm` de 1 item; aceita `?codigo=` (vindo do produto/scanner) |
| Cadastrar | `cadastrar.tsx` | `ProdutoForm` (novo) → `criar_produtos`; tela de sucesso com os códigos criados |
| Orçamentos | `orcamentos.tsx` | Lista com busca e filtro por status; botão "Novo orçamento" |
| Mais | `mais.tsx` | Painel, operação (Escanear tag, Venda avulsa, Nova venda, Vendas, A receber, Repasses, Reservas, Remover do site) e configurações (Serviços e status, Categorias, Taxas, Concessão, Usuários) |

`(tabs)/_layout.tsx` também renderiza o **`AlertaSitePopup`** (lembrete de remoção do site, em qualquer tela).

### Telas em pilha
| Rota | Arquivo | Conteúdo |
|---|---|---|
| `/produto/[id]` | `produto/[id].tsx` | Detalhe, vender, reservar/emprestar, encerrar, venda vinculada, dados, histórico, arquivar (admin) |
| `/produto/editar/[id]` | `produto/editar/[id].tsx` | `ProdutoForm` (editar) → update direto em `produtos` |
| `/grupo?g=` | `grupo.tsx` | Produto com vários tamanhos: disponíveis por tamanho e lista de unidades |
| `/venda/nova` | `venda/nova.tsx` | `VendaForm` multi-itens |
| `/venda/avulsa` | `venda/avulsa.tsx` | `VendaForm` começando com item sem cadastro |
| `/venda/[id]` | `venda/[id].tsx` | Itens, divisão, repasse (no site Arquibancada: "Arquibancada deve à Coruja"), recebimento (marcar; indica conta da Arquibancada), cancelar (admin) |
| `/vendas` | `vendas.tsx` | Vendas por período, exportar |
| `/pagamentos` | `pagamentos.tsx` | Título "A receber": pendências do cliente e cartão a cair (da Coruja); seção "Site Arquibancada" à parte (dinheiro na conta dela) |
| `/repasses` | `repasses.tsx` | Saldo por semana nos dois sentidos (negativo = "Arquibancada deve à Coruja"), itens com etiqueta do canal, dar baixa, histórico, desfazer, exportar |
| `/reservas` | `reservas.tsx` | Reservas/empréstimos ativos, encerrar |
| `/site` | `site.tsx` | Vendidos ainda no site: removido/adiar/voltar a lembrar |
| `/painel` | `painel.tsx` | Painel (`resumo_financeiro` + saldo de repasse), vendas por canal, exportar |
| `/scanner` | `scanner.tsx` | Localizar por código digitado (OCR ainda não conectado) |
| `/orcamentos/novo`, `/orcamentos/[id]`, `/orcamentos/editar/[id]` | `orcamentos/…` | Criar, ver (status, PDF, histórico) e editar orçamento |
| `/config/categorias` | `config/categorias.tsx` | Gerenciar categorias (admin) |
| `/config/taxas` | `config/taxas.tsx` | Três blocos (Loja, Site Coruja, Site Arquibancada), cada um com Pix, Débito, Crédito 1x/2x/3x: percentual e, nos sites, recebimento (Na hora · Próximo dia útil). Admin edita |
| `/config/consignantes` | `config/consignantes.tsx` | Proprietários de concessão e acordos |
| `/config/usuarios` | `config/usuarios.tsx` | Papel e acesso (admin) |
| `/config/orcamentos` | `config/orcamentos.tsx` | Título "Serviços e status": serviços do orçamento (posição, variação, valor) e status (admin) |

Ao criar rota nova: registre o título em `Stack.Screen` no `_layout.tsx` e, se fizer sentido, um item em `mais.tsx`.

## Componentes — `src/components/`

| Arquivo | Para quê |
|---|---|
| `ui.tsx` | Base visual: `Tela` (scroll + safe area + puxar para atualizar), `Cartao`, `Linha`, `Secao`, `T` (variantes de texto), `Botao`, `BotaoIcone`, `Campo` (com `limpar`: X que apaga o texto, para buscas — Estoque, Orçamentos e busca do `Selecao`), `Chips`/`ChipsMulti`/`Chip`, `Selo` (status), `Etiqueta`, `Estatistica`, `ParValor`, `Foto`, `Aviso`, `Carregando`, `Vazio`, `ErroCaixa`, `Separador` |
| `dialogos.tsx` | `useDialogos()` → `confirmar({titulo, mensagem, conteudo, confirmar, perigo})` e `avisar(msg, 'erro')` (substitui `Alert`) |
| `selecao.tsx` | Dropdown único/múltiplo em modal; fecha teclado; `rodape` para ações extras |
| `categoria-select.tsx` | Dropdown de categorias (só nomes; `incluirArquivadas` nos filtros) |
| `produto-form.tsx` | Cadastro/edição de produto: autocomplete de modelos, vínculo, tamanhos + quantidades, validação de obrigatórios, foto. Exporta `OPCOES_TAMANHO` |
| `tamanhos-codigos.tsx` | Bloco "Tamanhos e códigos": linha por tamanho (qtd − +, faixa `M1388–1392`), edição de códigos por unidade, conferência no banco. Exposto via `ref.obter()` |
| `foto-ampliavel.tsx` | `FotoAmpliavel`: miniatura que abre a foto em tela cheia ao tocar (fundo escuro, sem cortes; toque ou X fecha). Usada no detalhe do produto e no grupo |
| `produto-linha.tsx` | `ProdutoLinha` (unidade) e `GrupoLinha` (grupo com tamanhos) — descrição em destaque |
| `venda-form.tsx` | Formulário único de venda (produto do estoque e item avulso), canal (chips Loja · Site Coruja · Site Arquibancada) e, abaixo, forma (Pix…3x com a taxa da combinação; **Dinheiro** só no canal Loja, sem taxa — trocar para o site desmarca), prévia (sem linha de taxa no Dinheiro), prévia de taxa/líquido/divisão e efeito no repasse ("A repassar à Arquibancada" / "Abate do repasse"), confirmação, idempotência, recentes de avulsos |
| `orcamento-form.tsx` | Orçamento com várias camisas (serviços por posição, “a partir de”, personalizados, fotos); `prepararPecas` envia fotos |
| `status-orcamento.tsx` | `SeloOrcamento` (cor por status) |
| `periodo.tsx` | `FiltroPeriodo` (hoje, 7 dias, mês, mês passado, ano, tudo, personalizado) |
| `alerta-site.tsx` | Popup de remoção do site + `verificarAlertasSite()` (chamado após vender) |
| `login.tsx` | Entrar / criar conta |

## Módulos — `src/lib/`

| Arquivo | Para quê |
|---|---|
| `supabase.ts` | Cliente, `SUPABASE_CONFIGURADO`, `urlFoto(path)`, `mensagemErro(e)` (traduz erros) |
| `api.ts` | **Toda** a comunicação com o banco (consultas e RPCs). Estoque: `listarGrupos` (lista) e `todosProdutos` (exportação) usam os mesmos filtros (`listar_grupos`/`listar_unidades`). Tipos `GrupoProduto`, `ItemVenda`, `Categoria`, `Servico`, `Orcamento`, `PecaOrcamento`… e helpers `normalizarCodigo`, `nomeServico`, `descricaoServico`, `GRUPOS_SERVICO` |
| `tipos.ts` | Tipos de domínio, listas (status, tipos, pertence, formas com taxa `FORMAS_VENDA`, `formasDoCanal(canal)` (inclui Dinheiro na loja), `CANAIS`, tamanhos), rótulos (`ROTULO_FORMA`, `ROTULO_CANAL`…), datas (`dataBR`, `hojeISO`) |
| `dinheiro.ts` | Centavos inteiros: `lerValor` ("189,90"→18990), `brl`, `brlReais`, `calcularTaxa`, `calcularVenda`, `dividirLiquido`, `efeitoRepasse(div, canal)` (espelham o banco); tipo `Canal` |
| `auth.tsx` | `AuthProvider`/`useAuth()` → `sessao`, `perfil`, `admin`, `sair`, `recarregarPerfil` |
| `useConsulta.ts` | Carrega ao focar a tela e quando `deps` mudam; `{dados, erro, carregando, recarregar}` |
| `usePuxar.ts` | Estado de "puxar para atualizar" para telas sem consulta |
| `tema.ts` | Cores claro/escuro (`useCores`), `corStatus`, `ESPACO`, `LARGURA_MAX` |
| `fotos.ts` | `escolherFoto('camera'|'galeria')` (já devolve a foto comprimida), `enviarFoto(uri, pasta)` (sempre `.jpg`) |
| `comprimir-foto.ts` / `.web.ts` | `comprimirFoto(uri)`: reduz para lado maior 1280 px e regrava em JPEG 0,7 (HEIC sai JPEG). Celular: `expo-image-manipulator`; web: canvas do navegador (o manipulator na web desenha a foto inteira e trava no limite de canvas do Safari) |
| `foto-medidas.ts` | `LADO_MAXIMO`, `QUALIDADE_JPEG`, `medidasReduzidas()` |
| `exportar.ts` / `.web.ts` / `exportar-base.ts` | XLSX/CSV: compartilhar no celular, download na web |
| `orcamento-html.ts` | HTML A4 do orçamento + `OBSERVACOES_ORCAMENTO` + `numeroOrcamento` |
| `orcamento-pdf.ts` / `.web.ts` | `criarPdfOrcamento` → `ArquivoPdf`; `compartilharPdf`, `baixarPdf`, `podeCompartilhar`. Celular: `expo-print` + compartilhar. Web: pdfmake (import dinâmico, chunk separado) + Web Share/download |
| `orcamento-pdfmake.ts` | Documento do orçamento no formato pdfmake (mesmo visual do HTML) |
| `logo-marca.ts` | Logo em base64 (gerada de `assets/images/logo-marca.jpg`) |
| `avulsos-recentes.ts` | Últimos itens avulsos no aparelho |
| `armazenamento.ts` / `.web.ts` | Storage da sessão do Supabase |

## Fluxos principais

- **Cadastrar:** categoria → descrição (autocomplete/vínculo) → tamanhos e quantidades (códigos sugeridos, editáveis) → tipo/condição → pertence → valores → foto → site → `criar_produtos(dados, tamanhos[], codigos[])` (um elemento por unidade). Foto nova é enviada antes; vínculo reaproveita `foto_path`.
- **Vender:** buscar código (`buscarPorCodigo`, aceita `SA1` p/ `SA01`) ou item avulso → valor efetivo → canal (Loja/Site Coruja/Site Arquibancada) → forma (taxa da combinação) → confirmação → `registrar_venda` com chave UUID (mantida em reenvio; nova após sucesso) → `obterVenda` → `verificarAlertasSite()`.
- **Orçamento:** cliente → camisas (nome, fotos, serviços) → `salvar_orcamento` → detalhe → status / Gerar PDF. No celular, Gerar PDF já abre o compartilhar; **na web** gera o arquivo e mostra **Compartilhar** / **Baixar** (o compartilhar do navegador exige um toque direto do usuário, então não pode ser chamado depois da geração assíncrona).

## Padrões de interface

- Português do Brasil, linguagem direta. Tema azul (`primaria #1D5FD1`); "Emprestada" usa roxo (`info`).
- Listagens: **descrição em destaque, código secundário**.
- Campos obrigatórios marcados por erro inline embaixo do campo + aviso no topo ("Preencha os N campos destacados").
- Toda tela com dados tem **puxar para atualizar**.
- Formulários longos fecham o teclado em dropdowns/fotos (`Keyboard.dismiss()`).
- Largura máxima de conteúdo `LARGURA_MAX` (1040) e gutter de 16 px; testado a 390 px de largura.
- **Área segura (iPhone em tela cheia / atalho na Tela de Início):** `public/index.html` declara `viewport-fit=cover`, e `react-native-safe-area-context` lê `env(safe-area-inset-*)`. O menu inferior e os cabeçalhos já reservam a área segura. `Tela` reserva a borda de baixo por padrão (`bordas={['bottom']}`) para telas em pilha; **telas dentro das abas usam `bordas={[]}`**, senão a área fica duplicada acima do menu. Não remova o `viewport-fit=cover`: sem ele o menu fica cortado pela barrinha de gestos.

## Textos da interface

Revisados em 2026-10-14 para serem curtos, objetivos e autoexplicativos. Ao escrever texto novo:

- **Títulos de tela e itens de menu:** 1–2 palavras (`Repasses`, `A receber`, `Taxas`, `Serviços e status`). Descrição do menu com até ~4 palavras, e só quando acrescenta algo.
- **Rótulos de campo:** o nome do dado, sem explicação (`Valor da venda (R$)`, `Detalhe (opcional)`, `Previsão (DD/MM/AAAA, opcional)`).
- **Avisos:** uma frase curta com a regra essencial (`A loja absorve a taxa. Mudanças valem só para novas vendas.`). Não explique o que a tela já mostra.
- **Confirmações:** título como pergunta curta (`Cancelar esta venda?`) + consequência em uma frase (`Produtos voltam ao estoque e o financeiro é desfeito.`).
- **Mensagens de sucesso/erro:** diretas (`Recebido`, `Código M1386 não encontrado.`, `Use a data no formato DD/MM/AAAA`).
- **Restrição de acesso:** `Apenas administradores.`
- Botões com verbo: `Revisar venda`, `Ver venda`, `Usar sugeridos`, `Adicionar camisa`.
- Evite repetir o nome das marcas por extenso quando o contexto já deixa claro (`A repassar à Arquibancada`).
