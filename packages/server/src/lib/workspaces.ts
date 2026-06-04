import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { modelProfiles, projects, tags, workspaces } from '../db/schema.js';

const WORKSPACE_DEFAULT_NAME = 'Default';
const WORKSPACE_DEFAULT_SLUG = 'default';
const PROJECT_DEFAULT_NAME = 'Default';
const PROJECT_DEFAULT_SLUG = 'default';

interface WorkspaceRecord {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectRecord {
  id: string;
  userId: string;
  workspaceId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function obterWorkspaceDefault(userId: string): Promise<WorkspaceRecord> {
  const [workspaceExistente] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), eq(workspaces.isDefault, true)))
    .limit(1);

  if (workspaceExistente) {
    await reanexarDadosLegadosAoWorkspace(userId, workspaceExistente.id);
    return workspaceExistente;
  }

  const [workspaceCriado] = await db
    .insert(workspaces)
    .values({
      userId,
      name: WORKSPACE_DEFAULT_NAME,
      slug: WORKSPACE_DEFAULT_SLUG,
      description: 'Workspace padrão',
      isDefault: true,
    })
    .returning();

  await reanexarDadosLegadosAoWorkspace(userId, workspaceCriado.id);
  return workspaceCriado;
}

export async function resolverWorkspaceDoUsuario(userId: string, workspaceSlug?: string): Promise<WorkspaceRecord | null> {
  const workspaceDefault = await obterWorkspaceDefault(userId);
  if (!workspaceSlug) {
    return workspaceDefault;
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), eq(workspaces.slug, workspaceSlug)))
    .limit(1);

  return workspace ?? null;
}

export async function buscarProjetoNoWorkspace(
  userId: string,
  projectSlug: string,
  workspaceSlug?: string,
): Promise<{ workspace: WorkspaceRecord; project: ProjectRecord } | null> {
  const workspace = await resolverWorkspaceDoUsuario(userId, workspaceSlug);
  if (!workspace) return null;

  const [project] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.userId, userId),
      eq(projects.workspaceId, workspace.id),
      eq(projects.slug, projectSlug),
    ))
    .limit(1);

  return project ? { workspace, project } : null;
}

export async function garantirProjetoDefault(workspaceId: string, userId: string): Promise<ProjectRecord> {
  const [projetoExistente] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.userId, userId),
      eq(projects.workspaceId, workspaceId),
      eq(projects.isDefault, true),
    ))
    .limit(1);

  if (projetoExistente) {
    return projetoExistente;
  }

  const [projetoComSlugDefault] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.userId, userId),
      eq(projects.workspaceId, workspaceId),
      eq(projects.slug, PROJECT_DEFAULT_SLUG),
    ))
    .limit(1);

  if (projetoComSlugDefault) {
    const [atualizado] = await db
      .update(projects)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(projects.id, projetoComSlugDefault.id))
      .returning();

    return atualizado;
  }

  const [projetoCriado] = await db
    .insert(projects)
    .values({
      userId,
      workspaceId,
      name: PROJECT_DEFAULT_NAME,
      slug: PROJECT_DEFAULT_SLUG,
      description: 'Projeto padrão',
      isDefault: true,
    })
    .returning();

  return projetoCriado;
}

async function reanexarDadosLegadosAoWorkspace(userId: string, workspaceId: string) {
  await db
    .update(projects)
    .set({ workspaceId, updatedAt: new Date() })
    .where(and(eq(projects.userId, userId), isNull(projects.workspaceId)));

  await db
    .update(tags)
    .set({ workspaceId })
    .where(and(eq(tags.userId, userId), isNull(tags.workspaceId)));

  await db
    .update(modelProfiles)
    .set({ workspaceId })
    .where(and(eq(modelProfiles.userId, userId), isNull(modelProfiles.workspaceId)));

  await garantirProjetoDefault(workspaceId, userId);
}
