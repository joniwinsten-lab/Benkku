# Benkku

Minecraft **Java Edition** -modigeneraattorin käyttöliittymä (Vite + React). Teema on Minecraft-henkinä (ei Mojangin grafiikkaa).

- **Repo:** [github.com/joniwinsten-lab/Benkku](https://github.com/joniwinsten-lab/Benkku)
- **GitHub Pages (kun workflow on ajettu):** [joniwinsten-lab.github.io/Benkku/](https://joniwinsten-lab.github.io/Benkku/)

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

Repossa **Settings → Pages**: **Build and deployment** → Source = **GitHub Actions**. Ensimmäisellä kerralla GitHub saattaa pyytää hyväksymään **github-pages**-ympäristön workflow-runista.

Workflow **Deploy GitHub Pages** rakentaa `web/`-hakemiston ja julkaisee `dist`-kansion osoitteeseen `https://joniwinsten-lab.github.io/Benkku/`.

## Benkulle (Windows)

1. Avaa yllä oleva GitHub Pages -linkki selaimessa.
2. Valitse sama Minecraft-versio ja Fabric tai Forge kuin launcherissa.
3. Kun **Generoi .jar** tulee käyttöön, lataa tiedosto ja kopioi se kansioon `%appdata%\.minecraft\mods` (tai Prism Launcher -instanssin `mods`-kansioon).

Modin generointi-palvelin (API) on erillinen työ — tämä repo sisältää toistaiseksi vain käyttöliittymän.
