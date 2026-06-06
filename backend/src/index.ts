import { criarApp } from './app.js';
import { carregarAmbiente } from './env.js';
import { seedPlans } from './db/seed.js';

const configuracao = carregarAmbiente();
const app = await criarApp(configuracao);

try {
  await seedPlans();
  await app.listen({ port: configuracao.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
