import type { ModSpec, SimpleArmorFeature, SimpleItemFeature } from './modspec.js'
import { vanillaLikeDurability } from './resourceAssets.js'

/**
 * Generoi ModFeatures.java — `loom.officialMojangMappings()`.
 * 1.21.11+: ArmorType + Item#humanoidArmor + equipment-resurssit (humanoidArmorApi).
 * 1.21.1 / 1.21 (Java 21): ArmorMaterial-tallenne + BuiltInRegistries.ARMOR_MATERIAL + ArmorItem.
 * 1.20.x: ArmorMaterial-rajapinta-anonyymi + ArmorItem.
 */
export function renderModFeaturesJava(
  spec: ModSpec,
  javaRelease: number,
  humanoidArmorApi: boolean,
): string {
  const feats = spec.features ?? []
  const items = feats.filter((f): f is SimpleItemFeature => f.type === 'simple_item')
  const armors = feats.filter((f): f is SimpleArmorFeature => f.type === 'simple_armor')

  const useHumanoidArmor = humanoidArmorApi && javaRelease >= 21 && armors.length > 0
  const useLegacy21Armor = !useHumanoidArmor && javaRelease >= 21 && armors.length > 0
  const useLegacy20Armor = javaRelease < 21 && armors.length > 0

  const lines: string[] = []
  lines.push('package fi.benkku.mod;')
  lines.push('')

  lines.push('import net.minecraft.core.Registry;')
  lines.push('import net.minecraft.core.registries.BuiltInRegistries;')
  lines.push('import net.minecraft.resources.ResourceLocation;')
  lines.push('import net.minecraft.world.item.Item;')

  if (useHumanoidArmor) {
    lines.push('import java.util.Map;')
    lines.push('import net.minecraft.resources.ResourceKey;')
    lines.push('import net.minecraft.sounds.SoundEvents;')
    lines.push('import net.minecraft.tags.TagKey;')
    lines.push('import net.minecraft.world.item.equipment.ArmorMaterial;')
    lines.push('import net.minecraft.world.item.equipment.ArmorType;')
    lines.push('import net.minecraft.world.item.equipment.EquipmentAsset;')
    lines.push('import net.minecraft.world.item.equipment.EquipmentAssets;')
  } else if (useLegacy21Armor) {
    lines.push('import java.util.EnumMap;')
    lines.push('import java.util.List;')
    lines.push('import net.minecraft.core.Holder;')
    lines.push('import net.minecraft.sounds.SoundEvent;')
    lines.push('import net.minecraft.sounds.SoundEvents;')
    lines.push('import net.minecraft.world.item.ArmorItem;')
    lines.push('import net.minecraft.world.item.ArmorMaterial;')
    lines.push('import net.minecraft.world.item.crafting.Ingredient;')
  } else if (useLegacy20Armor) {
    lines.push('import net.minecraft.sounds.SoundEvent;')
    lines.push('import net.minecraft.sounds.SoundEvents;')
    lines.push('import net.minecraft.world.item.ArmorItem;')
    lines.push('import net.minecraft.world.item.ArmorMaterial;')
    lines.push('import net.minecraft.world.item.crafting.Ingredient;')
  }

  lines.push('')
  lines.push('public final class ModFeatures {')
  lines.push('\tprivate ModFeatures() {}')
  lines.push('\tpublic static void register() {')
  for (const it of items) {
    emitItemBlock(lines, spec.modId, javaRelease, it)
  }
  for (const ar of armors) {
    if (useHumanoidArmor) {
      emitArmorBlockHumanoid(lines, spec.modId, ar)
    } else if (javaRelease >= 21) {
      emitArmorBlock21(lines, spec.modId, ar)
    } else {
      emitArmorBlock20(lines, spec.modId, ar)
    }
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

/** Minecraft 1.21.11+ — ks. Fabric docs „Custom Armor 1.21.11”. */
function emitArmorBlockHumanoid(lines: string[], modId: string, ar: SimpleArmorFeature): void {
  const itemRl = resourceLocationExpr(21, JSON.stringify(modId), JSON.stringify(ar.armorId))
  const armorType = armorTypeHumanoid(ar.slot)
  const dura = vanillaLikeDurability(ar.slot)
  const repairTagPath = `${ar.armorId}_repair`
  const repairTagLit = JSON.stringify(repairTagPath)
  const modLit = JSON.stringify(modId)
  const assetRl = resourceLocationExpr(21, modLit, JSON.stringify(ar.armorId))

  lines.push('\t\t{')
  lines.push(
    `\t\t\tResourceKey<EquipmentAsset> asset_${ar.armorId} = ResourceKey.create(EquipmentAssets.ROOT_ID, ${assetRl});`,
  )
  lines.push(
    `\t\t\tTagKey<Item> repair_${ar.armorId} = TagKey.create(BuiltInRegistries.ITEM.key(), ResourceLocation.fromNamespaceAndPath(${modLit}, ${repairTagLit}));`,
  )
  lines.push(
    `\t\t\tArmorMaterial mat_${ar.armorId} = new ArmorMaterial(15, Map.of(ArmorType.BOOTS, Integer.valueOf(1), ArmorType.LEGGINGS, Integer.valueOf(2), ArmorType.CHESTPLATE, Integer.valueOf(3), ArmorType.HELMET, Integer.valueOf(1)), 15, SoundEvents.ARMOR_EQUIP_LEATHER, 0.0F, 0.0F, repair_${ar.armorId}, asset_${ar.armorId});`,
  )
  lines.push(`\t\t\tResourceLocation item_${ar.armorId} = ${itemRl};`)
  lines.push(
    `\t\t\tRegistry.register(BuiltInRegistries.ITEM, item_${ar.armorId}, new Item(new Item.Properties().humanoidArmor(mat_${ar.armorId}, ${armorType}).durability(${dura})));`,
  )
  lines.push(
    `\t\t\tBenkkuMod.LOGGER.info("Registered armor {} ({})", item_${ar.armorId}, ${JSON.stringify(ar.displayName)});`,
  )
  lines.push('\t\t}')
}

function emitArmorBlock21(lines: string[], modId: string, ar: SimpleArmorFeature): void {
  const matKey = `${ar.armorId}_material`
  const matRl = resourceLocationExpr(21, JSON.stringify(modId), JSON.stringify(matKey))
  const layerRl = resourceLocationExpr(21, JSON.stringify(modId), JSON.stringify(ar.armorId))
  const itemRl = resourceLocationExpr(21, JSON.stringify(modId), JSON.stringify(ar.armorId))
  const typeName = armorTypeSimpleName(ar.slot)

  lines.push('\t\t{')
  lines.push(`\t\t\tEnumMap<ArmorItem.Type, Integer> def_${ar.armorId} = new EnumMap<>(ArmorItem.Type.class);`)
  lines.push(`\t\t\tdef_${ar.armorId}.put(ArmorItem.Type.BOOTS, Integer.valueOf(1));`)
  lines.push(`\t\t\tdef_${ar.armorId}.put(ArmorItem.Type.LEGGINGS, Integer.valueOf(2));`)
  lines.push(`\t\t\tdef_${ar.armorId}.put(ArmorItem.Type.CHESTPLATE, Integer.valueOf(3));`)
  lines.push(`\t\t\tdef_${ar.armorId}.put(ArmorItem.Type.HELMET, Integer.valueOf(1));`)
  lines.push(`\t\t\tdef_${ar.armorId}.put(ArmorItem.Type.BODY, Integer.valueOf(3));`)
  lines.push(
    `\t\t\tArmorMaterial mat_${ar.armorId} = new ArmorMaterial(def_${ar.armorId}, 15, SoundEvents.ARMOR_EQUIP_LEATHER, () -> Ingredient.EMPTY, List.of(new ArmorMaterial.Layer(${layerRl}, "", false)), 0.0F, 0.0F);`,
  )
  lines.push(
    `\t\t\tHolder<ArmorMaterial> h_${ar.armorId} = Registry.registerForHolder(BuiltInRegistries.ARMOR_MATERIAL, ${matRl}, mat_${ar.armorId});`,
  )
  lines.push(
    `\t\t\tRegistry.register(BuiltInRegistries.ITEM, ${itemRl}, new ArmorItem(h_${ar.armorId}, ArmorItem.Type.${typeName}, new Item.Properties().durability(ArmorItem.Type.${typeName}.getDurability(15))));`,
  )
  lines.push(
    `\t\t\tBenkkuMod.LOGGER.info("Registered armor {} ({})", ${itemRl}, ${JSON.stringify(ar.displayName)});`,
  )
  lines.push('\t\t}')
}

function armorTypeHumanoid(slot: SimpleArmorFeature['slot']): string {
  switch (slot) {
    case 'helmet':
      return 'ArmorType.HELMET'
    case 'chestplate':
      return 'ArmorType.CHESTPLATE'
    case 'leggings':
      return 'ArmorType.LEGGINGS'
    case 'boots':
      return 'ArmorType.BOOTS'
    default: {
      const _x: never = slot
      return _x
    }
  }
}

function armorTypeSimpleName(slot: SimpleArmorFeature['slot']): string {
  switch (slot) {
    case 'helmet':
      return 'HELMET'
    case 'chestplate':
      return 'CHESTPLATE'
    case 'leggings':
      return 'LEGGINGS'
    case 'boots':
      return 'BOOTS'
    default: {
      const _x: never = slot
      return _x
    }
  }
}

function emitArmorBlock20(lines: string[], modId: string, ar: SimpleArmorFeature): void {
  const typeName = armorTypeSimpleName(ar.slot)
  const dura = vanillaLikeDurability(ar.slot)
  const nameLit = JSON.stringify(ar.displayName)
  const armorIdLit = JSON.stringify(ar.armorId)

  lines.push('\t\t{')
  lines.push(
    `\t\t\tResourceLocation id_${ar.armorId} = ${resourceLocationExpr(17, JSON.stringify(modId), JSON.stringify(ar.armorId))};`,
  )
  lines.push(
    `\t\t\tRegistry.register(BuiltInRegistries.ITEM, id_${ar.armorId}, new ArmorItem(new ArmorMaterial() {`,
  )
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic int getDurabilityForType(ArmorItem.Type t) {')
  lines.push(`\t\t\t\t\tif (t == ArmorItem.Type.${typeName}) return ${dura};`)
  lines.push('\t\t\t\t\treturn 1;')
  lines.push('\t\t\t\t}')
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic int getDefenseForType(ArmorItem.Type t) {')
  lines.push(defenseSwitchLines(ar.slot, '\t\t\t\t\t'))
  lines.push('\t\t\t\t}')
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic int getEnchantmentValue() { return 15; }')
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic SoundEvent getEquipSound() { return SoundEvents.ARMOR_EQUIP_LEATHER; }')
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic Ingredient getRepairIngredient() { return Ingredient.EMPTY; }')
  lines.push('\t\t\t\t@Override')
  lines.push(`\t\t\t\tpublic String getName() { return ${armorIdLit}; }`)
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic float getToughness() { return 0.0F; }')
  lines.push('\t\t\t\t@Override')
  lines.push('\t\t\t\tpublic float getKnockbackResistance() { return 0.0F; }')
  lines.push(
    `\t\t\t}, ArmorItem.Type.${typeName}, new Item.Properties().durability(${dura})));`,
  )
  lines.push(`\t\t\tBenkkuMod.LOGGER.info("Registered armor {} ({})", id_${ar.armorId}, ${nameLit});`)
  lines.push('\t\t}')
}

function defenseSwitchLines(slot: SimpleArmorFeature['slot'], indent: string): string {
  const lines: string[] = []
  const pairs: Array<{ t: string; v: number }> = [
    { t: 'HELMET', v: slot === 'helmet' ? 1 : 0 },
    { t: 'CHESTPLATE', v: slot === 'chestplate' ? 3 : 0 },
    { t: 'LEGGINGS', v: slot === 'leggings' ? 2 : 0 },
    { t: 'BOOTS', v: slot === 'boots' ? 1 : 0 },
  ]
  for (const p of pairs) {
    lines.push(`${indent}if (t == ArmorItem.Type.${p.t}) return ${p.v};`)
  }
  lines.push(`${indent}return 0;`)
  return lines.join('\n')
}

function resourceLocationExpr(javaRelease: number, nsLiteral: string, pathLiteral: string): string {
  if (javaRelease >= 21) {
    return `ResourceLocation.fromNamespaceAndPath(${nsLiteral}, ${pathLiteral})`
  }
  return `new ResourceLocation(${nsLiteral}, ${pathLiteral})`
}

function resourceLocationInit(javaRelease: number, nsLiteral: string, pathLiteral: string): string {
  return resourceLocationExpr(javaRelease, nsLiteral, pathLiteral)
}
