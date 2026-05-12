import { z } from 'zod'
import { getFabricProfile, SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'

export const SimpleItemFeatureSchema = z.object({
  type: z.literal('simple_item'),
  itemId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  displayName: z.string().trim().min(1).max(64),
})

export type SimpleItemFeature = z.infer<typeof SimpleItemFeatureSchema>

/** Tulevaisuudessa useita tyyppejä — toistaiseksi vain simple_item. */
export const ModFeatureSchema = SimpleItemFeatureSchema
export type ModFeature = SimpleItemFeature

/** Request body for POST /v1/build */
export const ModSpecSchema = z.object({
  loader: z.enum(['fabric', 'forge']),
  minecraftVersion: z.string().min(1).max(32),
  modId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  displayName: z.string().trim().min(1).max(64),
  wishText: z.string().max(2000).optional(),
  features: z.array(ModFeatureSchema).max(16).optional(),
})

export type ModSpec = z.infer<typeof ModSpecSchema>

export function validateModSpecForBuild(spec: ModSpec): string | null {
  if (spec.loader !== 'fabric') {
    return 'Tällä hetkellä vain Fabric-tuki. Forge tulossa myöhemmin.'
  }
  const profile = getFabricProfile(spec.minecraftVersion)
  if (!profile) {
    return `Tuetut Minecraft-versiot (Fabric): ${SUPPORTED_MINECRAFT_VERSIONS.join(', ')}.`
  }

  const feats = spec.features ?? []
  const simple = feats.filter((f) => f.type === 'simple_item')
  const ids = new Set<string>()
  for (const f of simple) {
    if (f.itemId === spec.modId) {
      return `Esineen id "${f.itemId}" ei saa olla sama kuin modin id.`
    }
    if (ids.has(f.itemId)) {
      return `Toistuva esine-id: ${f.itemId}`
    }
    ids.add(f.itemId)
  }

  return null
}
