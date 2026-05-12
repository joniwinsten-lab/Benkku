import type { ModSpec } from './modspec.js'

/**
 * Generoi ModFeatures.java — pohja käyttää `loom.officialMojangMappings()`,
 * joten nimet vastaavat Mojang-mappeja (ResourceLocation, BuiltInRegistries, …).
 */
export function renderModFeaturesJava(spec: ModSpec, javaRelease: number): string {
  const simple = (spec.features ?? []).filter((f) => f.type === 'simple_item')
  const lines: string[] = []
  lines.push('package fi.benkku.mod;')
  lines.push('')
  lines.push('import net.minecraft.core.Registry;')
  lines.push('import net.minecraft.core.registries.BuiltInRegistries;')
  lines.push('import net.minecraft.resources.ResourceLocation;')
  lines.push('import net.minecraft.world.item.Item;')
  lines.push('')
  lines.push('public final class ModFeatures {')
  lines.push('\tprivate ModFeatures() {}')
  lines.push('\tpublic static void register() {')
  for (const it of simple) {
    const varName = `id_${it.itemId}`
    const ns = JSON.stringify(spec.modId)
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
  lines.push('\t}')
  lines.push('}')
  return lines.join('\n') + '\n'
}

function resourceLocationInit(javaRelease: number, nsLiteral: string, pathLiteral: string): string {
  if (javaRelease >= 21) {
    return `ResourceLocation.fromNamespaceAndPath(${nsLiteral}, ${pathLiteral})`
  }
  return `new ResourceLocation(${nsLiteral}, ${pathLiteral})`
}
