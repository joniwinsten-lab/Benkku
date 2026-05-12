import { useCallback, useEffect, useMemo, useState } from 'react'

type Loader = 'fabric' | 'forge'

/** Fabric-generointi — pitää olla synkassa API:n `fabricVersions.ts` kanssa */
const MC_VERSIONS = ['1.21.1', '1.21', '1.20.4', '1.20.1'] as const

const SPLASHES = [
  'Koodi kuten kivi!',
  'Java Edition!',
  'Ei timantteja vielä!',
  'mods-kansio odottaa!',
  'Ruohikko kutittaa!',
]

function pickSplash() {
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)]
}

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const m = /filename="([^"]+)"/.exec(header)
  return m?.[1] ?? null
}

type SimpleItemFeature = { type: 'simple_item'; itemId: string; displayName: string }

type InterpretDraft = {
  loader: Loader
  minecraftVersion: string
  modId: string
  displayName: string
  wishText: string
  features: SimpleItemFeature[]
  wishSummary?: string
  warnings?: string[]
}

function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
  if (raw) {
    if (raw.startsWith('/')) {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${raw}`
      }
      return raw
    }
    return raw
  }
  if (typeof window !== 'undefined' && window.location?.hostname === '94.237.38.55') {
    return `${window.location.origin}/benkku-api`
  }
  return ''
}

export default function App() {
  const [splash] = useState(pickSplash)
  const [mcVersion, setMcVersion] = useState<(typeof MC_VERSIONS)[number]>('1.21.1')
  const [loader, setLoader] = useState<Loader>('fabric')
  const [modId, setModId] = useState('benkku_mod')
  const [displayName, setDisplayName] = useState('Benkun modi')
  const [wishText, setWishText] = useState('')

  const [simpleItemEnabled, setSimpleItemEnabled] = useState(false)
  const [itemId, setItemId] = useState('')
  const [itemDisplayName, setItemDisplayName] = useState('')

  const [interpretAvailable, setInterpretAvailable] = useState(false)
  const [interpretPhase, setInterpretPhase] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  )
  const [interpretDraft, setInterpretDraft] = useState<InterpretDraft | null>(null)
  const [interpretMessage, setInterpretMessage] = useState<string | null>(null)

  const [buildPhase, setBuildPhase] = useState<'idle' | 'queued' | 'running' | 'done' | 'error'>(
    'idle',
  )
  const [buildMessage, setBuildMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const modIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,63}$/.test(modId), [modId])
  const itemIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,40}$/.test(itemId), [itemId])
  const itemDisplayOk = useMemo(
    () => itemDisplayName.trim().length >= 1 && itemDisplayName.trim().length <= 64,
    [itemDisplayName],
  )

  const apiBase = useMemo(() => resolveApiBase(), [])

  useEffect(() => {
    if (!apiBase) return
    void fetch(`${apiBase}/health`)
      .then((r) => r.json())
      .then((h: { interpretAvailable?: boolean }) => setInterpretAvailable(!!h.interpretAvailable))
      .catch(() => setInterpretAvailable(false))
  }, [apiBase])

  const simpleItemFormOk = useMemo(() => {
    if (!simpleItemEnabled) return true
    if (!itemIdOk) return false
    if (itemId === modId) return false
    if (!itemDisplayOk) return false
    return true
  }, [simpleItemEnabled, itemIdOk, itemId, modId, itemDisplayOk])

  const canGenerate = useMemo(() => {
    if (!apiBase) return false
    if (!modIdOk) return false
    if (!simpleItemFormOk) return false
    if (loader !== 'fabric') return false
    if (buildPhase === 'queued' || buildPhase === 'running') return false
    return true
  }, [apiBase, modIdOk, simpleItemFormOk, loader, buildPhase])

  const pollJob = useCallback(
    async (id: string) => {
      const deadline = Date.now() + 25 * 60_000
      while (Date.now() < deadline) {
        const r = await fetch(`${apiBase}/v1/build/${id}`)
        if (!r.ok) {
          setBuildPhase('error')
          setBuildMessage(`Tilan luku epäonnistui (${r.status})`)
          return
        }
        const j = (await r.json()) as {
          status: string
          error?: string | null
          spec?: {
            wishText?: string | null
            features?: SimpleItemFeature[]
          } | null
        }
        if (j.status === 'done') {
          setBuildPhase('done')
          const w = j.spec?.wishText?.trim()
          setBuildMessage(
            w
              ? `Valmis! Lataa .jar alla. (toive tallessa: ${w.slice(0, 80)}${w.length > 80 ? '…' : ''})`
              : 'Valmis! Lataa .jar alla.',
          )
          return
        }
        if (j.status === 'error') {
          setBuildPhase('error')
          setBuildMessage(j.error ?? 'Generointi epäonnistui.')
          return
        }
        await new Promise((res) => setTimeout(res, 2000))
      }
      setBuildPhase('error')
      setBuildMessage('Aikakatkaisu: yritä uudelleen.')
    },
    [apiBase],
  )

  const applyInterpretDraft = useCallback((draft: InterpretDraft) => {
    if (MC_VERSIONS.includes(draft.minecraftVersion as (typeof MC_VERSIONS)[number])) {
      setMcVersion(draft.minecraftVersion as (typeof MC_VERSIONS)[number])
    }
    setLoader(draft.loader)
    setModId(draft.modId)
    setDisplayName(draft.displayName)
    setWishText(draft.wishText)
    const firstItem = draft.features.find((f) => f.type === 'simple_item')
    if (firstItem) {
      setSimpleItemEnabled(true)
      setItemId(firstItem.itemId)
      setItemDisplayName(firstItem.displayName)
    } else {
      setSimpleItemEnabled(false)
      setItemId('')
      setItemDisplayName('')
    }
    setInterpretMessage('Ehdotus yhdistetty lomakkeeseen.')
  }, [])

  const handleInterpret = async () => {
    setInterpretMessage(null)
    setInterpretDraft(null)
    if (!apiBase) {
      setInterpretPhase('error')
      setInterpretMessage('API-osoite puuttuu.')
      return
    }
    const w = wishText.trim()
    if (!w) {
      setInterpretPhase('error')
      setInterpretMessage('Kirjoita ensin toive tekstikenttään.')
      return
    }
    if (!interpretAvailable) {
      setInterpretPhase('error')
      setInterpretMessage('Tulkinta ei ole käytössä tällä palvelimella (OPENAI_API_KEY).')
      return
    }

    setInterpretPhase('loading')
    try {
      const r = await fetch(`${apiBase}/v1/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wishText: w,
          loader,
          minecraftVersion: mcVersion,
          modIdHint: modId,
          displayNameHint: displayName.trim(),
        }),
      })
      const data = (await r.json().catch(() => ({}))) as {
        draft?: InterpretDraft
        error?: string
      }
      if (!r.ok) {
        setInterpretPhase('error')
        setInterpretMessage(data.error ?? `Virhe ${r.status}`)
        return
      }
      if (!data.draft) {
        setInterpretPhase('error')
        setInterpretMessage('Palvelin ei palauttanut luonnosta.')
        return
      }
      setInterpretDraft(data.draft)
      setInterpretPhase('done')
      setInterpretMessage(null)
    } catch {
      setInterpretPhase('error')
      setInterpretMessage('Verkkovirhe — tarkista API.')
    }
  }

  const handleGenerate = async () => {
    setBuildMessage(null)
    setJobId(null)

    if (!apiBase) {
      setBuildPhase('error')
      setBuildMessage(
        'API-osoite puuttuu. Kehityksessä luo web/.env tiedosto: VITE_API_URL=http://127.0.0.1:8787',
      )
      return
    }
    if (!canGenerate) return

    setBuildPhase('queued')
    setBuildMessage('Jonossa…')

    try {
      const features: SimpleItemFeature[] | undefined =
        simpleItemEnabled && itemIdOk && itemId !== modId && itemDisplayOk
          ? [{ type: 'simple_item', itemId, displayName: itemDisplayName.trim() }]
          : undefined

      const r = await fetch(`${apiBase}/v1/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loader,
          minecraftVersion: mcVersion,
          modId,
          displayName: displayName.trim(),
          wishText: wishText.trim() || undefined,
          features,
        }),
      })

      const data = (await r.json().catch(() => ({}))) as { jobId?: string; error?: string }

      if (!r.ok) {
        setBuildPhase('error')
        setBuildMessage(data.error ?? `Virhe ${r.status}`)
        return
      }

      if (!data.jobId) {
        setBuildPhase('error')
        setBuildMessage('Palvelin ei palauttanut jobId:tä.')
        return
      }

      setJobId(data.jobId)
      setBuildPhase('running')
      setBuildMessage('Rakennetaan modia… Tämä voi kestää useita minuutteja.')

      void pollJob(data.jobId)
    } catch {
      setBuildPhase('error')
      setBuildMessage('Verkkovirhe — tarkista API-osoite ja CORS.')
    }
  }

  const handleDownload = async () => {
    if (!apiBase || !jobId) return
    const r = await fetch(`${apiBase}/v1/build/${jobId}/jar`)
    if (!r.ok) {
      setBuildMessage(`Lataus epäonnistui (${r.status})`)
      return
    }
    const blob = await r.blob()
    const name =
      parseFilenameFromDisposition(r.headers.get('content-disposition')) ?? `${modId}.jar`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mc-world">
      <div className="mc-wrap">
        <header className="mc-title-block">
          <h1 className="mc-logo">BENKKU</h1>
          <p className="mc-sub">
            Modigeneraattori
            <span className="mc-badge">JAVA</span>
          </p>
          <p className="mc-splash" aria-hidden="true">
            {splash}
          </p>
        </header>

        <section className="mc-panel" aria-labelledby="panel-title">
          <div className="mc-panel-inner">
            <h2 id="panel-title" className="mc-panel-title">
              Uusi modi
            </h2>

            {!apiBase ? (
              <p className="mc-hint" style={{ marginBottom: '0.85rem' }}>
                Kehitystila: aseta <code>VITE_API_URL</code> (esim.{' '}
                <code>http://127.0.0.1:8787</code>) tiedostoon <code>web/.env</code> ja käynnistä{' '}
                <code>npm run dev</code> uudelleen.
              </p>
            ) : null}

            <div className="mc-row">
              <label className="mc-label" htmlFor="mc-version">
                Minecraft-versio
              </label>
              <select
                id="mc-version"
                className="mc-select"
                value={mcVersion}
                onChange={(e) =>
                  setMcVersion(e.target.value as (typeof MC_VERSIONS)[number])
                }
              >
                {MC_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mc-hint">
                Valitse sama Minecraft-versio kuin Fabric-asennuksessasi. Tuetut versiot:{' '}
                {MC_VERSIONS.join(', ')}.
              </p>
            </div>

            <div className="mc-row">
              <span className="mc-label">Mod-loader</span>
              <div className="mc-loader-row" role="group" aria-label="Mod-loader">
                <button
                  type="button"
                  className={`mc-loader-btn${loader === 'fabric' ? ' is-on' : ''}`}
                  onClick={() => setLoader('fabric')}
                >
                  Fabric
                </button>
                <button
                  type="button"
                  className={`mc-loader-btn${loader === 'forge' ? ' is-on' : ''}`}
                  onClick={() => setLoader('forge')}
                >
                  Forge
                </button>
              </div>
              {loader === 'forge' ? (
                <p className="mc-hint">Forge-generointi tulossa myöhemmin.</p>
              ) : null}
            </div>

            <div className="mc-row">
              <label className="mc-label" htmlFor="mod-id">
                Modin tunnus (mod id)
              </label>
              <input
                id="mod-id"
                className="mc-input"
                value={modId}
                onChange={(e) =>
                  setModId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mc-hint">
                Pienet kirjaimet, numerot ja alaviiva. Esim. <code>benkku_ores</code>.{' '}
                {!modIdOk ? 'Tarkista muoto.' : ''}
              </p>
            </div>

            <div className="mc-row">
              <label className="mc-label" htmlFor="display-name">
                Nimi pelissä
              </label>
              <input
                id="display-name"
                className="mc-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
              />
            </div>

            <div className="mc-row">
              <label className="mc-label" htmlFor="wish">
                Kerro omin sanoin
              </label>
              <textarea
                id="wish"
                className="mc-textarea"
                value={wishText}
                onChange={(e) => setWishText(e.target.value)}
                placeholder="Esim. haluan uuden sinisen malmin..."
                maxLength={2000}
              />
              <p className="mc-hint">
                Toive tallennetaan työhön ja näkyy loki-/tilatiedoissa. Voit pyytää tekoälyltä
                ehdotuksen lomakkeelle — tarkista aina ennen generointia.
              </p>
              <div className="mc-loader-row" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className={`mc-loader-btn${interpretPhase === 'loading' ? ' is-on' : ''}`}
                  disabled={
                    !apiBase ||
                    interpretPhase === 'loading' ||
                    !wishText.trim() ||
                    !interpretAvailable
                  }
                  onClick={() => void handleInterpret()}
                >
                  Tulkitsi tekstistä
                </button>
                {!interpretAvailable && apiBase ? (
                  <span className="mc-hint" style={{ margin: 0 }}>
                    Tulkinta vaatii OPENAI_API_KEY palvelimella.
                  </span>
                ) : null}
              </div>
              {interpretMessage ? (
                <p className="mc-hint" style={{ marginTop: '0.35rem' }}>
                  {interpretMessage}
                </p>
              ) : null}
              {interpretDraft && interpretPhase === 'done' ? (
                <div
                  className="mc-panel-inner"
                  style={{
                    marginTop: '0.75rem',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '0.65rem 0.75rem',
                  }}
                >
                  <p className="mc-hint" style={{ marginTop: 0 }}>
                    Tulkinta
                    {interpretDraft.wishSummary ? ` — ${interpretDraft.wishSummary}` : ''}
                  </p>
                  {interpretDraft.warnings && interpretDraft.warnings.length > 0 ? (
                    <ul className="mc-hint" style={{ margin: '0.35rem 0 0 1rem' }}>
                      {interpretDraft.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mc-hint" style={{ marginBottom: '0.5rem' }}>
                    Mod: <code>{interpretDraft.modId}</code> · {interpretDraft.displayName} · MC{' '}
                    {interpretDraft.minecraftVersion}
                    {interpretDraft.features.some((f) => f.type === 'simple_item')
                      ? ' · esine-ehdotus'
                      : ''}
                  </p>
                  <button
                    type="button"
                    className="mc-loader-btn is-on"
                    onClick={() => applyInterpretDraft(interpretDraft)}
                  >
                    Käytä ehdotusta
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mc-row">
              <label className="mc-label" htmlFor="simple-item">
                Yksinkertainen esine (Fabric)
              </label>
              <div className="mc-loader-row" role="group" aria-label="Esine">
                <button
                  type="button"
                  className={`mc-loader-btn${simpleItemEnabled ? ' is-on' : ''}`}
                  onClick={() => setSimpleItemEnabled((v) => !v)}
                >
                  {simpleItemEnabled ? 'Käytössä' : 'Ei käytössä'}
                </button>
              </div>
              {simpleItemEnabled ? (
                <>
                  <label className="mc-label" htmlFor="item-id" style={{ marginTop: '0.5rem' }}>
                    Esineen tunnus (item id)
                  </label>
                  <input
                    id="item-id"
                    className="mc-input"
                    value={itemId}
                    onChange={(e) =>
                      setItemId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={41}
                  />
                  <label className="mc-label" htmlFor="item-name">
                    Esineen nimi (lokissa)
                  </label>
                  <input
                    id="item-name"
                    className="mc-input"
                    value={itemDisplayName}
                    onChange={(e) => setItemDisplayName(e.target.value)}
                    maxLength={64}
                  />
                  <p className="mc-hint">
                    Esine rekisteröidään modisi alle. Tarkista että id ei ole sama kuin modin id (
                    <code>{modId || '…'}</code>).{' '}
                    {!itemIdOk && itemId ? 'Tarkista esine-id.' : ''}
                    {itemIdOk && itemId === modId ? 'Esine-id ei saa olla sama kuin modin id.' : ''}
                    {simpleItemEnabled && !itemDisplayOk ? 'Anna esineelle nimi.' : ''}
                  </p>
                </>
              ) : (
                <p className="mc-hint">Lisää yksi tavallinen esine ilman tekstuureja (testi).</p>
              )}
            </div>

            <div className="mc-actions">
              <button
                type="button"
                className="mc-btn-primary"
                disabled={!canGenerate}
                onClick={() => void handleGenerate()}
              >
                Generoi .jar
              </button>
              {buildPhase === 'done' && jobId ? (
                <button
                  type="button"
                  className="mc-loader-btn is-on"
                  onClick={() => void handleDownload()}
                >
                  Lataa .jar
                </button>
              ) : null}
              {buildMessage ? (
                <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>
                  {buildMessage}
                </p>
              ) : (
                <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>
                  Valinta: {mcVersion} · {loader} · {modIdOk ? modId : '…'}
                </p>
              )}
            </div>
          </div>
        </section>

        <footer className="mc-footnote">
          Windows: kopioi valmis <code>.jar</code> kansioon <code>mods</code> (sama MC-versio ja{' '}
          {loader === 'fabric' ? 'Fabric' : 'Forge'} asennettuna).
        </footer>
      </div>
    </div>
  )
}
