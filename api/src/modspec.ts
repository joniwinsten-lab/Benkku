import { z } from 'zod'
import { getFabricProfile, SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'

export const SimpleItemFeatureSchema = z.object({
  type: z.literal('simple_item'),
  itemId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  displayName: z.string().trim().min(1).max(64),
  /** Valinnainen #RRGGBB — tasainen 16×16 tekstuuri inventaarioon */
  tintHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export type SimpleItemFeature = z.infer<typeof SimpleItemFeatureSchema>

const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const
export type ArmorSlot = (typeof ARMOR_SLOTS)[number]

/** Tekoäly / käyttäjä voi käyttää arkikieltä; normalisoidaan ennen enum-tarkistusta. */
const ARMOR_SLOT_ALIASES: Record<string, ArmorSlot> = {
  helmet: 'helmet',
  head: 'helmet',
  hat: 'helmet',
  cap: 'helmet',
  chestplate: 'chestplate',
  chest: 'chestplate',
  body: 'chestplate',
  torso: 'chestplate',
  leggings: 'leggings',
  legs: 'leggings',
  pants: 'leggings',
  trousers: 'leggings',
  boots: 'boots',
  feet: 'boots',
  foot: 'boots',
  shoes: 'boots',
}

function normalizeArmorSlotInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const t = raw.trim().toLowerCase()
  if ((ARMOR_SLOTS as readonly string[]).includes(t)) return t
  return ARMOR_SLOT_ALIASES[t] ?? raw
}

export const ArmorSlotSchema = z.preprocess(normalizeArmorSlotInput, z.enum(ARMOR_SLOTS))

export const SimpleArmorFeatureSchema = z.object({
  type: z.literal('simple_armor'),
  armorId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  displayName: z.string().trim().min(1).max(64),
  slot: ArmorSlotSchema,
  tintHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export type SimpleArmorFeature = z.infer<typeof SimpleArmorFeatureSchema>

export const ModFeatureSchema = z.discriminatedUnion('type', [
  SimpleItemFeatureSchema,
  SimpleArmorFeatureSchema,
])

export type ModFeature = z.infer<typeof ModFeatureSchema>

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
  const ids = new Set<string>()
  const armorSlots = new Set<string>()

  for (const f of feats) {
    if (f.type === 'simple_item') {
      if (f.itemId === spec.modId) {
        return `Esineen id "${f.itemId}" ei saa olla sama kuin modin id.`
      }
      if (ids.has(f.itemId)) {
        return `Toistuva id: ${f.itemId}`
      }
      ids.add(f.itemId)
    } else {
      if (f.armorId === spec.modId) {
        return `Armor-id "${f.armorId}" ei saa olla sama kuin modin id.`
      }
      if (ids.has(f.armorId)) {
        return `Toistuva id: ${f.armorId}`
      }
      ids.add(f.armorId)
      if (armorSlots.has(f.slot)) {
        return `Sama armor-slot kahdesti: ${f.slot}`
      }
      armorSlots.add(f.slot)
    }
  }

  return null
}
