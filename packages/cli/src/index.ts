#!/usr/bin/env node

import { Command } from 'commander';
import { executarLogin } from './commands/login.js';
import { executarPull } from './commands/pull.js';
import { executarPush } from './commands/push.js';
import { executarList } from './commands/list.js';

const programa = new Command();

programa
  .name('myinst')
  .description('CLI para gerenciar seu vault MyInst')
  .version('0.1.0');

programa
  .command('login')
  .description('Autenticar com o servidor MyInst')
  .action(executarLogin);

programa
  .command('pull [projeto]')
  .description('Baixar conteudo do vault para o diretorio atual')
  .action((projeto: string = 'default') => executarPull(projeto));

programa
  .command('push [projeto]')
  .description('Enviar conteudo local (.claude/) para o vault')
  .action((projeto: string = 'default') => executarPush(projeto));

programa
  .command('list [projeto]')
  .description('Listar conteudo de um projeto no vault')
  .action((projeto: string = 'default') => executarList(projeto));

programa.parse();
