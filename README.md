# Benkku

Minecraft **Java Edition** -modigeneraattori: **React-käyttöliittymä** (`web/`) ja **build-API** (`api/`), joka kääntää **Fabric**-modin valmiista pohjasta (`templates/fabric-1.21-minimal/`). Teema on Minecraft-henkinä (ei Mojangin grafiikkaa).

- **Repo:** [github.com/joniwinsten-lab/Benkku](https://github.com/joniwinsten-lab/Benkku)
- **GitHub Pages:** [joniwinsten-lab.github.io/Benkku/](https://joniwinsten-lab.github.io/Benkku/)
- **Sindbad-staging (HTTP, sama origin):** [http://94.237.38.55/benkku/](http://94.237.38.55/benkku/) — UI + API (`/benkku-api/`), toimii ilman erillistä `VITE_API_URL`-asetusta.

## Sindbad-staging -palvelin (94.237.38.55)

Asennettu erillisinä polkuina, jotta **Next-sivu** (`/`) ja **Odoo** (`/web`, …) eivät muutu:

| Polku | Tarkoitus |
|--------|------------|
| `/benkku/` | Staattinen React-build (`/var/www/benkku/`) |
| `/benkku-api/` | Nginx välittää → `127.0.0.1:8787` (Node API) |

- **Käyttäjä:** `benkku`, kotihakemisto `/opt/benkku`, repo: `/opt/benkku/app` (git clone).
- **systemd:** `benkku-api.service` — `systemctl status benkku-api`, lokit: `journalctl -u benkku-api -f`.
- **Päivitys:** `sudo -u benkku git -C /opt/benkku/app pull` ja `sudo -u benkku bash -c 'cd /opt/benkku/app/api && npm ci && npm run build'`, sitten `systemctl restart benkku-api`. UI: `rsync` tai buildaa `VITE_BASE_PATH=/benkku/` ja kopioi `dist/` → `/var/www/benkku/`.

**GitHub Pages ja HTTPS:** selaimet estävät usein `fetch`-kutsun **HTTP**-API:in osoitteesta, jos sivu on **HTTPS** (`*.github.io`). Siksi GitHub Pages -sivu ei välttämättä toimi suoraan tämän palvelimen **HTTP**-API:in kanssa, ennen kuin API:lla on **HTTPS** (esim. Let’s Encrypt + oma hostnimi). Käytä silloin osoitetta `https://api.sinun.domaini/benkku-api` ja aseta repo secret **`VITE_API_URL`** siihen. Täydellinen UI+API **HTTP**-versiona: linkki yllä `/benkku/`.

Tarkempi nginx/systemd-viite: [docs/DEPLOY-SINDBAD-STAGING.md](docs/DEPLOY-SINDBAD-STAGING.md).

## Build-API (paikallinen)

Palvelin tarvitsee **JDK 21+** ja **Gradle-wrapperin** mukana tulevan `./gradlew`-komennon (kopioi pohja väliaikaiseen hakemistoon ja ajaa buildin).

```bash
cd api
npm install
npm run dev
# tai: npm run build && npm start
```

Oletusportti: **8787**. Terveys: `GET http://127.0.0.1:8787/health`.

- `POST /v1/build` — JSON: `{ "loader": "fabric", "minecraftVersion": "1.21", "modId": "benkku_mod", "displayName": "Benkun modi" }` → palauttaa `{ "jobId": "..." }` (HTTP 202).
- `GET /v1/build/:id` — tila ja lokitail.
- `GET /v1/build/:id/jar` — valmis `.jar` (kun tila on `done`).

**Tuki tällä hetkellä:** vain **Fabric** + Minecraft **1.21**. Forge ja muut versiot tulossa.

**CORS:** aseta ympäristömuuttuja `CORS_ORIGINS` pilkuilla eroteltuina sallituiksi origeiksi, esim. `http://127.0.0.1:5173,https://joniwinsten-lab.github.io`.

## Käyttöliittymä (web)

```bash
cd web
cp .env.example .env
# Muokkaa .env: VITE_API_URL=http://127.0.0.1:8787
npm install
npm run dev
```

GitHub Pages -buildiin voit upottaa julkisen API-osoitteen: repossa **Settings → Secrets and variables → Actions** → lisää salaisuus **`VITE_API_URL`** (esim. `https://oma-api.example.com`). Workflow välittää sen Vite-buildille.

## Kehitys (vain UI, staattinen build)

```bash
cd web
VITE_BASE_PATH=/Benkku/ npm run build
```

## Julkaisu (GitHub Pages)

**Settings → Pages:** Source = **GitHub Actions**. Workflow **Deploy GitHub Pages** julkaisee `web/dist`.

## Benkulle (Windows)

1. Avaa GitHub Pages -linkki (tai paikallinen dev, jos käytät sitä).
2. Varmista, että **VITE_API_URL** on asetettu (tuotannossa repo secret), jotta **Generoi .jar** ei ole harmaana.
3. Valitse **Minecraft 1.21** ja **Fabric** (kuten launcherissa).
4. Lataa `.jar` ja kopioi `%appdata%\.minecraft\mods` (tai Prism-instanssin `mods`).
