/**
 * Fabric + Loom -yhdistelmät (Fabric example mod -haarojen gradle.properties).
 * Java-käännös: 1.20.x → release 17, 1.21.x → 21 (--release ajetaan JDK 21:llä).
 */
export const FABRIC_VERSION_PROFILES = {
  '1.21.11': {
    minecraft: '1.21.11',
    loom: '1.16-SNAPSHOT',
    fabricApi: '0.140.2+1.21.11',
    minecraftDep: '~1.21.11',
    javaDep: '>=21',
    javaRelease: 21,
    fabricApiModJsonDep: '>=0.140.0',
    /** ArmorMaterial + ArmorItem (vanha) poistui; käytä ArmorType + Item#humanoidArmor + equipment-JSON. */
    humanoidArmorApi: true,
    /** Mojang 1.21.11+: luokka ResourceLocation → Identifier (official mappings). */
    mojangResourceId: 'identifier',
  },
  '1.21.1': {
    minecraft: '1.21.1',
    loom: '1.16-SNAPSHOT',
    fabricApi: '0.116.11+1.21.1',
    minecraftDep: '~1.21.1',
    javaDep: '>=21',
    javaRelease: 21,
    fabricApiModJsonDep: '>=0.116.0',
    humanoidArmorApi: false,
    mojangResourceId: 'resource_location',
  },
  '1.21': {
    minecraft: '1.21',
    loom: '1.16-SNAPSHOT',
    fabricApi: '0.102.0+1.21',
    minecraftDep: '~1.21',
    javaDep: '>=21',
    javaRelease: 21,
    fabricApiModJsonDep: '>=0.102.0',
    humanoidArmorApi: false,
    mojangResourceId: 'resource_location',
  },
  '1.20.4': {
    minecraft: '1.20.4',
    loom: '1.16-SNAPSHOT',
    fabricApi: '0.97.3+1.20.4',
    minecraftDep: '~1.20.4',
    javaDep: '>=17',
    javaRelease: 17,
    fabricApiModJsonDep: '>=0.97.0',
    humanoidArmorApi: false,
    mojangResourceId: 'resource_location',
  },
  '1.20.1': {
    minecraft: '1.20.1',
    loom: '1.16-SNAPSHOT',
    fabricApi: '0.92.8+1.20.1',
    minecraftDep: '~1.20.1',
    javaDep: '>=17',
    javaRelease: 17,
    fabricApiModJsonDep: '>=0.92.0',
    humanoidArmorApi: false,
    mojangResourceId: 'resource_location',
  },
} as const

export type SupportedFabricMc = keyof typeof FABRIC_VERSION_PROFILES

export const SUPPORTED_MINECRAFT_VERSIONS = Object.keys(
  FABRIC_VERSION_PROFILES,
) as SupportedFabricMc[]

export function getFabricProfile(
  mc: string,
): (typeof FABRIC_VERSION_PROFILES)[SupportedFabricMc] | null {
  if (mc in FABRIC_VERSION_PROFILES) {
    return FABRIC_VERSION_PROFILES[mc as SupportedFabricMc]
  }
  return null
}
