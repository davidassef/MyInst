#!/usr/bin/env node

import { Command } from 'commander';
import { executarLogin } from './commands/login.js';
import { executarPull } from './commands/pull.js';
import { executarPush } from './commands/push.js';
import { executarList } from './commands/list.js';

const programa = new Command();
const MYINST_VERSION = '0.1.0-beta.1';

programa
  .name('myinst')
  .description('CLI para gerenciar seu vault MyInst')
  .version(MYINST_VERSION);

programa
  .command('login')
  .description('Autenticar com o servidor MyInst')
  .action(executarLogin);

programa
  .command('pull [projeto]')
  .description('Baixar conteudo do vault para o diretorio atual')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action((projeto: string = 'default', options: { workspace?: string }) => executarPull(projeto, options.workspace));

programa
  .command('push [projeto]')
  .description('Enviar conteudo local (.claude/) para o vault')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action((projeto: string = 'default', options: { workspace?: string }) => executarPush(projeto, options.workspace));

programa
  .command('list [projeto]')
  .description('Listar conteudo de um projeto no vault')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action((projeto: string = 'default', options: { workspace?: string }) => executarList(projeto, options.workspace));

programa.parse();
