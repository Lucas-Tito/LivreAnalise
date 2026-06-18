import { sql } from 'drizzle-orm'
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

export const projectMeta = sqliteTable('project_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guid: text('guid').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  appVersion: text('app_version').notNull().default('0.1.0')
})

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guid: text('guid').notNull().unique(),
  name: text('name').notNull(),
  plainText: text('plain_text').notNull(),
  originalFormat: text('original_format').notNull(),
  sourceFilename: text('source_filename'),
  charCount: integer('char_count').notNull().default(0),
  importedAt: text('imported_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
})

export const codes = sqliteTable('codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guid: text('guid').notNull().unique(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#2563eb'),
  description: text('description'),
  parentId: integer('parent_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
})

export const codeGroups = sqliteTable('code_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guid: text('guid').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  parentGroupId: integer('parent_group_id'),
  sortOrder: integer('sort_order').notNull().default(0)
})

export const codeGroupMembers = sqliteTable(
  'code_group_members',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => codeGroups.id, { onDelete: 'cascade' }),
    codeId: integer('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.codeId] })
  })
)

export const codings = sqliteTable(
  'codings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guid: text('guid').notNull().unique(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    codeId: integer('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    startPos: integer('start_pos').notNull(),
    endPos: integer('end_pos').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
  },
  (table) => ({
    uniqueSpan: uniqueIndex('codings_unique_span').on(
      table.documentId,
      table.codeId,
      table.startPos,
      table.endPos
    )
  })
)

export type ProjectMetaRow = typeof projectMeta.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type CodeRow = typeof codes.$inferSelect
export type CodeGroupRow = typeof codeGroups.$inferSelect
export type CodingRow = typeof codings.$inferSelect
