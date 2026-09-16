# LivreAnalise

## Conta do GitHub

Este repositório é pessoal, mas a máquina tem duas contas autenticadas no `gh` e
a ativa costuma ser a profissional (`lucastito-v360`), que **não é colaboradora
aqui** — qualquer `gh issue`, `gh pr` ou `gh release` falha com "must be a
collaborator".

**Não usar `gh auth switch`.** A conta ativa do `gh` é global: trocar aqui muda
também a conta dos repositórios de trabalho. Em vez disso, passar o token da
conta pessoal por comando:

```bash
GH_TOKEN=$(gh auth token --user Lucas-Tito) gh issue create ...
```

O `gh auth token --user` lê o token direto do keyring e **não altera a conta
ativa**. O git não precisa de nada: o remoto usa o alias SSH `github-pessoal`,
então push e fetch já saem pela conta pessoal.

## Commits

O autor é só o Lucas. **Não adicionar `Co-Authored-By` de IA** em commit nenhum,
nem assinatura de ferramenta em descrição de PR.

Conventional Commits em português, só o título, sem corpo:
`fix(renderer): manter destaque da seleção ao abrir popover`.

## Versão

Ver a seção **Versionamento** do README. O resumo: a versão mora só no
`package.json`, quem precisa dela no código importa de `@shared/version`, e todo
PR para a `master` incrementa — senão o merge sobrescreve os instaladores da
release anterior.

## Testes

Rodar sempre `npm test`, **nunca `npx vitest` direto**. O `better-sqlite3` é
compilado e o ABI do Electron é diferente do ABI do Node: o `pretest` recompila
para o Node e o `posttest` devolve para o Electron. Sem isso, os testes que
tocam o banco falham com erro de ABI.
