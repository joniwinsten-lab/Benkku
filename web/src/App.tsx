import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

type Loader = 'fabric' | 'forge'

/** Fabric Loader -versiot (synkassa API `modspec` FABRIC_LOADER_VERSIONS). */
const FABRIC_LOADERS_FALLBACK = ['0.18.3', '0.18.4', '0.18.5', '0.18.6', '0.19.2'] as const

/** Fabric — synkassa API:n `fabricVersions.ts` kanssa */
const MC_VERSIONS = ['1.21.11', '1.21.1', '1.21', '1.20.4', '1.20.1'] as const

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

const HEX6 = /^#[0-9A-Fa-f]{6}$/

type ArmorSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots'

type SimpleItemFeature = { type: 'simple_item'; itemId: string; displayName: string; tintHex?: string }

type SimpleArmorFeature = {
  type: 'simple_armor'
  armorId: string
  displayName: string
  slot: ArmorSlot
  tintHex?: string
}

type ModFeature = SimpleItemFeature | SimpleArmorFeature

type InterpretDraft = {
  loader: Loader
  minecraftVersion: string
  modId: string
  displayName: string
  wishText: string
  features: ModFeature[]
}

/** Lyhyt suomenkielinen virhe käyttäjälle; raaka teksti tallennetaan erikseen. */
function friendlyErrorMessage(raw: string): string {
  const s = raw.toLowerCase()
  if (s.includes('gradle exited') || s.includes('build failed')) {
    return 'Modin käännös epäonnistui (Gradle). Tarkista että valittu Minecraft-versio on tuettu ja yritä uudelleen.'
  }
  if (s.includes('out of memory') || s.includes('oom') || s.includes('cannot allocate') || s.includes('heap space')) {
    return 'Palvelimelta loppui muisti kesken käännöksen. Odota hetki ja yritä uudelleen.'
  }
  if (s.includes('openai') || s.includes('fetch failed') || s.includes('network')) {
    return 'Yhteys ulkoiseen palveluun epäonnistui. Tarkista verkko tai yritä myöhemmin uudelleen.'
  }
  if (raw.includes('422') || s.includes('virheellinen pyyntö')) {
    return 'Pyyntö ei kelpaa — tarkista valinnat (mod id, versio).'
  }
  if (s.includes('cors')) {
    return 'Selain esti yhteyden API:in (CORS). Kehityksessä tarkista VITE_API_URL.'
  }
  if (s.includes('timeout') || s.includes('aikakatkaisu')) {
    return 'Generointi kesti liian kauan. Yritä uudelleen — ruuhka voi hidastaa jonoa.'
  }
  if (s.includes('tuntematon työ')) {
    return 'Työtä ei löydy — linkki voi olla vanhentunut. Generoi modi uudelleen.'
  }
  if (s.includes('ei valmis')) {
    return 'Lataus ei vielä onnistu — odota että generointi valmistuu.'
  }
  if (s.includes('openai_api_key') || s.includes('tulkinta ei ole')) {
    return 'Tekoälytulkinta ei ole käytössä tällä palvelimella.'
  }
  if (s.includes('tilan luku')) {
    return 'Työn tilaa ei saatu — yritä hetken päästä uudelleen.'
  }
  return 'Jokin meni pieleen. Voit avata teknisen viestin alta.'
}

/** Minecraft crash-*.txt / latest.log — luetaan vain selaimessa, ei lähetetä palvelimelle. */
const CRASH_MAX_READ_BYTES = 1_200_000
const CRASH_MAX_CHARS = 450_000

async function readMcReportFile(file: File): Promise<{ text: string; note: string | null }> {
  if (file.size > CRASH_MAX_READ_BYTES) {
    const tail = file.slice(Math.max(0, file.size - CRASH_MAX_READ_BYTES))
    const buf = await tail.arrayBuffer()
    const dec = new TextDecoder('utf-8', { fatal: false })
    let text = dec.decode(buf)
    const note = `Tiedosto oli suuri (${(file.size / 1024).toFixed(0)} kt). Luettiin vain loppu (${(CRASH_MAX_READ_BYTES / 1024).toFixed(0)} kt) — virhe on yleensä lopussa.`
    if (text.length > CRASH_MAX_CHARS) {
      text = text.slice(-CRASH_MAX_CHARS)
    }
    return { text, note }
  }
  const textFull = await file.text()
  if (textFull.length <= CRASH_MAX_CHARS) {
    return { text: textFull, note: null }
  }
  return {
    text: textFull.slice(-CRASH_MAX_CHARS),
    note: `Näytetään ja kopioidaan vain viimeiset ${CRASH_MAX_CHARS.toLocaleString('fi-FI')} merkkiä (iso lokitiedosto).`,
  }
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
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [mcVersion, setMcVersion] = useState<(typeof MC_VERSIONS)[number]>('1.21.11')
  const [modId, setModId] = useState('benkku_mod')
  const [displayName, setDisplayName] = useState('Benkun modi')
  const [wishText, setWishText] = useState('')

  const [simpleItemEnabled, setSimpleItemEnabled] = useState(false)
  const [itemId, setItemId] = useState('')
  const [itemDisplayName, setItemDisplayName] = useState('')

  const [simpleArmorEnabled, setSimpleArmorEnabled] = useState(false)
  const [armorId, setArmorId] = useState('')
  const [armorDisplayName, setArmorDisplayName] = useState('')
  const [armorSlot, setArmorSlot] = useState<ArmorSlot>('helmet')
  const [itemTintHex, setItemTintHex] = useState('')
  const [armorTintHex, setArmorTintHex] = useState('')

  const [fabricLoaders, setFabricLoaders] = useState<string[]>([...FABRIC_LOADERS_FALLBACK])
  const [fabricLoaderVersion, setFabricLoaderVersion] = useState('0.18.3')

  const [interpretAvailable, setInterpretAvailable] = useState(false)

  const [buildPhase, setBuildPhase] = useState<'idle' | 'queued' | 'running' | 'done' | 'error'>(
    'idle',
  )
  const [buildMessage, setBuildMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [buildLogTail, setBuildLogTail] = useState<string | null>(null)
  const [buildLogExpanded, setBuildLogExpanded] = useState(false)
  const [buildRawError, setBuildRawError] = useState<string | null>(null)
  const [showTechnicalError, setShowTechnicalError] = useState(false)

  const crashFileInputRef = useRef<HTMLInputElement>(null)
  const crashUploadId = useId()
  const [crashReportName, setCrashReportName] = useState<string | null>(null)
  const [crashReportText, setCrashReportText] = useState<string | null>(null)
  const [crashReportNote, setCrashReportNote] = useState<string | null>(null)
  const [crashDropHover, setCrashDropHover] = useState(false)
  const [crashCopyHint, setCrashCopyHint] = useState<string | null>(null)
  const [crashReportExpanded, setCrashReportExpanded] = useState(true)

  const modIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,63}$/.test(modId), [modId])
  const itemIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,40}$/.test(itemId), [itemId])
  const armorIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,40}$/.test(armorId), [armorId])
  const itemDisplayOk = useMemo(
    () => itemDisplayName.trim().length >= 1 && itemDisplayName.trim().length <= 64,
    [itemDisplayName],
  )
  const armorDisplayOk = useMemo(
    () => armorDisplayName.trim().length >= 1 && armorDisplayName.trim().length <= 64,
    [armorDisplayName],
  )

  const apiBase = useMemo(() => resolveApiBase(), [])

  useEffect(() => {
    if (!apiBase) return
    void fetch(`${apiBase}/health`)
      .then((r) => r.json())
      .then(
        (h: {
          interpretAvailable?: boolean
          fabricLoaders?: string[]
        }) => {
          setInterpretAvailable(!!h.interpretAvailable)
          if (Array.isArray(h.fabricLoaders) && h.fabricLoaders.length > 0) {
            setFabricLoaders(h.fabricLoaders)
          }
        },
      )
      .catch(() => setInterpretAvailable(false))
  }, [apiBase])

  const itemTintOk = useMemo(() => {
    const t = itemTintHex.trim()
    if (!t) return true
    return HEX6.test(t)
  }, [itemTintHex])
  const armorTintOk = useMemo(() => {
    const t = armorTintHex.trim()
    if (!t) return true
    return HEX6.test(t)
  }, [armorTintHex])

  const simpleItemFormOk = useMemo(() => {
    if (!simpleItemEnabled) return true
    if (!itemIdOk) return false
    if (itemId === modId) return false
    if (!itemDisplayOk) return false
    if (!itemTintOk) return false
    return true
  }, [simpleItemEnabled, itemIdOk, itemId, modId, itemDisplayOk, itemTintOk])

  const simpleArmorFormOk = useMemo(() => {
    if (!simpleArmorEnabled) return true
    if (!armorIdOk) return false
    if (armorId === modId) return false
    if (!armorDisplayOk) return false
    if (!armorTintOk) return false
    return true
  }, [simpleArmorEnabled, armorIdOk, armorId, modId, armorDisplayOk, armorTintOk])

  const fabricLoaderOk = useMemo(
    () => fabricLoaders.includes(fabricLoaderVersion),
    [fabricLoaders, fabricLoaderVersion],
  )

  const canGenerate = useMemo(() => {
    if (!apiBase) return false
    if (!modIdOk) return false
    if (!fabricLoaderOk) return false
    if (!simpleItemFormOk) return false
    if (!simpleArmorFormOk) return false
    if (buildPhase === 'queued' || buildPhase === 'running') return false
    return true
  }, [apiBase, modIdOk, fabricLoaderOk, simpleItemFormOk, simpleArmorFormOk, buildPhase])

  const pollJob = useCallback(
    async (id: string) => {
      const deadline = Date.now() + 25 * 60_000
      while (Date.now() < deadline) {
        const r = await fetch(`${apiBase}/v1/build/${id}`)
        if (!r.ok) {
          const raw = `tilan luku ${r.status}`
          setBuildPhase('error')
          setBuildRawError(`HTTP ${r.status}`)
          setBuildMessage(friendlyErrorMessage(raw))
          return
        }
        const j = (await r.json()) as {
          status: string
          error?: string | null
          logTail?: string | null
          spec?: { wishText?: string | null } | null
        }

        const tail = typeof j.logTail === 'string' && j.logTail.trim() ? j.logTail : null
        setBuildLogTail(tail)

        if (j.status === 'queued') {
          setBuildPhase('queued')
          setBuildMessage('Työ jonossa — odota vuoroa…')
        } else if (j.status === 'running') {
          setBuildPhase('running')
          setBuildMessage(
            'Gradle kääntää modia. Tämä voi kestää useista minuuteista yli kymmeneen — älä sulje välilehteä.',
          )
        }

        if (j.status === 'done') {
          setBuildPhase('done')
          setBuildRawError(null)
          setShowTechnicalError(false)
          const w = j.spec?.wishText?.trim()
          setBuildMessage(
            w
              ? `Valmis. Lataa alta zip (suositus) tai .jar. (${w.slice(0, 60)}${w.length > 60 ? '…' : ''})`
              : 'Valmis. Lataa alta zip (suositus) tai suora .jar.',
          )
          return
        }
        if (j.status === 'error') {
          setBuildPhase('error')
          const raw = j.error ?? 'Generointi epäonnistui.'
          setBuildRawError(raw)
          setBuildMessage(friendlyErrorMessage(raw))
          return
        }
        await new Promise((res) => setTimeout(res, 2000))
      }
      setBuildPhase('error')
      setBuildRawError('Aikakatkaisu')
      setBuildMessage(friendlyErrorMessage('timeout'))
    },
    [apiBase],
  )

  const handleGenerate = async () => {
    setBuildMessage(null)
    setJobId(null)
    setBuildLogTail(null)
    setBuildLogExpanded(false)
    setBuildRawError(null)
    setShowTechnicalError(false)

    if (!apiBase) {
      setBuildPhase('error')
      const raw =
        'API-osoite puuttuu. Kehityksessä: web/.env → VITE_API_URL=http://127.0.0.1:8787 ja npm run dev uudelleen.'
      setBuildRawError(raw)
      setBuildMessage(friendlyErrorMessage(raw))
      return
    }
    if (!canGenerate) return

    const useFabricLoader = fabricLoaderVersion

    const wish = wishText.trim()
    let useModId = modId
    let useDisplay = displayName.trim()
    let useMc = mcVersion
    let useWish: string | undefined = wish || undefined
    const manualFeatures: ModFeature[] = []
    if (simpleItemEnabled && itemIdOk && itemId !== modId && itemDisplayOk) {
      const t = itemTintHex.trim()
      const f: SimpleItemFeature = { type: 'simple_item', itemId, displayName: itemDisplayName.trim() }
      if (HEX6.test(t)) f.tintHex = t
      manualFeatures.push(f)
    }
    if (simpleArmorEnabled && armorIdOk && armorId !== modId && armorDisplayOk) {
      const t = armorTintHex.trim()
      const f: SimpleArmorFeature = {
        type: 'simple_armor',
        armorId,
        displayName: armorDisplayName.trim(),
        slot: armorSlot,
      }
      if (HEX6.test(t)) f.tintHex = t
      manualFeatures.push(f)
    }
    let useFeatures: ModFeature[] | undefined =
      manualFeatures.length > 0 ? manualFeatures : undefined

    if (wish && interpretAvailable) {
      setBuildPhase('queued')
      setBuildMessage('Luetaan toivetta…')
      try {
        const ir = await fetch(`${apiBase}/v1/interpret`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wishText: wish,
            loader: 'fabric',
            minecraftVersion: mcVersion,
            modIdHint: modId,
            displayNameHint: displayName.trim(),
          }),
        })
        const idata = (await ir.json().catch(() => ({}))) as { draft?: InterpretDraft; error?: string }
        if (!ir.ok) {
          setBuildPhase('error')
          const raw = idata.error ?? `Tulkinta epäonnistui (${ir.status})`
          setBuildRawError(raw)
          setBuildMessage(friendlyErrorMessage(raw))
          return
        }
        if (!idata.draft) {
          setBuildPhase('error')
          const raw = 'Palvelin ei palauttanut ehdotusta.'
          setBuildRawError(raw)
          setBuildMessage(friendlyErrorMessage(raw))
          return
        }
        const d = idata.draft
        useModId = d.modId
        useDisplay = d.displayName.trim()
        if (MC_VERSIONS.includes(d.minecraftVersion as (typeof MC_VERSIONS)[number])) {
          useMc = d.minecraftVersion as (typeof MC_VERSIONS)[number]
        }
        useWish = d.wishText.trim() || wish
        const fromAi = d.features ?? []
        if (fromAi.length > 0) {
          useFeatures = fromAi
        }
        setModId(useModId)
        setDisplayName(useDisplay)
        setMcVersion(useMc)
        setWishText(useWish)
        setSimpleItemEnabled(false)
        setSimpleArmorEnabled(false)
        let setItem = false
        let setArmor = false
        for (const f of fromAi) {
          if (f.type === 'simple_item' && !setItem) {
            setItem = true
            setSimpleItemEnabled(true)
            setItemId(f.itemId)
            setItemDisplayName(f.displayName)
            setItemTintHex(f.tintHex ?? '')
          }
          if (f.type === 'simple_armor' && !setArmor) {
            setArmor = true
            setSimpleArmorEnabled(true)
            setArmorId(f.armorId)
            setArmorDisplayName(f.displayName)
            setArmorSlot(f.slot)
            setArmorTintHex(f.tintHex ?? '')
          }
        }
      } catch {
        setBuildPhase('error')
        const raw = 'Verkkovirhe tulkinnassa.'
        setBuildRawError(raw)
        setBuildMessage(friendlyErrorMessage(raw))
        return
      }
    }

    setBuildPhase('queued')
    setBuildMessage('Jonossa — odota, kunnes Gradle alkaa…')

    try {
      const r = await fetch(`${apiBase}/v1/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loader: 'fabric',
          minecraftVersion: useMc,
          modId: useModId,
          displayName: useDisplay,
          wishText: useWish,
          features: useFeatures,
          fabricLoaderVersion: useFabricLoader,
        }),
      })

      const data = (await r.json().catch(() => ({}))) as { jobId?: string; error?: string }

      if (!r.ok) {
        setBuildPhase('error')
        const raw = data.error ?? `Virhe ${r.status}`
        setBuildRawError(raw)
        setBuildMessage(friendlyErrorMessage(raw))
        return
      }

      if (!data.jobId) {
        setBuildPhase('error')
        const raw = 'Palvelin ei palauttanut työtunnistetta.'
        setBuildRawError(raw)
        setBuildMessage(friendlyErrorMessage(raw))
        return
      }

      setJobId(data.jobId)
      setBuildPhase('running')
      setBuildMessage(
        'Työ käynnissä — Gradle kääntää modia. Tämä voi kestää useita minuutteja.',
      )

      void pollJob(data.jobId)
    } catch {
      setBuildPhase('error')
      const raw = 'Verkkovirhe — tarkista API ja CORS.'
      setBuildRawError(raw)
      setBuildMessage(friendlyErrorMessage(raw))
    }
  }

  const handleDownload = async (kind: 'zip' | 'jar') => {
    if (!apiBase || !jobId) return
    const path = kind === 'zip' ? `/v1/build/${jobId}/zip` : `/v1/build/${jobId}/jar`
    const r = await fetch(`${apiBase}${path}`)
    if (!r.ok) {
      const raw = `Lataus epäonnistui (${r.status})`
      setBuildRawError(raw)
      setBuildMessage(friendlyErrorMessage(raw))
      return
    }
    const blob = await r.blob()
    const fallback = kind === 'zip' ? `${modId}.zip` : `${modId}.jar`
    const name = parseFilenameFromDisposition(r.headers.get('content-disposition')) ?? fallback
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

  const clearCrashReport = useCallback(() => {
    setCrashReportName(null)
    setCrashReportText(null)
    setCrashReportNote(null)
    setCrashCopyHint(null)
    const el = crashFileInputRef.current
    if (el) el.value = ''
  }, [])

  const ingestCrashFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return
    const file = list[0]
    setCrashCopyHint(null)
    try {
      const { text, note } = await readMcReportFile(file)
      setCrashReportName(file.name)
      setCrashReportText(text)
      setCrashReportNote(note)
      setCrashReportExpanded(true)
    } catch {
      setCrashReportName(file.name)
      setCrashReportText(null)
      setCrashReportNote('Tiedoston lukeminen epäonnistui (virheellinen teksti?).')
    }
  }, [])

  const handleCrashCopy = useCallback(async () => {
    if (!crashReportText) return
    try {
      await navigator.clipboard.writeText(crashReportText)
      setCrashCopyHint('Kopioitu leikepöydälle — voit liittää tämän Cursor-chattiin (Cmd/Ctrl+V).')
    } catch {
      setCrashCopyHint('Selain ei sallinut kopiointia — valitse teksti alla ja kopioi käsin.')
    }
    window.setTimeout(() => setCrashCopyHint(null), 5000)
  }, [crashReportText])

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

            <div
              className="mc-panel-inner"
              style={{
                marginBottom: '1rem',
                border: '1px solid rgba(120, 200, 120, 0.35)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                background: 'rgba(0, 40, 0, 0.2)',
              }}
              aria-labelledby="howto-title"
            >
              <h3 id="howto-title" className="mc-panel-title" style={{ fontSize: '1rem', marginTop: 0 }}>
                Näin tämä toimii
              </h3>
              <ol className="mc-hint" style={{ margin: '0.35rem 0 0', paddingLeft: '1.25rem' }}>
                <li style={{ marginBottom: '0.35rem' }}>
                  Valitse sama <strong>Minecraft-versio</strong> kuin pelissäsi ja varmista, että{' '}
                  <strong>Fabric</strong> on asennettuna.
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  Kirjoita toive alla olevaan kenttään, sitten <strong>Generoi modi</strong>. Tekoäly täyttää
                  tekniset kentät; palvelin rakentaa Fabric-modin <code>.jar</code>-tiedoston. Käännös voi kestää
                  useista minuuteista yli kymmeneen.
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  Kun modi on valmis, lataa ensisijaisesti <strong>zip</strong> (sisältää{' '}
                  <code>.jar</code>
                  -tiedoston). Pura zip ja siirrä <code>.jar</code> pelin <code>mods</code>-kansioon. Zip välttää
                  usein Chromen varoitukset suorasta <code>.jar</code>-latauksesta.
                </li>
              </ol>
            </div>

            {!apiBase ? (
              <p className="mc-hint" style={{ marginBottom: '0.85rem' }}>
                Kehitystila: aseta <code>VITE_API_URL</code> (esim. <code>http://127.0.0.1:8787</code>
                ) tiedostoon <code>web/.env</code> ja käynnistä <code>npm run dev</code> uudelleen.
              </p>
            ) : null}

            <div className="mc-row">
              <label className="mc-label" htmlFor="wish">
                Mitä modia haluat?
              </label>
              <textarea
                id="wish"
                className="mc-textarea"
                value={wishText}
                onChange={(e) => setWishText(e.target.value)}
                placeholder="Esim. haluan nahkaisen kypärän ja omenan tavaraluetteloon, modin nimeksi Olipa kerran…"
                maxLength={2000}
              />
              <p className="mc-hint">
                {interpretAvailable
                  ? 'Tekoäly lukee tekstin ennen generointia ja täyttää modin nimen, tunnisteen ja version.'
                  : 'Tulkinta ei ole käytössä (API-avain puuttuu) — käytä tarkempia asetuksia ja oletusnimiä, tai kirjoita toive silti talteen.'}
              </p>
            </div>

            <p className="mc-hint" style={{ marginBottom: '0.75rem' }}>
              Oletus: Fabric · Minecraft {mcVersion} · Loader {fabricLoaderVersion}
              {showAdvanced ? null : (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="mc-hint"
                    style={{
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      padding: 0,
                    }}
                    onClick={() => setShowAdvanced(true)}
                  >
                    Tarkemmat asetukset
                  </button>
                </>
              )}
            </p>

            {showAdvanced ? (
              <>
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
                </div>

                <div className="mc-row">
                  <label className="mc-label" htmlFor="fabric-loader">
                    Fabric Loader
                  </label>
                  <select
                    id="fabric-loader"
                    className="mc-select"
                    value={fabricLoaderVersion}
                    onChange={(e) => setFabricLoaderVersion(e.target.value)}
                  >
                    {fabricLoaders.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <p className="mc-hint">
                    Oletus <strong>0.18.3</strong>. Modin <code>fabric.mod.json</code> sallii loaderin{' '}
                    <code>&gt;=0.18.3</code>; valittu versio ohjaa vain Gradle-käännöstä (Fabric API pysyy
                    MC-version mukana).
                  </p>
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
                    Pienet kirjaimet ja alaviiva. {!modIdOk ? 'Tarkista muoto.' : ''}
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
                  <span className="mc-label">Lisä: yksinkertainen esine</span>
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
                        Esineen tunnus
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
                        Esineen nimi
                      </label>
                      <input
                        id="item-name"
                        className="mc-input"
                        value={itemDisplayName}
                        onChange={(e) => setItemDisplayName(e.target.value)}
                        maxLength={64}
                      />
                      <label className="mc-label" htmlFor="item-tint">
                        Väri (valinnainen, #RRGGBB)
                      </label>
                      <input
                        id="item-tint"
                        className="mc-input"
                        value={itemTintHex}
                        onChange={(e) => setItemTintHex(e.target.value)}
                        placeholder="#aabbcc"
                        maxLength={7}
                        spellCheck={false}
                      />
                      <p className="mc-hint">
                        Esine-id ei saa olla sama kuin modin id. Tyhjä väri = arvotaan id:stä.{' '}
                        {!itemIdOk && itemId ? 'Tarkista esine-id.' : ''}
                        {itemIdOk && itemId === modId ? 'Valitse eri id kuin modilla.' : ''}
                        {simpleItemEnabled && !itemDisplayOk ? 'Anna esineelle nimi.' : ''}
                        {!itemTintOk ? 'Värimuoto: # ja kuusi hex-merkkiä.' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mc-hint">Voit lisätä yhden tavaraesineen ja valita värin.</p>
                  )}
                </div>

                <div className="mc-row">
                  <span className="mc-label">Lisä: yksinkertainen armor</span>
                  <div className="mc-loader-row" role="group" aria-label="Armor">
                    <button
                      type="button"
                      className={`mc-loader-btn${simpleArmorEnabled ? ' is-on' : ''}`}
                      onClick={() => setSimpleArmorEnabled((v) => !v)}
                    >
                      {simpleArmorEnabled ? 'Käytössä' : 'Ei käytössä'}
                    </button>
                  </div>
                  {simpleArmorEnabled ? (
                    <>
                      <label className="mc-label" htmlFor="armor-slot" style={{ marginTop: '0.5rem' }}>
                        Armor-slot
                      </label>
                      <select
                        id="armor-slot"
                        className="mc-select"
                        value={armorSlot}
                        onChange={(e) => setArmorSlot(e.target.value as ArmorSlot)}
                      >
                        <option value="helmet">Kypärä</option>
                        <option value="chestplate">Rintapanssari</option>
                        <option value="leggings">Housut</option>
                        <option value="boots">Saappaat</option>
                      </select>
                      <label className="mc-label" htmlFor="armor-id">
                        Armor-tunnus
                      </label>
                      <input
                        id="armor-id"
                        className="mc-input"
                        value={armorId}
                        onChange={(e) =>
                          setArmorId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={41}
                      />
                      <label className="mc-label" htmlFor="armor-name">
                        Nimi (lokissa)
                      </label>
                      <input
                        id="armor-name"
                        className="mc-input"
                        value={armorDisplayName}
                        onChange={(e) => setArmorDisplayName(e.target.value)}
                        maxLength={64}
                      />
                      <label className="mc-label" htmlFor="armor-tint">
                        Väri (valinnainen, #RRGGBB)
                      </label>
                      <input
                        id="armor-tint"
                        className="mc-input"
                        value={armorTintHex}
                        onChange={(e) => setArmorTintHex(e.target.value)}
                        placeholder="#334422"
                        maxLength={7}
                        spellCheck={false}
                      />
                      <p className="mc-hint">
                        Oma materiaali + kerrostekstuurit; inventaariossa ja hahmolla näkyy valittu
                        tasainen väri. Id ei saa törmätä modiin tai tavaraan.{' '}
                        {!armorIdOk && armorId ? 'Tarkista tunnus.' : ''}
                        {armorIdOk && armorId === modId ? 'Valitse eri id kuin modilla.' : ''}
                        {armorIdOk && armorId === itemId && simpleItemEnabled
                          ? 'Armor-id ei saa olla sama kuin tavara-id.'
                          : ''}
                        {simpleArmorEnabled && !armorDisplayOk ? 'Anna nimi.' : ''}
                        {!armorTintOk ? 'Värimuoto: # ja kuusi hex-merkkiä.' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mc-hint">Yksi armor-pala kerrallaan; väri valinnainen.</p>
                  )}
                </div>

                <p className="mc-hint" style={{ marginBottom: '0.85rem' }}>
                  <button
                    type="button"
                    className="mc-hint"
                    style={{
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      padding: 0,
                    }}
                    onClick={() => setShowAdvanced(false)}
                  >
                    Piilota tarkemmat asetukset
                  </button>
                </p>
              </>
            ) : null}

            <div className="mc-actions">
              <button
                type="button"
                className="mc-btn-primary"
                disabled={!canGenerate}
                onClick={() => void handleGenerate()}
              >
                Generoi modi
              </button>
              {buildPhase === 'done' && jobId ? (
                <>
                  <div
                    className="mc-loader-row"
                    style={{ flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', width: '100%' }}
                  >
                    <button
                      type="button"
                      className="mc-loader-btn is-on"
                      onClick={() => void handleDownload('zip')}
                    >
                      Lataa zipinä
                    </button>
                    <button
                      type="button"
                      className="mc-loader-btn"
                      onClick={() => void handleDownload('jar')}
                    >
                      Lataa .jar
                    </button>
                  </div>
                  <p className="mc-hint" style={{ textAlign: 'center', margin: 0, fontSize: '0.72rem' }}>
                    Chrome saattaa varoittaa suorasta <code>.jar</code>-tiedostosta — valitse usein{' '}
                    <strong>Säilytä</strong> / „silti säilytä”, tai käytä zip-latausta. Pura zip ja kopioi{' '}
                    <code>.jar</code> kansioon <code>mods</code>.
                  </p>
                </>
              ) : null}
              {(buildPhase === 'queued' || buildPhase === 'running') && jobId ? (
                <p className="mc-hint" style={{ textAlign: 'center', margin: 0, width: '100%' }}>
                  {buildPhase === 'queued' ? 'Vaihe: jono' : 'Vaihe: Gradle-käännös'}
                </p>
              ) : null}
              {buildMessage ? (
                <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>
                  {buildMessage}
                </p>
              ) : (
                <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>
                  Fabric · {mcVersion} · {fabricLoaderVersion} · {modIdOk ? modId : '…'}
                </p>
              )}
              {buildLogTail &&
              (buildPhase === 'running' || buildPhase === 'error' || buildPhase === 'done') ? (
                <div style={{ width: '100%', maxWidth: '100%' }}>
                  <button
                    type="button"
                    className="mc-hint"
                    style={{
                      display: 'block',
                      margin: '0.35rem auto 0',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      padding: 0,
                    }}
                    onClick={() => setBuildLogExpanded((v) => !v)}
                  >
                    {buildLogExpanded ? 'Piilota Gradle-loki' : 'Näytä Gradle-loki (loppu)'}
                  </button>
                  {buildLogExpanded ? (
                    <pre
                      className="mc-hint"
                      style={{
                        marginTop: '0.5rem',
                        maxHeight: 220,
                        overflow: 'auto',
                        textAlign: 'left',
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        padding: '0.5rem',
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: 6,
                      }}
                    >
                      {buildLogTail}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              {buildPhase === 'error' && buildRawError ? (
                <div style={{ width: '100%', maxWidth: '100%' }}>
                  <button
                    type="button"
                    className="mc-hint"
                    style={{
                      display: 'block',
                      margin: '0.35rem auto 0',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      padding: 0,
                    }}
                    onClick={() => setShowTechnicalError((v) => !v)}
                  >
                    {showTechnicalError ? 'Piilota tekninen viesti' : 'Näytä tekninen viesti / raaka virhe'}
                  </button>
                  {showTechnicalError ? (
                    <pre
                      className="mc-hint"
                      style={{
                        marginTop: '0.5rem',
                        maxHeight: 180,
                        overflow: 'auto',
                        textAlign: 'left',
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        padding: '0.5rem',
                        background: 'rgba(40,0,0,0.35)',
                        borderRadius: 6,
                      }}
                    >
                      {buildRawError}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="mc-panel-inner"
              style={{
                marginTop: '1.25rem',
                border: '1px solid rgba(200, 160, 80, 0.38)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                background: 'rgba(45, 32, 8, 0.22)',
              }}
              aria-labelledby={`${crashUploadId}-crash-title`}
            >
              <h3
                id={`${crashUploadId}-crash-title`}
                className="mc-panel-title"
                style={{ fontSize: '1rem', marginTop: 0 }}
              >
                Minecraft-virheraportti tai loki
              </h3>
              <p className="mc-hint" style={{ margin: '0.25rem 0 0.65rem' }}>
                Vedä tähän launcherin / pelin antama <code>crash-…txt</code> tai instanssin{' '}
                <code>logs/latest.log</code>, tai valitse tiedosto. Teksti pysyy{' '}
                <strong>vain selaimessasi</strong> — sitä ei lähetetä Benkku-palvelimelle. Kopioi
                sisältö ja liitä se Cursor-chattiin, niin apuri voi tulkita virheen.
              </p>
              <input
                ref={crashFileInputRef}
                type="file"
                accept=".txt,.log,text/plain"
                style={{ display: 'none' }}
                aria-label="Valitse Minecraft-virheraportti tai lokitiedosto"
                onChange={(e) => {
                  void ingestCrashFiles(e.target.files)
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Pudota virheraporttitiedosto tähän"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    crashFileInputRef.current?.click()
                  }
                }}
                onClick={() => crashFileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setCrashDropHover(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setCrashDropHover(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setCrashDropHover(false)
                  void ingestCrashFiles(e.dataTransfer.files)
                }}
                style={{
                  border: `2px dashed ${crashDropHover ? 'rgba(255, 200, 120, 0.85)' : 'rgba(255, 255, 255, 0.28)'}`,
                  borderRadius: 8,
                  padding: '1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: crashDropHover ? 'rgba(255, 200, 100, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                  marginBottom: '0.65rem',
                }}
              >
                <p className="mc-hint" style={{ margin: 0 }}>
                  Pudota tiedosto tähän tai napauta valitaksesi
                </p>
              </div>
              {crashReportName ? (
                <p className="mc-hint" style={{ margin: '0 0 0.5rem', wordBreak: 'break-all' }}>
                  <strong>{crashReportName}</strong>
                  {' · '}
                  <button
                    type="button"
                    className="mc-hint"
                    style={{
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      padding: 0,
                    }}
                    onClick={clearCrashReport}
                  >
                    Tyhjennä
                  </button>
                </p>
              ) : null}
              {crashReportNote ? (
                <p className="mc-hint" style={{ margin: '0 0 0.5rem', color: 'rgba(255, 220, 160, 0.95)' }}>
                  {crashReportNote}
                </p>
              ) : null}
              {crashCopyHint ? (
                <p className="mc-hint" style={{ margin: '0 0 0.5rem' }}>
                  {crashCopyHint}
                </p>
              ) : null}
              {crashReportText ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <button type="button" className="mc-loader-btn is-on" onClick={() => void handleCrashCopy()}>
                      Kopioi leikepöydälle
                    </button>
                    <button
                      type="button"
                      className="mc-loader-btn"
                      onClick={() => setCrashReportExpanded((v) => !v)}
                    >
                      {crashReportExpanded ? 'Piilota esikatselu' : 'Näytä esikatselu'}
                    </button>
                  </div>
                  {crashReportExpanded ? (
                    <textarea
                      readOnly
                      value={crashReportText}
                      spellCheck={false}
                      aria-label="Virheraportin sisältö"
                      style={{
                        width: '100%',
                        minHeight: 200,
                        maxHeight: 360,
                        boxSizing: 'border-box',
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        fontFamily: 'ui-monospace, monospace',
                        padding: '0.5rem',
                        background: 'rgba(0,0,0,0.45)',
                        color: 'inherit',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        resize: 'vertical',
                      }}
                    />
                  ) : null}
                </>
              ) : null}
            </div>

            <div
              className="mc-panel-inner"
              style={{
                marginTop: '1.25rem',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
              }}
              aria-labelledby="limits-title"
            >
              <h3 id="limits-title" className="mc-panel-title" style={{ fontSize: '1rem', marginTop: 0 }}>
                Rajaus: esineet ja armor
              </h3>
              <p className="mc-hint" style={{ margin: '0.25rem 0 0.75rem' }}>
                Tämän generaattorin kohde on kapea: vain tavaraesineet ja panssari / varusteet
                (kypärä, haarniska, housut, saappaat). Ei uusia blokkeja, maailmoja, mobeja,
                koneita tai tehtäväketjuja.
              </p>
              <h3 className="mc-panel-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                Toimii nyt
              </h3>
              <ul className="mc-hint" style={{ margin: '0.35rem 0 0.85rem 1.1rem', padding: 0 }}>
                <li style={{ marginBottom: '0.35rem' }}>
                  Oikea Fabric-<code>.jar</code>, joka latautuu <code>mods</code>-kansioon (oikea
                  MC-versio + Fabric).
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  Yksi tai useampi tavaraesine tai armor-pala: tunnisteet ja nimet voidaan poimia
                  toiveesta. Jokaiselle syntyy <strong>16×16</strong> tasainen väritekstuuri
                  (inventaario + armorin kerrokset); värin voi antaa <code>#RRGGBB</code> tai se
                  arvotaan id:stä. Ei piirrettyä kuvaa tai 3D-mallia.
                </li>
              </ul>
              <h3 className="mc-panel-title" style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                Ei kuulu tähän työkaluun
              </h3>
              <ul className="mc-hint" style={{ margin: '0.35rem 0 0', padding: 0, listStyleType: 'disc' }}>
                <li style={{ marginBottom: '0.35rem' }}>
                  Pelaajan skini tai „kokonaan uusi hahmon ulkonäkö” ilman varuste-esinettä — se on
                  eri järjestelmä (skini, resurssipaketit).
                </li>
                <li style={{ marginBottom: '0.35rem' }}>
                  Laajat modit: lohkot, generointi, bossit, automaatio, monimutkainen logiikka
                  pelkästä tekstistä.
                </li>
                <li style={{ marginBottom: 0 }}>
                  Täysin vapaa „tee mitä vain” ilman rajoja: tulkinta noudattaa vain tuettuja
                  ominaisuuksia.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <footer className="mc-footnote">
          Windows: pura zip jos latasit sen, kopioi <code>.jar</code> kansioon <code>mods</code>. Sama
          Minecraft-versio ja Fabric asennettuna. Forge-tuki tulossa myöhemmin. Jos peli kaatuu
          käynnistyksessä (esim. „entrypoint main”), avaa instanssin <code>logs/latest.log</code> — siellä
          on varsinainen Java-virhe; launcherin ikkuna voi näyttää harhaanjohtavaa tekstiä.
        </footer>
      </div>
    </div>
  )
}
