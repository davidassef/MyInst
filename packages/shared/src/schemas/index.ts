import { z } from 'zod';
import { CONTENT_TYPES, TAG_CATEGORIES, API_KEY_SCOPES } from '../constants.js';

export const registrarUsuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const criarApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).default(['read', 'write']),
  expiresAt: z.string().datetime().optional(),
});

export const criarWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const atualizarWorkspaceSchema = criarWorkspaceSchema.partial();

export const criarProjetoSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const atualizarProjetoSchema = criarProjetoSchema.partial();

export const criarFolderSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().default(0),
});

export const criarConteudoSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  body: z.string().min(1),
  folderId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const atualizarConteudoSchema = criarConteudoSchema.partial();

export const criarTagSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  category: z.enum(TAG_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const criarPerfilSchema = z.object({
  name: z.string().min(1).max(100),
  modelPattern: z.string().min(1).max(200),
  tags: z.array(z.string()).min(1),
});

export const atualizarPerfilSchema = criarPerfilSchema.partial();

export const syncPullSchema = z.object({
  workspace: z.string().optional(),
  project: z.string(),
  types: z.array(z.enum(CONTENT_TYPES)).optional(),
  tags: z.array(z.string()).optional(),
  since: z.string().datetime().optional(),
});

export const syncPushSchema = z.object({
  workspace: z.string().optional(),
  project: z.string(),
  folderSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  items: z.array(z.object({
    type: z.enum(CONTENT_TYPES),
    title: z.string().min(1).max(200),
    slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
    body: z.string().min(1),
    metadata: z.record(z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
  })),
});
