# LivreAnalise

Aplicativo de desktop para **codificação qualitativa de documentos** — a análise que
normalmente se faz no ATLAS.ti ou no NVivo, em software livre, rodando inteiramente na
sua máquina.

Nenhum dado sai do computador: o projeto é um arquivo `.liva` (SQLite) no seu disco, e
não existe conta, servidor ou nuvem em nenhuma parte do fluxo. Isso importa quando o
material analisado é entrevista com participante identificável.

[![CI](https://github.com/Lucas-Tito/LivreAnalise/actions/workflows/ci.yml/badge.svg)](https://github.com/Lucas-Tito/LivreAnalise/actions/workflows/ci.yml)

<!-- imagem: codificacao de um documento -- a arvore de grupos, categorias e
     codigos a esquerda e as etiquetas alinhadas na margem direita.
     Arraste o print aqui ao editar o README pelo GitHub. -->

## Abrir um projeto da série 0.7.x na 0.8.0

Ao abrir ou restaurar um projeto antigo, o aplicativo pede confirmação antes de converter o arquivo. Cancelar mantém o formato anterior. Ao confirmar, o LivreAnalise cria e verifica uma cópia no formato original na pasta `<nome>.liva-versoes`, ao lado do destino. Se a cópia falhar, a conversão é interrompida. Para voltar à versão anterior, copie o arquivo identificado como `premigracao` para outra pasta e abra essa cópia com o aplicativo antigo. Alterações feitas depois da conversão ficam no projeto atualizado.

## Download

Os instaladores de cada versão ficam na
[página de releases](https://github.com/Lucas-Tito/LivreAnalise/releases):

| Sistema | Arquivo |
| --- | --- |
| Linux | `LivreAnalise-<versão>.AppImage` ou `.deb` |
| Windows | `LivreAnalise-<versão>-setup.exe` |
| macOS | `LivreAnalise-<versão>-<arch>.dmg` |

<!-- imagem: tela inicial -- pontos de entrada e projetos recentes -->

Os binários **não são assinados**. No Windows o SmartScreen avisa que o aplicativo não é
reconhecido na primeira execução; no macOS é preciso abrir pelo menu de contexto
(botão direito → Abrir) na primeira vez.

### Instalar e atualizar no Ubuntu

Um comando só, que baixa a versão mais recente e instala por cima da anterior:

```bash
cd /tmp && curl -fL -o LivreAnalise.deb "$(curl -fsSL https://api.github.com/repos/Lucas-Tito/LivreAnalise/releases/latest | grep -o 'https://[^"]*\.deb')" && sudo apt install -y ./LivreAnalise.deb
```

Ele pergunta a URL do `.deb` para a API do GitHub em vez de trazer o nome do arquivo
fixo, então continua funcionando quando a versão mudar. Seus projetos `.liva` não são
tocados pela instalação.

Feche o aplicativo antes de rodar: instalar por cima de um binário em execução funciona,
mas a janela aberta segue na versão antiga até você reiniciar.

## Funcionalidades

### Documentos

Importa `.docx`, `.txt` e outros formatos de texto para dentro do projeto. O conteúdo é
copiado para o `.liva`, então mover ou apagar o arquivo original depois não quebra o
projeto. O texto pode ser editado dentro do app, e as codificações existentes acompanham
a edição em vez de se deslocarem.

A extração de DOCX roda em worker isolado, com limite de memória e prazo de
30 segundos. Por segurança, são aceitos até 50 MiB de arquivo DOCX, 16 MiB por
entrada XML e 32 MiB de XML expandido no total; arquivos TXT têm limite de 32 MiB.
Mídia embutida no DOCX não é expandida para extrair texto puro.

### Codificação

Selecione um trecho do texto e aplique um código. As áreas codificadas aparecem
destacadas na cor do código, com etiquetas na margem direita alinhadas ao início de cada
trecho. Codificações do mesmo código que se sobrepõem são mescladas automaticamente, e a
extensão de uma citação pode ser ajustada arrastando as extremidades.

Também é possível codificar sem mouse:

1. Use `Ctrl+P` (`Cmd+P` no macOS) para procurar e abrir um documento.
2. No documento, acione **Navegar pelo texto**. O modo de análise é somente leitura;
   use as setas para navegar e `Shift` com as setas para selecionar.
3. Pressione `Ctrl+Enter` (`Cmd+Enter` no macOS) para abrir o menu do trecho. Digite
   para filtrar, percorra as opções com `↑` e `↓` e confirme com `Enter`.
4. `Esc` fecha o menu ou sai da navegação. `F6` e `Shift+F6` percorrem as áreas
   da janela; na barra lateral, as setas alternam entre Documentos e Códigos.
5. Use `F2` para renomear o documento em foco ou o documento aberto. `Enter`
   confirma o nome, `Esc` cancela.

Na árvore de códigos, use as setas para percorrer, expandir e recolher itens.
`Espaço` alterna a seleção, `Shift+↑/↓` seleciona um intervalo, `Enter` abre os
detalhes e `Shift+F10` abre as ações do item.

`Ctrl+Shift+N` cria uma nota para o trecho selecionado ou para o documento,
`Ctrl+Shift+O` abre ou fecha o painel de notas e `Ctrl+Shift+M` abre o memo do
item em foco na árvore. No macOS, use `Cmd` no lugar de `Ctrl`.

Abra a **Paleta de comandos** com `Ctrl+K` (`Cmd+K` no macOS) para buscar ações,
ou consulte a **Ajuda de atalhos** com `F1` ou pelo botão na barra superior.

### Código, categoria e grupo

A hierarquia tem exatamente três níveis:

- **código** — o átomo. É o único nível que recebe citação.
- **categoria** — reúne códigos e também pode ser criada vazia. Uma categoria não
  pode ser aplicada a um trecho.
- **grupo** — reúne categorias e códigos, de forma transversal.

Categoria e grupo podem nascer vazios ou a partir de quem eles reúnem ("criar
categoria com este código", "criar grupo com esta categoria").

No código-fonte os nomes são os antigos: categoria é `group` (`groupIds`,
`createGroupFromCodes`) e grupo é `Collection` (tabela `code_groups`).

### Citações e métricas

Cada código mostra quantas vezes foi usado, e dá para listar todos os trechos de um
código. A tela inicial exibe as métricas de cada projeto recente (documentos, códigos,
citações).

### Importação e exportação REFI-QDA (`.qdpx`)

Interopera com o ATLAS.ti pelo formato aberto REFI-QDA. Abrir um `.qdpx` (pelo "Abrir projeto") cria um
projeto novo — a importação não mistura dados em um projeto existente.
Escolha um destino que ainda não exista. A importação é preparada separadamente;
se falhar, o projeto anterior permanece aberto e nenhum lote parcial é publicado.
O limite é 128 MiB para o arquivo QDPX, 32 MiB por fonte expandida e 256 MiB
expandidos no total.

O mapeamento é direto nos dois sentidos:

| LivreAnalise | `.qdpx` |
| --- | --- |
| código | `Code` folha |
| categoria | `Code` aninhado |
| grupo | `Set` + `MemberCode` |
| citação | `PlainTextSelection` + `Coding` |

A hierarquia de códigos para em dois níveis, igual ao ATLAS.ti, que também só oferece
código dentro de código.

### Transcrição

Gera a transcrição de um áudio ou vídeo **localmente**, sem enviar nada para nenhuma API.
Usa o [whisper.cpp](https://github.com/ggml-org/whisper.cpp) com os modelos Whisper da
OpenAI em formato ggml. O texto aparece na tela conforme é reconhecido, e a barra de
progresso mostra a fração de áudio já processada — não uma roda girando.

O resultado é salvo como `<arquivo>_transcricao.txt`, no formato
`[HH:MM:SS.mmm -> HH:MM:SS.mmm] texto`, para você importar como documento no projeto.
Se esse nome já existir, é gerado um nome numerado — uma transcrição revisada
nunca é substituída silenciosamente.

Em **Avançado** dá para escolher o modelo, o idioma e o caminho do executável.

<!-- imagem: tela de transcricao com as opcoes avancadas abertas -->

#### Pontos de atenção

- **O modelo é baixado no primeiro uso.** O padrão é o `medium` quantizado, com
  **514 MB**. O app pergunta antes de baixar, mostrando o tamanho exato informado pelo
  servidor, com barra de progresso própria e retomada se a conexão cair. O download só é
  aceito se o tamanho final e o SHA-256 conferirem. Os modelos usam uma revisão
  fixada do upstream, e arquivos já armazenados também são verificados antes do uso.
- **O modelo quantizado não é um downgrade.** O `faster-whisper` com `compute_type="int8"`
  também roda quantizado; o `medium-q5_0` é o equivalente em ggml, com um terço do
  download do modelo completo (514 MB contra 1462 MB).
- **macOS precisa do executável instalado à parte.** O whisper.cpp não publica binário de
  CLI para macOS, então o app baixa automaticamente só no Linux e no Windows. No Mac,
  instale (por exemplo `brew install whisper-cpp`) e informe o caminho em Avançado.
- **O ffmpeg vem embutido**, então não é preciso instalar nada para transcrever vídeo.
  Ele é usado para extrair a trilha de áudio e para descobrir a duração, que é o
  denominador da barra de progresso. O binário embutido é uma build **GPLv3** do ffmpeg —
  veja a seção de licença.
- **Uma transcrição por vez**, e o processamento é em CPU: uma hora de áudio leva
  bastante tempo. Cancelar descarta tudo — não fica arquivo parcial.
- **Não identifica quem falou.** Separar locutores (diarização) não é função do Whisper e
  exigiria outro modelo; está fora do escopo por enquanto.

## Desenvolvimento

```bash
npm install
npm run dev          # abre o app em modo desenvolvimento
npm test             # roda a suíte de testes
npm run typecheck    # verifica os tipos do main, do preload e do renderer
npm run dist:linux   # gera os instaladores localmente
```

Electron + React + TypeScript, com SQLite via better-sqlite3 e Drizzle, e Tailwind na
interface.

No Linux, `npm run dev` e o preview local (`npm start`) passam `--no-sandbox` ao Electron antes da inicialização,
evitando falhas do sandbox local (incluindo erros `No such process` em `/dev/shm`).
Isso desabilita o sandbox **nos launchers locais de desenvolvimento e preview**; os aplicativos
empacotados não recebem essa opção. Use o modo de desenvolvimento apenas com
conteúdo confiável. Windows e macOS mantêm o comportamento padrão.

### O detalhe do módulo nativo

O `better-sqlite3` é compilado, e o ABI do Electron é diferente do ABI do Node. Por isso
`npm test` recompila o módulo para o Node antes de rodar (`pretest`) e o runner
de testes devolve para o Electron depois, inclusive quando algum teste falha.

Consequência prática: **não rode `npx vitest` direto** — os testes de banco falham com
erro de ABI. Use `npm test`. Para o modo watch, rode `npm run rebuild:node` antes e
`npm run rebuild` depois, na mão.

### Branches e CI

- **`develop`** é onde o trabalho acontece. Cada push roda os testes e o typecheck.
- **`master`** é protegida: só recebe pull request com os testes passando.
- Todo merge na `master` gera os instaladores de Linux, Windows e macOS e publica na
  release correspondente à versão do `package.json`.

Testes e empacotamento ficam em jobs separados de propósito: o `pretest` recompila o
módulo nativo para o ABI do Node e quebraria o binário empacotado.

### Versionamento

A versão mora **só no `package.json`**. É ela que nomeia a tag da release, os
arquivos dos instaladores e o que aparece em Créditos. Quem precisa da versão
dentro do código importa de `@shared/version` — nunca escreve o número à mão,
porque uma cópia literal sai de sincronia sem ninguém perceber (foi o que
aconteceu com o `APP_ORIGIN` do QDPX, que carimbou `0.1.0` em todo projeto
exportado muito depois de a versão ter mudado).

**Todo PR para a `master` incrementa a versão.** A CI recusa um PR que mantenha a versão publicada. Antes do merge, o workflow Build pode ser executado manualmente com `workflow_dispatch`. Ele empacota Linux, Windows e macOS (Intel e Apple Silicon), confere os cinco instaladores e ensaia uma publicação interrompida. A execução manual usa permissão de leitura.

No push para a `master`, a publicação cria um rascunho para o commit. Se o upload falhar, use **Re-run failed jobs** na mesma execução para reaproveitar os instaladores. O job confere os arquivos já enviados por tamanho e SHA-256, envia os pendentes e publica quando os cinco estão completos. Uma divergência de tag, commit ou conteúdo interrompe o job. Uma release publicada e idêntica já está concluída.

Se a finalização do rascunho falhar por falta de permissão para criar a tag em
um commit antigo que altera workflows, um mantenedor com permissão para
atualizar workflows deve publicar a tag para o **SHA do run original**. Confira
a versão em `git show "$SHA:package.json"` e o SHA de destino do rascunho antes
de publicar a tag:

```sh
git push origin "$SHA:refs/tags/$TAG"
```

Use a tag do rascunho (por exemplo, `v0.7.1`) em `TAG`. O comando não usa
`--force`. Se a tag já existir, confira seu commit e pare se houver divergência.
Em seguida, use **Re-run failed jobs** no run original. O publicador confere
se a tag aponta para o mesmo SHA antes de retomar os uploads e a finalização.

Como escolher o incremento:

| Mudança | Incrementa | Exemplo |
| --- | --- | --- |
| Correção de bug, ajuste pequeno, campo novo (`fix:`) | o último número | `0.2.0` → `0.2.1` |
| Funcionalidade nova ou mudança maior (`feat:`) | o do meio, zerando o último | `0.2.1` → `0.3.0` |
| Quebra de compatibilidade ou virada de produto | o primeiro, zerando os outros | `0.3.0` → `1.0.0` |

O primeiro número muda pouco. Ele serve para avisar que **algo com que a pessoa
contava deixou de valer**: um projeto antigo que não abre mais, uma exportação
que muda de formato, uma funcionalidade removida, ou uma reescrita que faz o app
ser outro produto. Também é o número que marca o `1.0.0`, quando o projeto
deixar de ser experimental.

A régua é o susto: se a pessoa atualizar e precisar reaprender ou refazer
alguma coisa, é o primeiro número.

Quando o PR junta várias mudanças, vale a maior: um `feat:` no meio de três
`fix:` faz o incremento ser do número do meio.

### Convenção de commits

Conventional Commits em português, só o título, sem corpo. Exemplo:
`fix(renderer): manter destaque da seleção ao abrir popover`.

Em um clone novo, ative os hooks do repositório uma vez:

```bash
git config core.hooksPath .githooks
```

## Licença

O projeto se declara MIT no `package.json`, mas o arquivo `LICENSE` ainda não existe no
repositório — veja a
[issue #27](https://github.com/Lucas-Tito/LivreAnalise/issues/27). Enquanto isso não for
resolvido, considere os direitos como reservados.

Os instaladores incluem um binário do **ffmpeg** compilado com `--enable-gpl
--enable-version3`, ou seja **GPLv3**. Isso não altera a licença do código deste
repositório, que roda em processo separado, mas cria obrigações de distribuição para o
binário em si (disponibilizar o fonte correspondente e o texto da licença). A alternativa
é trocar por uma build LGPL, que é suficiente para o que o app faz — nenhum componente GPL
(x264, x265) é usado aqui. Isso também está registrado na issue #27.
