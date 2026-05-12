import { useMemo, useState } from 'react'

type Loader = 'fabric' | 'forge'

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

export default function App() {
  const [splash] = useState(pickSplash)
  const [mcVersion, setMcVersion] = useState<(typeof MC_VERSIONS)[number]>('1.21.1')
  const [loader, setLoader] = useState<Loader>('fabric')
  const [modId, setModId] = useState('benkku_mod')
  const [displayName, setDisplayName] = useState('Benkun modi')
  const [wishText, setWishText] = useState('')

  const modIdOk = useMemo(() => /^[a-z][a-z0-9_]{1,63}$/.test(modId), [modId])

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
                Valitse sama versio kuin Prismissä / launcherissa — modi toimii vain
                valitulla versiolla.
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
                Myöhemmin tästä tehdään automaattinen ehdotus — nyt voit vain kirjoittaa
                idean talteen.
              </p>
            </div>

            <div className="mc-actions">
              <button type="button" className="mc-btn-primary" disabled>
                Generoi .jar (tulossa)
              </button>
              <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>
                Valinta: {mcVersion} · {loader} · {modIdOk ? modId : '…'}
              </p>
            </div>
          </div>
        </section>

        <footer className="mc-footnote">
          Windows: kopioi valmis <code>.jar</code> kansioon <code>mods</code> (sama MC-versio
          ja {loader === 'fabric' ? 'Fabric' : 'Forge'} asennettuna).
        </footer>
      </div>
    </div>
  )
}
