# Publicação no npm

## Pré-requisitos

- Conta no npm (npmjs.com)
- Organização `@myinst` criada no npm
- Login via `npm login`

## Publicar @myinst/shared

O pacote shared é dependência do mcp-server, então precisa ser publicado primeiro.

```bash
cd packages/shared
pnpm build
npm publish --access public
```

## Publicar @myinst/mcp-server

```bash
cd packages/mcp-server
pnpm build
npm publish --access public
```

## Publicar @myinst/cli

```bash
cd packages/cli
pnpm build
npm publish --access public
```

## Verificar publicação

```bash
npm info @myinst/mcp-server
npx @myinst/mcp-server --version
npm info @myinst/cli
npx @myinst/cli --help
```

## Atualizar versão

Use `pnpm version` para bumpar versões:

```bash
cd packages/mcp-server
pnpm version patch  # 0.1.0 -> 0.1.1
pnpm version minor  # 0.1.0 -> 0.2.0
pnpm version major  # 0.1.0 -> 1.0.0
```

```bash
cd packages/cli
pnpm version patch
```

## Notas

- O `workspace:*` no `@myinst/shared` é automaticamente resolvido pelo pnpm para a versão real ao publicar
- O campo `files` no package.json garante que apenas `dist/` é publicado
- O `prepublishOnly` script garante que o build roda antes de publicar
- A licença AGPL-3.0 é incluída automaticamente
