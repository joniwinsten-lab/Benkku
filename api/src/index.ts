import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { zipSync } from 'fflate'
import { randomUUID } from 'node:crypto'
import { getResourcePackFormat, SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'
import { FABRIC_LOADER_VERSIONS, ModSpecSchema, validateModSpecForBuild } from './modspec.js'
import { interpretToDraft, parseInterpretRequest } from './interpret.js'
import { runFabricBuild } from './worker.js'

type JobStatus = 'queued' | 'running' | 'done' | 'error'

type Job = {
  id: string
  status: JobStatus
  createdAt: number
  spec?: unknown
  log?: string
  error?: string
  jarBytes?: Buffer
  fileName?: string
}

const jobs = new Map<string, Job>()
let queue: Promise<void> = Promise.resolve()

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task).catch(() => {})
}

/** Ladattavan .jar-tiedoston nimi: mod id + MC-versio + lyhyt näyttönimi (Gradle-tiedoston nimi varalla). */
function jarAttachmentFilename(j: Job): string {
  const gradleSafe = (j.fileName ?? 'mod.jar').replace(/[^a-zA-Z0-9._-]/g, '_')
  const specParsed =
    j.spec != null && typeof j.spec === 'object' ? ModSpecSchema.safeParse(j.spec) : null
  if (!specParsed?.success) return gradleSafe

  const { modId, displayName, minecraftVersion } = specParsed.data
  const title = displayName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
  const core = [modId, minecraftVersion, title].filter(Boolean).join('_')
  const withJar = `${core}.jar`.replace(/[^a-zA-Z0-9._-]/g, '_')
  return withJar.length >= 6 ? withJar : gradleSafe
}

function zipAttachmentFilename(jarName: string): string {
  const base = jarName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return base.toLowerCase().endsWith('.jar') ? `${base.slice(0, -4)}.zip` : `${base}.zip`
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

/**
 * Zip: mods/*.jar + valinnainen resourcepacks/Benkku_* (tyhjä merkkipakka näkyy listalla).
 * Resurssipaketti ei sisällä modilogiikkaa — Fabric-modi toimii vain .jar-tiedostosta mods-kansiossa.
 */
function buildBenkkuDownloadZip(j: Job, jarName: string, jarU8: Uint8Array): Uint8Array {
  const specParsed =
    j.spec != null && typeof j.spec === 'object' ? ModSpecSchema.safeParse(j.spec) : null
  const modId = specParsed?.success === true ? specParsed.data.modId : 'benkku_mod'
  const displayName =
    specParsed?.success === true ? specParsed.data.displayName.trim() || modId : 'Benkku modi'
  const mc = specParsed?.success === true ? specParsed.data.minecraftVersion : '1.21.11'
  const packFmt = getResourcePackFormat(mc)
  const jobShort = j.id.replace(/-/g, '').slice(0, 8)
  const rpDir = `resourcepacks/Benkku_${modId}_${jobShort}`

  const packMeta = {
    pack: {
      pack_format: packFmt,
      description: `Benkku: ${displayName.slice(0, 64)} — asennusmerkki (modi: mods/${jarName})`,
    },
  }

  const readme = [
    'Benkku-lataus',
    '============',
    '',
    'MODI (pakollinen)',
    '-----------------',
    `Tiedosto mods/${jarName} on Fabric-modi. Kopioi se profiilin mods-kansioon, esim.`,
    '  Windows: %AppData%\\.minecraft\\mods\\',
    '  tai Prism Launcher → instanssi → Minecraft-kansio → mods',
    '',
    'RESURSSIPAKETTI (vapaaehtoinen merkki)',
    '--------------------------------------',
    `Kansio ${rpDir}/ sisältää vain pack.mcmeta (ei tekstuureja).`,
    `Minecraft ${mc}: pack_format=${packFmt}.`,
    '',
    'Kun kopioit kansion profiilin resourcepacks-kansioon ja otat paketin käyttöön',
    '(Asetukset → Resurssipaketit), näet listalla että tämä Benkku-generaatio on asennettu.',
    'Paketti ei korvaa modia eikä muuta pelin logiikkaa — modi vaatii silti .jar:n mods-kansiossa.',
    '',
    `Työn tunniste: ${j.id}`,
    '',
    'Vinkki: voit purkaa koko zipin suoraan profiilikansion juureen niin, että',
    'mods- ja resourcepacks-kansiot päivittyvät kerralla (varmuuskopioi vanhat ensin).',
    '',
  ].join('\n')

  const entries: Record<string, Uint8Array> = {
    [`mods/${jarName}`]: jarU8,
    [`${rpDir}/pack.mcmeta`]: utf8(JSON.stringify(packMeta, null, '\t') + '\n'),
    'Benkku_LUEMINUT.txt': utf8(readme),
  }

  return zipSync(entries, { level: 6 })
}

const app = new Hono()

const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (allowedOrigins.length === 0) return origin || '*'
      if (!origin) return '*'
      if (allowedOrigins.includes(origin)) return origin
      return undefined
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    exposeHeaders: ['Content-Disposition'],
  }),
)

app.get('/health', (c) =>
  c.json({
    ok: true,
    fabricMinecraft: SUPPORTED_MINECRAFT_VERSIONS,
    fabricLoaders: [...FABRIC_LOADER_VERSIONS],
    fabricLoaderDefault: '0.18.3',
    interpretAvailable: Boolean(process.env.OPENAI_API_KEY),
  }),
)

app.post('/v1/build', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Virheellinen JSON' }, 400)
  }

  const parsed = ModSpecSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Virheellinen pyyntö', details: parsed.error.flatten() }, 400)
  }

  const spec = parsed.data
  const unsupported = validateModSpecForBuild(spec)
  if (unsupported) {
    return c.json({ error: unsupported }, 422)
  }

  const id = randomUUID()
  const job: Job = { id, status: 'queued', createdAt: Date.now(), spec }
  jobs.set(id, job)

  enqueue(async () => {
    const j = jobs.get(id)
    if (!j) return
    j.status = 'running'
    try {
      const { jarBytes, fileName, log } = await runFabricBuild(spec)
      j.jarBytes = jarBytes
      j.fileName = fileName
      j.log = log
      j.status = 'done'
    } catch (e) {
      j.status = 'error'
      j.error = e instanceof Error ? e.message : String(e)
      if (e && typeof e === 'object' && 'log' in e && typeof (e as { log?: string }).log === 'string') {
        j.log = (e as { log: string }).log
      }
    }
  })

  return c.json({ jobId: id }, 202)
})

app.post('/v1/interpret', async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    return c.json({ error: 'Tulkinta ei ole käytössä (OPENAI_API_KEY puuttuu).' }, 503)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Virheellinen JSON' }, 400)
  }

  const parsed = parseInterpretRequest(body)
  if (!parsed.ok) {
    return c.json({ error: 'Virheellinen pyyntö', details: parsed.error.flatten() }, 400)
  }

  try {
    const draft = await interpretToDraft(parsed.data)
    return c.json({ draft })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, 502)
  }
})

app.get('/v1/build/:id', (c) => {
  const id = c.req.param('id')
  const j = jobs.get(id)
  if (!j) return c.json({ error: 'Tuntematon työ' }, 404)

  const specParsed =
    j.spec != null && typeof j.spec === 'object' ? ModSpecSchema.safeParse(j.spec) : null
  const specFields =
    specParsed?.success === true
      ? {
          modId: specParsed.data.modId,
          displayName: specParsed.data.displayName,
          minecraftVersion: specParsed.data.minecraftVersion,
          loader: specParsed.data.loader,
          wishText: specParsed.data.wishText ?? null,
          features: specParsed.data.features ?? [],
          fabricLoaderVersion: specParsed.data.fabricLoaderVersion,
        }
      : null

  return c.json({
    id: j.id,
    status: j.status,
    error: j.error ?? null,
    logTail: j.log ? j.log.slice(-8000) : null,
    spec: specFields,
  })
})

/**
 * Zip: mods/*.jar + resourcepacks/Benkku_* (merkkipakka) + Benkku_LUEMINUT.txt.
 * Chrome: suora .jar usein varoittaa — zip helpottaa; pura profiiliin tai kopioi mods/ ja halutessa resourcepacks/.
 */
app.get('/v1/build/:id/zip', (c) => {
  const id = c.req.param('id')
  const j = jobs.get(id)
  if (!j) return c.json({ error: 'Tuntematon työ' }, 404)
  if (j.status !== 'done' || !j.jarBytes || !j.fileName) {
    return c.json({ error: 'Ei valmis', status: j.status }, 409)
  }

  const jarName = jarAttachmentFilename(j)
  const zipName = zipAttachmentFilename(jarName)
  const jarU8 = new Uint8Array(j.jarBytes)
  const zipped = buildBenkkuDownloadZip(j, jarName, jarU8)

  return new Response(Buffer.from(zipped), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
})

app.get('/v1/build/:id/jar', (c) => {
  const id = c.req.param('id')
  const j = jobs.get(id)
  if (!j) return c.json({ error: 'Tuntematon työ' }, 404)
  if (j.status !== 'done' || !j.jarBytes || !j.fileName) {
    return c.json({ error: 'Ei valmis', status: j.status }, 409)
  }

  const safeName = jarAttachmentFilename(j)
  return new Response(new Uint8Array(j.jarBytes), {
    status: 200,
    headers: {
      /** application/java-archive laukaisee usein Chromen varoituksen; octet-stream lieventää joskus. */
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  })
})

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`benkku-api listening on http://127.0.0.1:${info.port}`)
})
