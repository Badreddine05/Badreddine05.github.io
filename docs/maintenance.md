# Maintenir le site

## Prévisualiser

Le site est statique et ne demande aucune compilation. Les figures et les applications chargent leurs données, donc il faut un serveur HTTP local ; une ouverture en `file://` ne suffit pas.

```sh
python -m http.server 8080
npm test
```

Node.js 22.12 ou plus récent sert aux scripts et aux tests, sans dépendance npm à installer.

## Organisation

```text
index.html, 404.html          accueil et page d'erreur
projets/<projet>/index.html   études de cas
cv.html                       CV généré par scripts/build-cv.mjs
assets/css/                   tokens.css (identité), site.css, article.css, cv.css
assets/js/                    site.js (thème, en-tête), home.js, figs/<projet>.js
assets/brand/                 marques SVG du site et des projets
assets/fonts/, assets/vendor/ polices auto-hébergées et sous-ensemble de D3, avec leurs licences
assets/og/                    images d'aperçu pour les réseaux sociaux
data/figures/                 données compactes des figures, générées
data/cv.json                  contenu structuré du CV
retailscope/ gridpulse/ flowlens/   builds des applications
frogger/ ile-interdite/ rebound/    builds des jeux, épinglés par games.lock.json
docs/design-system.md         règles de l'identité graphique
```

## Mettre à jour les figures

Les données des figures sont calculées avec les modules d'analyse des projets eux-mêmes (`../flowlens/src/analytics.mjs`, `../gridpulse/src/data.mjs`, `../retailscope/src/analytics.js`), à partir des builds présents dans ce dépôt et du rapport `benchmark.json` du dépôt BCI. Les dépôts des projets doivent donc être clonés à côté de celui-ci.

```sh
node scripts/build-figures.mjs --bci ../BCI/web/data/benchmark.json
npm test
```

Un test vérifie que quelques valeurs publiées par les projets se retrouvent dans ces données.

## Mettre à jour les applications

`projects.lock.json` épingle le dépôt et le commit exact (SHA complet) de chaque application intégrée. Le script de synchronisation clone les dépôts publics dans `.cache/`, vérifie chaque commit, lance `npm ci` et `npm run build`, puis remplace le dossier de l'application par son `dist/` :

```sh
node scripts/sync-projects.mjs
npm test
```

Le chemin cible est comparé à une liste fixe de dossiers et les liens symboliques sont refusés. Le mode `--local` copie `../<projet>/dist` sans réseau ni compilation ; il ne vérifie pas que ces builds correspondent aux commits du lock.

## Mettre à jour les jeux

`games.lock.json` épingle pour chaque jeu le dépôt, le commit et l'empreinte SHA-256 de son moteur compilé, la même que celle du moteur validé par la CI du jeu. Les dépôts des jeux sont clonés à côté de celui-ci et leurs builds se font sur place : `npm run build` dans `Frogger/web` (Java 17 et TeaVM), `./mvnw -Pweb verify` pour l'Île interdite, `dune build --profile release web/main.bc.js` puis `node scripts/package.mjs` pour REBOUND (OCaml 5.3 et js_of_ocaml 6.2). Le script refuse un dépôt qui n'est pas au commit du lock ou qui a des modifications suivies non commitées, ainsi qu'un moteur dont l'empreinte diffère :

```sh
node scripts/sync-games.mjs
npm test
```

Un jeu absent du lock n'est pas copié. L'accueil ne propose « Jouer » que pour les jeux intégrés.

## Mettre à jour le CV

Toutes les informations viennent de `data/cv.json` :

```sh
node scripts/build-cv.mjs
python -m pip install -r requirements-pdf.txt
python scripts/render_cv.py
```

Le PDF est produit avec ReportLab et doit être relu après chaque modification. Aucune page publique ne contient de numéro de téléphone, et un test le vérifie.

## Vérifications

La CI GitHub Actions lance les tests, régénère `cv.html` et vérifie qu'il correspond au fichier versionné. Les tests contrôlent la langue, le titre et le `h1` de chaque page, les liens et ancres locaux, les figures et leurs données, la cohérence de ces données avec les résultats publiés des projets, les bundles des applications, le lock, les jeux et l'empreinte de leur moteur, les marques, les polices et leurs licences, le CV et le sitemap.
