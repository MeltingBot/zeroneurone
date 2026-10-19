# Déploiement sur Apache (LAMP), y compris en sous-répertoire

ZeroNeurone est une application statique : Apache sert des fichiers, sans PHP ni
base de données. Seule la collaboration temps réel demande un processus Node
(le relais WebSocket), facultatif.

Exemple utilisé ici : `https://serveur.exemple/Zeroneurone/`, sur Ubuntu 24.04.

## 1. Build

Le chemin de base se fixe au build, via `VITE_BASE`. Il est sensible à la casse
et doit correspondre exactement au répertoire servi par Apache.

```bash
npm ci
npm run build:plugins
VITE_BASE=/Zeroneurone/ npm run build
```

Sans `VITE_BASE`, l'application est construite pour la racine du domaine (`/`).

Les plugins externes (`plugins/*.js`) n'ont pas besoin d'être reconstruits pour
chaque chemin : ZN leur transmet le chemin de base (`api.basePath`). Seul
ForeNeurone lit un fichier de `plugins/` par lui-même (décodeur HEIC) : il faut
une version construite après l'ajout de `api.basePath`.

## 2. Copie

```bash
sudo mkdir -p /var/www/html/Zeroneurone
sudo rsync -a --delete dist/ /var/www/html/Zeroneurone/
sudo cp docs/apache/htaccess /var/www/html/Zeroneurone/.htaccess   # contenu en section 4
```

`--delete` retire les anciens fichiers hachés, mais supprime aussi le
`.htaccess` : recopier ce dernier après chaque déploiement.

## 3. Modules et autorisations Apache

```bash
sudo a2enmod rewrite headers expires
```

Dans la configuration du vhost :

```apache
<Directory /var/www/html/Zeroneurone>
    AllowOverride All
    Require all granted
</Directory>
```

## 4. `.htaccess`

Fourni dans `docs/apache/htaccess`, à placer dans `/var/www/html/Zeroneurone/.htaccess`. Adapter `RewriteBase` au
chemin choisi.

```apache
# --- Types MIME ------------------------------------------------------------
# .mjs (workers pdf.js et MapLibre) doit être servi en JavaScript, sinon le
# navigateur le bloque (X-Content-Type-Options: nosniff).
AddType text/javascript .mjs
AddType application/wasm .wasm
AddType application/manifest+json .webmanifest

# --- Application monopage --------------------------------------------------
# Toute URL qui n'est pas un fichier (/Zeroneurone/dossier/<id>,
# /Zeroneurone/join/<id>) renvoie index.html : c'est le routeur qui la traite.
RewriteEngine On
RewriteBase /Zeroneurone/
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . index.html [L]

# --- Cache -----------------------------------------------------------------
# Fichiers hachés par Vite : immuables.
<FilesMatch "-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
# Toujours revalidés : la page, le service worker, la version, les plugins.
<FilesMatch "^(index\.html|sw\.js|registerSW\.js|version\.json|manifest\.json|manifest\.webmanifest)$">
    Header set Cache-Control "no-cache"
</FilesMatch>

# --- En-têtes de sécurité (équivalent de security-headers.conf) -----------
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(self)"
# 'blob:' et 'wasm-unsafe-eval' sont indispensables (plugins, sql.js, WebLLM).
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' blob: https: wss: ws:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
```

`Strict-Transport-Security` n'est pas fixé ici : sur un domaine partagé, c'est
à l'administrateur du serveur d'en décider pour l'ensemble du vhost.

## 5. Collaboration (facultatif)

Le relais (`relay/`) est un petit serveur Node, à faire tourner sur la même
machine et à exposer via Apache.

```bash
sudo apt install nodejs npm
sudo mkdir -p /opt/zeroneurone-relay
sudo cp relay/index.js relay/package.json /opt/zeroneurone-relay/
cd /opt/zeroneurone-relay && sudo npm install --omit=dev
```

`/etc/systemd/system/zeroneurone-relay.service` :

```ini
[Unit]
Description=ZeroNeurone relay
After=network.target

[Service]
WorkingDirectory=/opt/zeroneurone-relay
ExecStart=/usr/bin/node index.js
Environment=HOST=127.0.0.1
Environment=PORT=4444
Environment=TRUST_PROXY=1
Environment=ALLOWED_ORIGIN=https://serveur.exemple
User=www-data
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now zeroneurone-relay
sudo a2enmod proxy proxy_http
```

Dans le vhost HTTPS (pas dans le `.htaccess`) :

```apache
ProxyPass        /Zeroneurone-relay/ http://127.0.0.1:4444/ upgrade=websocket
ProxyPassReverse /Zeroneurone-relay/ http://127.0.0.1:4444/
```

Dans ZeroNeurone, l'adresse du serveur de collaboration à saisir est alors
`wss://serveur.exemple/Zeroneurone-relay`.

Le relais garde les messages en attente en mémoire ; définir `REDIS_URL` pour
qu'ils survivent à un redémarrage.

## 6. Vérification

- `https://serveur.exemple/Zeroneurone/` affiche l'accueil, sans erreur 404
  dans l'onglet Réseau des outils de développement.
- Ouvrir un dossier puis recharger la page (F5) : le dossier se rouvre.
- Les extensions apparaissent dans la section « Extensions » de l'accueil.
- `https://serveur.exemple/Zeroneurone/version.json` renvoie la version.

## Limites en réseau fermé

Sans accès à Internet, ne fonctionnent pas : les fonds de carte
(OpenFreeMap, OpenStreetMap, ArcGIS), le géocodage (Nominatim), les liens vers
la documentation en ligne, et OneNeurone (téléchargement des modèles depuis
Hugging Face, appels aux API LLM externes). Le reste de l'application fonctionne hors ligne.
