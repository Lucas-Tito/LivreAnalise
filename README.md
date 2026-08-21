# LivreAnalise

Aplicativo de desktop para **codificação qualitativa de documentos** — a análise que
normalmente se faz no ATLAS.ti ou no NVivo, em software livre, rodando inteiramente na
sua máquina.

Nenhum dado sai do computador: o projeto é um arquivo `.liva` (SQLite) no seu disco, e
não existe conta, servidor ou nuvem em nenhuma parte do fluxo. Isso importa quando o
material analisado é entrevista com participante identificável.

[![CI](https://github.com/Lucas-Tito/LivreAnalise/actions/workflows/ci.yml/badge.svg)](https://github.com/Lucas-Tito/LivreAnalise/actions/workflows/ci.yml)

## Download

Os instaladores de cada versão ficam na
[página de releases](https://github.com/Lucas-Tito/LivreAnalise/releases):

| Sistema | Arquivo |
| --- | --- |
| Linux | `LivreAnalise-<versão>.AppImage` ou `.deb` |
| Windows | `LivreAnalise-<versão>-setup.exe` |
| macOS | `LivreAnalise-<versão>-<arch>.dmg` |

Os binários **não são assinados**. No Windows o SmartScreen avisa que o aplicativo não é
reconhecido na primeira execução; no macOS é preciso abrir pelo menu de contexto
(botão direito → Abrir) na primeira vez.

## Funcionalidades

### Documentos

Importa `.docx`, `.txt` e outros formatos de texto para dentro do projeto. O conteúdo é
copiado para o `.liva`, então mover ou apagar o arquivo original depois não quebra o
projeto. O texto pode ser editado dentro do app, e as codificações existentes acompanham
a edição em vez de se deslocarem.

### Codificação

Selecione um trecho do texto e aplique um código. As áreas codificadas aparecem
destacadas na cor do código, com etiquetas na margem direita alinhadas ao início de cada
trecho. Codificações do mesmo código que se sobrepõem são mescladas automaticamente, e a
extensão de uma citação pode ser ajustada arrastando as extremidades.

### Código, grupo e coleção

A hierarquia tem exatamente três níveis:

- **código** — o átomo. É o único nível que recebe citação.
- **grupo** — um código que contém outros códigos. Não é um campo no banco: é a
  propriedade derivada de ter filhos. Um grupo não pode ser aplicado a um trecho.
- **coleção** — reúne grupos e códigos, de forma transversal.

Grupo e coleção nascem a partir de quem eles agrupam ("criar grupo com este código",
"criar coleção com este grupo"), então um grupo nunca existe vazio.

### Citações e métricas

Cada código mostra quantas vezes foi usado, e dá para listar todos os trechos de um
código. A tela inicial exibe as métricas de cada projeto recente (documentos, códigos,
citações).

### Importação e exportação REFI-QDA (`.qdpx`)

Interopera com o ATLAS.ti pelo formato aberto REFI-QDA. Importar um `.qdpx` cria um
projeto novo — a importação não mistura dados em um projeto existente.

O mapeamento é direto nos dois sentidos:

| LivreAnalise | `.qdpx` |
| --- | --- |
| código | `Code` folha |
| grupo | `Code` aninhado |
| coleção | `Set` + `MemberCode` |
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

Em **Avançado** dá para escolher o modelo, o idioma e o caminho do executável.

#### Pontos de atenção

- **O modelo é baixado no primeiro uso.** O padrão é o `medium` quantizado, com
  **514 MB**. O app pergunta antes de baixar, mostrando o tamanho exato informado pelo
  servidor, com barra de progresso própria e retomada se a conexão cair. O download só é
  aceito se o tamanho final conferir — download truncado é recusado em vez de virar um
  modelo corrompido que falha muito depois.
- **O modelo quantizado não é um downgrade.** O `faster-whisper` com `compute_type="int8"`
  também roda quantizado; o `medium-q5_0` é o equivalente em ggml, com um terço do
  download do modelo completo (514 MB contra 1462 MB).
- **macOS precisa do executável instalado à parte.** O whisper.cpp não publica binário de
  CLI para macOS, então o app baixa automaticamente só no Linux e no Windows. No Mac,
  instale (por exemplo `brew install whisper-cpp`) e informe o caminho em Avançado.
- **Vídeo exige ffmpeg no sistema.** Áudio em `wav`, `mp3`, `ogg` e `flac` é lido
  diretamente. Para `mp4`, `mkv`, `mov` e `m4a` é preciso ter o `ffmpeg` instalado, que é
  quem extrai a trilha de áudio.
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

### O detalhe do módulo nativo

O `better-sqlite3` é compilado, e o ABI do Electron é diferente do ABI do Node. Por isso
`npm test` recompila o módulo para o Node antes de rodar (`pretest`) e devolve para o
Electron depois (`posttest`).

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
