import { and, eq, inArray } from 'drizzle-orm';
import type { ClientProfileId } from '@myinst/shared';
import { db } from '../src/db/index.js';
import {
  clientProfiles,
  clientProfileItems,
  clientProfileItemVersions,
  contentItems,
  contentVersions,
  folders,
  projects,
} from '../src/db/schema.js';
import { obterOuCriarClientProfile } from '../src/lib/client-profiles.js';

const CLIENTES_GLOBAIS = [
  'codex',
  'claude',
  'cursor',
  'gemini',
  'opencode',
  'qwen',
  'aider',
  'antigravity',
] as const satisfies ClientProfileId[];

async function main() {
  for (const clientId of CLIENTES_GLOBAIS) {
    await migrarCliente(clientId);
  }

  console.log('[INFO] Migração lógica de client profiles concluída.');
}

async function migrarCliente(clientId: ClientProfileId) {
  const folderSlug = `${clientId}-global`;
  const pastas = await db
    .select({
      folderId: folders.id,
      projectId: folders.projectId,
      userId: projects.userId,
    })
    .from(folders)
    .innerJoin(projects, eq(projects.id, folders.projectId))
    .where(eq(folders.slug, folderSlug));

  for (const pasta of pastas) {
    const perfil = await obterOuCriarClientProfile(pasta.userId, clientId);
    const itens = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, pasta.projectId), eq(contentItems.folderId, pasta.folderId)));

    for (const item of itens) {
      const [existente] = await db
        .select({ id: clientProfileItems.id })
        .from(clientProfileItems)
        .where(and(
          eq(clientProfileItems.clientProfileId, perfil.id),
          eq(clientProfileItems.type, item.type),
          eq(clientProfileItems.slug, item.slug),
        ))
        .limit(1);

      if (!existente) {
        const [novo] = await db
          .insert(clientProfileItems)
          .values({
            userId: item.userId,
            clientProfileId: perfil.id,
            type: item.type,
            title: item.title,
            slug: item.slug,
            description: item.description,
            body: item.body,
            metadata: {
              ...(item.metadata as Record<string, unknown>),
              originFolder: folderSlug,
            },
            isActive: item.isActive,
            version: item.version,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
          .returning({ id: clientProfileItems.id });

        const versoes = await db
          .select()
          .from(contentVersions)
          .where(eq(contentVersions.contentId, item.id));

        if (versoes.length > 0) {
          await db.insert(clientProfileItemVersions).values(
            versoes.map((versao) => ({
              clientProfileItemId: novo.id,
              version: versao.version,
              body: versao.body,
              metadata: versao.metadata,
              createdAt: versao.createdAt,
            })),
          );
        }
      }

      await db.delete(contentVersions).where(eq(contentVersions.contentId, item.id));
      await db.delete(contentItems).where(eq(contentItems.id, item.id));
    }

    const itensRestantes = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(eq(contentItems.folderId, pasta.folderId))
      .limit(1);

    if (itensRestantes.length === 0) {
      await db.delete(folders).where(eq(folders.id, pasta.folderId));
    }
  }
}

main().catch((error) => {
  console.error('[ERROR] Falha na migração lógica de client profiles:', error);
  process.exit(1);
});
