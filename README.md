# Benkku

Minecraft **Java Edition** -modigeneraattorin käyttöliittymä (Vite + React). Teema on Minecraft-henkinä (ei Mojangin grafiikkaa).

## Kehitys

```bash
cd web
npm install
npm run dev
```

Tuotantoversio GitHub Pagesille (polku vastaa repon nimeä):

```bash
cd web
VITE_BASE_PATH=/Benkku/ npm run build
```

## Julkaisu (GitHub Pages)

Repossa **Settings → Pages**: Source = **GitHub Actions**. Workflow `Deploy GitHub Pages` rakentaa `web/`-hakemiston ja julkaisee `dist`-kansion.

Sivun osoite: `https://<github-tunnus>.github.io/Benkku/` (kun repo on nimeltään `Benkku`).

## Benkulle (Windows)

1. Avaa yllä oleva GitHub Pages -linkki selaimessa.
2. Valitse sama Minecraft-versio ja Fabric tai Forge kuin launcherissa.
3. Kun **Generoi .jar** tulee käyttöön, lataa tiedosto ja kopioi se kansioon `%appdata%\.minecraft\mods` (tai Prism Launcher -instanssin `mods`-kansioon).

Modin generointi-palvelin (API) on erillinen työ — tämä repo sisältää toistaiseksi vain käyttöliittymän.
