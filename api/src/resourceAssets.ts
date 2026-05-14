import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Jimp } from 'jimp'
import { getFabricProfile } from './fabricVersions.js'
import type { ModSpec, SimpleArmorFeature, SimpleItemFeature } from './modspec.js'

function rgbFromTintOrHash(id: string, tintHex?: string): { r: number; g: number; b: number } {
  if (tintHex) {
    const h = tintHex.replace(/^#/, '')
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      }
    }
  }
  let x = 2166136261
  for (let i = 0; i < id.length; i++) {
    x ^= id.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return { r: (x >>> 16) & 255, g: (x >>> 8) & 255, b: x & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => (n & 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Tavara-inventaario / kädessä: 16×16. */
async function writeSolidPng16(path: string, r: number, g: number, b: number): Promise<void> {
  mkdirSync(dirname(path), { recursive: true })
  const img = new Jimp({ width: 16, height: 16, color: rgbToHex(r, g, b) })
  await img.write(path as `${string}.png`)
}

/**
 * Pelaajan / humanoidin varuste-UV vaatii saman kokoluokan kuin vanilja (esim. chainmail.png 64×32).
 * 16×16 täyttää väärät texelit → hahmolla näkyy usein musta tai läpinäkyvä.
 */
async function writeSolidPngEquipmentHumanoid(
  path: string,
  r: number,
  g: number,
  b: number,
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true })
  const img = new Jimp({ width: 64, height: 32, color: rgbToHex(r, g, b) })
  await img.write(path as `${string}.png`)
}

function writeItemModelJson(path: string, modId: string, texturePath: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const body = {
    parent: 'minecraft:item/generated',
    textures: {
      layer0: `${modId}:item/${texturePath}`,
    },
  }
  writeFileSync(path, JSON.stringify(body, null, '\t') + '\n', 'utf8')
}

/** 1.20.x leather-tyyppiset kestot per slot (lähellä vaniljaa). */
function vanillaLikeDurability(slot: SimpleArmorFeature['slot']): number {
  switch (slot) {
    case 'helmet':
      return 55
    case 'chestplate':
      return 80
    case 'leggings':
      return 75
    case 'boots':
      return 65
    default: {
      const _e: never = slot
      return _e
    }
  }
}

function writeEquipmentModelJson(path: string, modId: string, assetName: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const body = {
    layers: {
      humanoid: [{ texture: `${modId}:${assetName}` }],
      humanoid_leggings: [{ texture: `${modId}:${assetName}` }],
    },
  }
  writeFileSync(path, JSON.stringify(body, null, '\t') + '\n', 'utf8')
}

/** 1.21.2+ — client item JSON linkittää item-tunnisteen item-malliin (Fabric 1.21.11 -ohje). */
function writeClientItemJson(path: string, modId: string, itemId: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const body = {
    model: {
      type: 'minecraft:model',
      model: `${modId}:item/${itemId}`,
    },
  }
  writeFileSync(path, JSON.stringify(body, null, '\t') + '\n', 'utf8')
}

export async function writeModResources(workDir: string, spec: ModSpec): Promise<void> {
  const modId = spec.modId
  const profile = getFabricProfile(spec.minecraftVersion)
  const humanoidArmorApi = profile?.humanoidArmorApi === true
  /** MC 1.21.11 + Fabric: items/*.json suositeltu kaikille rekisteröidyille esineille. */
  const writeClientItems = spec.minecraftVersion === '1.21.11'
  const assets = join(workDir, 'src/main/resources/assets', modId)
  const feats = spec.features ?? []

  const langEn: Record<string, string> = {}
  const langFi: Record<string, string> = {}

  for (const f of feats) {
    if (f.type === 'simple_item') {
      const { r, g, b } = rgbFromTintOrHash(f.itemId, f.tintHex)
      const png = join(assets, 'textures/item', `${f.itemId}.png`)
      await writeSolidPng16(png, r, g, b)
      writeItemModelJson(join(assets, 'models/item', `${f.itemId}.json`), modId, f.itemId)
      if (writeClientItems) {
        writeClientItemJson(join(assets, 'items', `${f.itemId}.json`), modId, f.itemId)
      }
      langEn[`item.${modId}.${f.itemId}`] = f.displayName
      langFi[`item.${modId}.${f.itemId}`] = f.displayName
    } else {
      const { r, g, b } = rgbFromTintOrHash(f.armorId, f.tintHex)
      const r2 = Math.min(255, r + 28)
      const g2 = Math.min(255, g + 28)
      const b2 = Math.min(255, b + 28)
      const invPng = join(assets, 'textures/item', `${f.armorId}.png`)
      await writeSolidPng16(invPng, r, g, b)
      writeItemModelJson(join(assets, 'models/item', `${f.armorId}.json`), modId, f.armorId)
      if (writeClientItems) {
        writeClientItemJson(join(assets, 'items', `${f.armorId}.json`), modId, f.armorId)
      }
      if (humanoidArmorApi) {
        const eqHumanoid = join(assets, 'textures/entity/equipment/humanoid', `${f.armorId}.png`)
        const eqLegs = join(assets, 'textures/entity/equipment/humanoid_leggings', `${f.armorId}.png`)
        await writeSolidPngEquipmentHumanoid(eqHumanoid, r, g, b)
        await writeSolidPngEquipmentHumanoid(eqLegs, r2, g2, b2)
        writeEquipmentModelJson(join(assets, 'equipment', `${f.armorId}.json`), modId, f.armorId)
      } else {
        const layer1 = join(assets, 'textures/models/armor', `${f.armorId}_layer_1.png`)
        const layer2 = join(assets, 'textures/models/armor', `${f.armorId}_layer_2.png`)
        await writeSolidPng16(layer1, r, g, b)
        await writeSolidPng16(layer2, r2, g2, b2)
      }
      langEn[`item.${modId}.${f.armorId}`] = f.displayName
      langFi[`item.${modId}.${f.armorId}`] = f.displayName
    }
  }

  if (Object.keys(langEn).length > 0) {
    const langDir = join(assets, 'lang')
    mkdirSync(langDir, { recursive: true })
    writeFileSync(join(langDir, 'en_us.json'), JSON.stringify(langEn, null, '\t') + '\n', 'utf8')
    writeFileSync(join(langDir, 'fi_fi.json'), JSON.stringify(langFi, null, '\t') + '\n', 'utf8')
  }
}

export { vanillaLikeDurability }
