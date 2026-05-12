import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import { SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'
import { ModSpecSchema, validateModSpecForBuild } from './modspec.js'
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

app.get('/v1/build/:id/jar', (c) => {
  const id = c.req.param('id')
  const j = jobs.get(id)
  if (!j) return c.json({ error: 'Tuntematon työ' }, 404)
  if (j.status !== 'done' || !j.jarBytes || !j.fileName) {
    return c.json({ error: 'Ei valmis', status: j.status }, 409)
  }

  const safeName = j.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return new Response(new Uint8Array(j.jarBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/java-archive',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  })
})

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`benkku-api listening on http://127.0.0.1:${info.port}`)
})
