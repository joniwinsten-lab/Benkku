import { z } from 'zod'

/** Request body for POST /v1/build */
export const ModSpecSchema = z.object({
  loader: z.enum(['fabric', 'forge']),
  minecraftVersion: z.string().min(1).max(32),
  modId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  displayName: z.string().trim().min(1).max(64),
  wishText: z.string().max(2000).optional(),
})

export type ModSpec = z.infer<typeof ModSpecSchema>

export function validateModSpecForBuild(spec: ModSpec): string | null {
  if (spec.loader !== 'fabric') {
    return 'Tällä hetkellä vain Fabric-tuki. Forge tulossa myöhemmin.'
  }
  if (spec.minecraftVersion !== '1.21') {
    return 'Tällä hetkellä vain Minecraft 1.21 (Fabric). Muut versiot tulossa.'
  }
  return null
}
