import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import { SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'
import { ModSpecSchema, validateModSpecForBuild } from './modspec.js'
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
  c.json({ ok: true, fabricMinecraft: SUPPORTED_MINECRAFT_VERSIONS }),
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

app.get('/v1/build/:id', (c) => {
  const id = c.req.param('id')
  const j = jobs.get(id)
  if (!j) return c.json({ error: 'Tuntematon työ' }, 404)

  return c.json({
    id: j.id,
    status: j.status,
    error: j.error ?? null,
    logTail: j.log ? j.log.slice(-8000) : null,
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
