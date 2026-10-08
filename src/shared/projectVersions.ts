/**
 * `auto`: checkpoint de cada abertura, podado pela retencao.
 * `manual`: criado pela pessoa, nunca podado.
 * `premigracao`: copia tirada antes de migrar o schema. Nunca podada: era a
 *   unica copia do estado anterior a migracao, e entrar na retencao de 10
 *   automaticos significava perde-la depois de 10 aberturas -- justamente a
 *   rede de protecao da operacao mais arriscada do app.
 */
export type ProjectVersionKind = 'manual' | 'auto' | 'premigracao'

export interface ProjectVersion {
  id: string
  file: string
  createdAt: string
  kind: ProjectVersionKind
  label: string | null
  appVersion: string
  schemaVersion: number
  projectName: string
  sizeBytes: number
}
