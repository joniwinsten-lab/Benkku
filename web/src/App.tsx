import { useCallback, useEffect, useMemo, useState } from 'react'

type Loader = 'fabric' | 'forge'

/** Fabric — synkassa API:n `fabricVersions.ts` kanssa */
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

  const [mcVersion, setMcVersion] = useState<(typeof MC_VERSIONS)[number]>('1.21.1')
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

  const [interpretAvailable, setInterpretAvailable] = useState(false)

  const [buildPhase, setBuildPhase] = useState<'idle' | 'queued' | 'running' | 'done' | 'error'>(
    'idle',
  )
  const [buildMessage, setBuildMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

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
      .then((h: { interpretAvailable?: boolean }) => setInterpretAvailable(!!h.interpretAvailable))
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

  const canGenerate = useMemo(() => {
    if (!apiBase) return false
    if (!modIdOk) return false
    if (!simpleItemFormOk) return false
    if (!simpleArmorFormOk) return false
    if (buildPhase === 'queued' || buildPhase === 'running') return false
    return true
  }, [apiBase, modIdOk, simpleItemFormOk, simpleArmorFormOk, buildPhase])

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
          spec?: { wishText?: string | null } | null
        }
        if (j.status === 'done') {
          setBuildPhase('done')
          const w = j.spec?.wishText?.trim()
          setBuildMessage(
            w
              ? `Valmis. Lataa .jar alta. (${w.slice(0, 72)}${w.length > 72 ? '…' : ''})`
              : 'Valmis. Lataa .jar alta.',
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

  const handleGenerate = async () => {
    setBuildMessage(null)
    setJobId(null)

    if (!apiBase) {
      setBuildPhase('error')
      setBuildMessage(
        'API-osoite puuttuu. Kehityksessä: web/.env → VITE_API_URL=http://127.0.0.1:8787 ja npm run dev uudelleen.',
      )
      return
    }
    if (!canGenerate) return

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
          setBuildMessage(idata.error ?? `Tulkinta epäonnistui (${ir.status})`)
          return
        }
        if (!idata.draft) {
          setBuildPhase('error')
          setBuildMessage('Palvelin ei palauttanut ehdotusta.')
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
        setBuildMessage('Verkkovirhe tulkinnassa.')
        return
      }
    }

    setBuildPhase('queued')
    setBuildMessage('Jonossa…')

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
        setBuildMessage('Palvelin ei palauttanut työtunnistetta.')
        return
      }

      setJobId(data.jobId)
      setBuildPhase('running')
      setBuildMessage('Tehdään moditiedostoa… Tämä voi kestää useita minuutteja.')

      void pollJob(data.jobId)
    } catch {
      setBuildPhase('error')
      setBuildMessage('Verkkovirhe — tarkista API ja CORS.')
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

            <p className="mc-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
              Kerro omin sanoin, millaisen modin haluat. Benkku on tarkoitus pitää kevyenä: vain
              uudet esineet ja varusteet (armor) — ei blokkeja, biomeja, bossseja eikä muuta laajaa.
              Paina „Generoi modi”: tekoäly täyttää tekniset kentät ja rakennetaan valmis Fabric-modin{' '}
              <code>.jar</code>. Sama Minecraft-versio kuin pelissäsi.
            </p>

            <div
              className="mc-panel-inner"
              style={{
                marginBottom: '1rem',
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
              Oletus: Fabric · Minecraft {mcVersion}
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
                  Fabric · {mcVersion} · {modIdOk ? modId : '…'}
                </p>
              )}
            </div>
          </div>
        </section>

        <footer className="mc-footnote">
          Windows: kopioi valmis <code>.jar</code> kansioon <code>mods</code>. Sama Minecraft-versio
          ja Fabric asennettuna. Forge-tuki tulossa myöhemmin.
        </footer>
      </div>
    </div>
  )
}
