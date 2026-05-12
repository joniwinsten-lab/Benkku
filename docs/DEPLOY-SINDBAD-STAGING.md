# Benkku Sindbad-staging (94.237.38.55)

Dokumentaatio siitä, mitä palvelimelle asennettiin (ei koske Odoosea eikä Next-etusivua, vain uudet polut).

## Nginx

Tiedosto `/etc/nginx/snippets/benkku-locations.conf` sisältää:

- `location /benkku-api/` — `rewrite` poistaa etuliitteen ja `proxy_pass` osoittaa `http://127.0.0.1:8787` (pitkät timeoutit Gradlea varten).
- `location /benkku/` — staattiset tiedostot `root /var/www;` ja `try_files` SPA:lle.

Pääsivun `server`-lohkoon on lisätty rivi:

```nginx
include /etc/nginx/snippets/benkku-locations.conf;
```

(tiedosto `/etc/nginx/sites-available/sindbad-web`, heti `client_max_body_size`-rivin jälkeen.)

## API (systemd)

`/etc/systemd/system/benkku-api.service` — käyttäjä `benkku`, `WorkingDirectory=/opt/benkku/app/api`, `JAVA_HOME` OpenJDK 21:lle, `CORS_ORIGINS` sisältää GitHub Pages -originin tulevaa HTTPS-käyttöä varten.

## Hakemistot

| Polku | Omistaja / sisältö |
|--------|---------------------|
| `/opt/benkku/app` | `benkku` — git clone Benkku-reposta |
| `/var/www/benkku/` | `www-data` — Vite `dist` (base `/benkku/`) |
