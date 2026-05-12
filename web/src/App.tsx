import { useCallback, useMemo, useState } from 'react'

type Loader = 'fabric' | 'forge'

/** Template + API tukevat tällä hetkellä vain tätä yhdistelmää */
const MC_VERSIONS = ['1.21'] as const

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

export default function App() {
  const [splash] = useState(pickSplash)
  const [mcVersion, setMcVersion] = useState<(typeof MC_VERSIONS)[number]>('1.21')
  const [loader, setLoader] = useState<Loader>('fabric')
  const [modId, setModId] = useState('benkku_mod')
  const [displayName, setDisplayName] = useState('Benkun modi')
  const [wishText, setWishText] = useState('')

  const [buildPhase, setBuildPhase] = useState<'idle' | 'queued' | 'running' | 'done' | 'error'>(
    'idle',
  )
  const [buildMessage, setBuildMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const modIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,63}$/.test(modId), [modId])

  const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

  const canGenerate = useMemo(() => {
    if (!apiBase) return false
    if (!modIdOk) return false
    if (loader !== 'fabric') return false
    if (mcVersion !== '1.21') return false
    if (buildPhase === 'queued' || buildPhase === 'running') return false
    return true
  }, [apiBase, modIdOk, loader, mcVersion, buildPhase])

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
        }
        if (j.status === 'done') {
          setBuildPhase('done')
          setBuildMessage('Valmis! Lataa .jar alla.')
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
      const r = await fetch(`${apiBase}/v1/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loader,
          minecraftVersion: mcVersion,
          modId,
          displayName: displayName.trim(),
          wishText: wishText.trim() || undefined,
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
                    {v} (Fabric, generointi)
                  </option>
                ))}
              </select>
              <p className="mc-hint">
                Valitse sama pääversio kuin launcherissa. Lisää versioita tulee myöhemmin.
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
                Kerro omin sanoin (tulossa)
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
                Myöhemmin tästä tehdään automaattinen ehdotus — nyt voit vain kirjoittaa idean
                talteen.
              </p>
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
