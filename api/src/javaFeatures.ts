import type { ModSpec, SimpleArmorFeature, SimpleItemFeature } from './modspec.js'

/**
 * Generoi ModFeatures.java — pohja käyttää `loom.officialMojangMappings()`,
 * joten nimet vastaavat Mojang-mappeja (ResourceLocation, BuiltInRegistries, …).
 */
export function renderModFeaturesJava(spec: ModSpec, javaRelease: number): string {
  const feats = spec.features ?? []
  const items = feats.filter((f): f is SimpleItemFeature => f.type === 'simple_item')
  const armors = feats.filter((f): f is SimpleArmorFeature => f.type === 'simple_armor')

  const lines: string[] = []
  lines.push('package fi.benkku.mod;')
  lines.push('')
  lines.push('import net.minecraft.core.Registry;')
  lines.push('import net.minecraft.core.registries.BuiltInRegistries;')
  lines.push('import net.minecraft.resources.ResourceLocation;')
  lines.push('import net.minecraft.world.item.ArmorItem;')
  lines.push('import net.minecraft.world.item.ArmorMaterials;')
  lines.push('import net.minecraft.world.item.Item;')
  lines.push('')
  lines.push('public final class ModFeatures {')
  lines.push('\tprivate ModFeatures() {}')
  lines.push('\tpublic static void register() {')
  for (const it of items) {
    emitItemBlock(lines, spec.modId, javaRelease, it)
  }
  for (const ar of armors) {
    emitArmorBlock(lines, spec.modId, javaRelease, ar)
  }
  lines.push('\t}')
  lines.push('}')
  return lines.join('\n') + '\n'
}

function emitItemBlock(
  lines: string[],
  modId: string,
  javaRelease: number,
  it: SimpleItemFeature,
): void {
  const varName = `id_${it.itemId}`
  const ns = JSON.stringify(modId)
  const path = JSON.stringify(it.itemId)
  const locInit = resourceLocationInit(javaRelease, ns, path)
  lines.push('\t\t{')
  lines.push(`\t\t\tResourceLocation ${varName} = ${locInit};`)
  lines.push(
    `\t\t\tRegistry.register(BuiltInRegistries.ITEM, ${varName}, new Item(new Item.Properties()));`,
  )
  lines.push(
    `\t\t\tBenkkuMod.LOGGER.info("Registered item {} ({})", ${varName}, ${JSON.stringify(it.displayName)});`,
  )
  lines.push('\t\t}')
}

function emitArmorBlock(
  lines: string[],
  modId: string,
  javaRelease: number,
  ar: SimpleArmorFeature,
): void {
  const varName = `id_${ar.armorId}`
  const ns = JSON.stringify(modId)
  const path = JSON.stringify(ar.armorId)
  const locInit = resourceLocationInit(javaRelease, ns, path)
  const armorType = armorTypeExpr(ar.slot)
  lines.push('\t\t{')
  lines.push(`\t\t\tResourceLocation ${varName} = ${locInit};`)
  lines.push(
    `\t\t\tRegistry.register(BuiltInRegistries.ITEM, ${varName}, new ArmorItem(ArmorMaterials.LEATHER, ${armorType}, new Item.Properties()));`,
  )
  lines.push(
    `\t\t\tBenkkuMod.LOGGER.info("Registered armor {} ({})", ${varName}, ${JSON.stringify(ar.displayName)});`,
  )
  lines.push('\t\t}')
}

function armorTypeExpr(slot: SimpleArmorFeature['slot']): string {
  switch (slot) {
    case 'helmet':
      return 'ArmorItem.Type.HELMET'
    case 'chestplate':
      return 'ArmorItem.Type.CHESTPLATE'
    case 'leggings':
      return 'ArmorItem.Type.LEGGINGS'
    case 'boots':
      return 'ArmorItem.Type.BOOTS'
    default: {
      const _x: never = slot
      return _x
    }
  }
}

function resourceLocationInit(javaRelease: number, nsLiteral: string, pathLiteral: string): string {
  if (javaRelease >= 21) {
    return `ResourceLocation.fromNamespaceAndPath(${nsLiteral}, ${pathLiteral})`
  }
  return `new ResourceLocation(${nsLiteral}, ${pathLiteral})`
}
