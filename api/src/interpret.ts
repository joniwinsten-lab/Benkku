import { z } from 'zod'
import { SUPPORTED_MINECRAFT_VERSIONS } from './fabricVersions.js'
import { ModFeatureSchema, ModSpecSchema } from './modspec.js'

const InterpretRequestSchema = z.object({
  wishText: z.string().trim().min(1).max(2000),
  loader: z.enum(['fabric', 'forge']),
  minecraftVersion: z.string().min(1).max(32),
  modIdHint: z.string().max(64).optional(),
  displayNameHint: z.string().max(64).optional(),
})

export type InterpretRequest = z.infer<typeof InterpretRequestSchema>

const InterpretDraftSchema = z.object({
  loader: z.enum(['fabric', 'forge']),
  minecraftVersion: z.string().min(1).max(32),
  modId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  displayName: z.string().trim().min(1).max(64),
  wishText: z.string().max(2000),
  features: z.array(ModFeatureSchema).max(8).default([]),
  wishSummary: z.string().max(500).optional(),
  warnings: z.array(z.string()).max(20).optional(),
})

export type InterpretDraft = z.infer<typeof InterpretDraftSchema>

export function parseInterpretRequest(body: unknown):
  | { ok: true; data: InterpretRequest }
  | { ok: false; error: z.ZodError } {
  const r = InterpretRequestSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error }
  return { ok: true, data: r.data }
}

export async function interpretToDraft(req: InterpretRequest): Promise<InterpretDraft> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY puuttuu palvelimelta.')
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')

  const sys = `Olet Benkku Minecraft Java -modigeneraattorin apuri. Palauta yksi JSON-objekti (ei markdownia, ei selitystä).
Pakolliset avaimet: loader, minecraftVersion, modId, displayName, wishText, features.
Valinnaiset: wishSummary (string), warnings (string[]).

Säännöt:
- loader: käytä aina "fabric" ellei käyttäjä nimenomaan pyydä forgea.
- minecraftVersion: täsmälleen yksi näistä: ${SUPPORTED_MINECRAFT_VERSIONS.join(', ')} — oletus 1.21.1 jos epäselvä.
- modId: vain pienet kirjaimet, numerot ja alaviiva, alkaa kirjaimella.
- displayName: lyhyt näyttönimi suomeksi tai englanniksi.
- wishText: lyhennä käyttäjän toive max 2000 merkkiin; säilytä idea.
- features: jos käyttäjä haluaa uuden esineen, lisää { "type":"simple_item", "itemId": "...", "displayName":"..." }. itemId eri kuin modId. Max 3 esinettä. Muuten [].
- wishSummary: 1-2 lausetta suomeksi mitä ymmärsit.
- warnings: epäselvät kohdat (tyhjä taulukko jos ei huomioitavaa).`

  const user = [
    `Käyttäjän toive:\n${req.wishText}`,
    `loader=${req.loader}, minecraftVersion=${req.minecraftVersion}`,
    req.modIdHint ? `modId-vihje: ${req.modIdHint}` : '',
    req.displayNameHint ? `nimi-vihje: ${req.displayNameHint}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 400)}`)
  }

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = raw.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI: tyhjä vastaus')
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(content)
  } catch {
    throw new Error('OpenAI: JSON-parse epäonnistui')
  }

  const merged = InterpretDraftSchema.safeParse(parsedJson)
  if (!merged.success) {
    throw new Error(`Luonnos ei läpäise tarkistusta: ${merged.error.message}`)
  }

  const draft = merged.data
  const specCheck = ModSpecSchema.safeParse({
    loader: draft.loader,
    minecraftVersion: draft.minecraftVersion,
    modId: draft.modId,
    displayName: draft.displayName,
    wishText: draft.wishText,
    features: draft.features,
  })
  if (!specCheck.success) {
    throw new Error(`ModSpec ei kelpaa: ${specCheck.error.message}`)
  }

  return { ...draft, features: draft.features ?? [] }
}
