<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/portfolio-dark.png">
  <img alt="Page d'accueil du portfolio de Badreddine Channoufi" src=".github/readme/portfolio-light.png">
</picture>

# Portfolio de Badreddine Channoufi

Le site personnel de Badreddine Channoufi, étudiant en Master 2 MIAGE à l'université Paris-Saclay : quatre projets data présentés comme de courts articles illustrés, trois applications d'exploration, le parcours et le CV.

**[badreddine05.github.io](https://badreddine05.github.io/)**

| Projet | Étude de cas | Application | Code |
| --- | --- | --- | --- |
| RetailScope, ventes et fidélité d'un commerce en ligne | [lire](https://badreddine05.github.io/projets/retailscope/) | [ouvrir](https://badreddine05.github.io/retailscope/) | [retailscope](https://github.com/Badreddine05/retailscope) |
| GridPulse, électricité française 2023-2024 | [lire](https://badreddine05.github.io/projets/gridpulse/) | [ouvrir](https://badreddine05.github.io/gridpulse/) | [gridpulse](https://github.com/Badreddine05/gridpulse) |
| FlowLens, parcours de 31 509 demandes de prêt | [lire](https://badreddine05.github.io/projets/flowlens/) | [ouvrir](https://badreddine05.github.io/flowlens/) | [flowlens](https://github.com/Badreddine05/flowlens) |
| NeuroLab, mouvements imaginés et EEG | [lire](https://badreddine05.github.io/projets/neurolab/) | dans l'étude | [BCI](https://github.com/Badreddine05/BCI) |

## Ce que contient le site

- Une page d'accueil avec une figure par projet, le parcours, les compétences et le contact.
- Une étude de cas par projet, mise en page comme un article de recherche : notes en marge, figures numérotées et interactives, annexes sur la méthode, les limites et les sources. Toutes les figures sont calculées à partir des données des projets.
- Les applications de FlowLens, GridPulse et RetailScope, construites dans leurs propres dépôts et copiées ici.
- Le CV en HTML, généré depuis `data/cv.json`, et sa version PDF.

Le site suit le thème clair ou sombre du système ; un bouton permet de le forcer, et le choix vaut aussi pour les applications.

## Prévisualiser

Le site est statique et ne demande aucune compilation. Il faut un serveur HTTP local, car les figures et les applications chargent leurs données :

```sh
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`. Node.js 22.12 ou plus récent sert aux scripts et aux tests, sans dépendance npm à installer.

```sh
npm test
```

## Organisation

```text
index.html, 404.html          accueil et page d'erreur
projets/<projet>/index.html   études de cas
cv.html                       CV généré par scripts/build-cv.mjs
assets/css/                   tokens.css (identité), site.css, article.css, cv.css
assets/js/                    site.js (thème, en-tête), home.js, figs/<projet>.js
assets/brand/                 marques SVG du site et des quatre projets
assets/fonts/, assets/vendor/ polices auto-hébergées et sous-ensemble de D3, avec leurs licences
data/figures/                 données compactes des figures, générées
data/cv.json                  contenu structuré du CV
retailscope/ gridpulse/ flowlens/   builds des applications
docs/design-system.md         règles de l'identité graphique
```

## Mettre à jour les figures

Les données des figures sont calculées avec les modules d'analyse des projets eux-mêmes (`../flowlens/src/analytics.mjs`, `../gridpulse/src/data.mjs`, `../retailscope/src/analytics.js`), à partir des builds présents dans ce dépôt et du rapport `benchmark.json` du dépôt BCI. Les dépôts des projets doivent donc être clonés à côté de celui-ci.

```sh
node scripts/build-figures.mjs --bci ../BCI/web/data/benchmark.json
npm test
```

## Mettre à jour les applications

`projects.lock.json` épingle le dépôt et le commit exact (SHA complet) de chaque application intégrée. Le script de synchronisation clone les dépôts publics dans `.cache/`, vérifie chaque commit, lance `npm ci` et `npm run build`, puis remplace le dossier de l'application par son `dist/` :

```sh
node scripts/sync-projects.mjs
npm test
```

Le chemin cible est vérifié contre une liste fixe de trois dossiers et les liens symboliques sont refusés. Le mode `--local` copie à la place `../<projet>/dist` sans réseau ni compilation ; il ne vérifie pas que ces builds correspondent aux commits du lock.

## Mettre à jour le CV

Toutes les informations viennent de `data/cv.json` :

```sh
node scripts/build-cv.mjs
python -m pip install -r requirements-pdf.txt
python scripts/render_cv.py
```

Le PDF est produit avec ReportLab et doit être relu après chaque modification. Aucune page publique ne contient de numéro de téléphone, et un test le vérifie.

## Vérifications

La CI GitHub Actions lance les tests, régénère `cv.html` et vérifie qu'il correspond au fichier versionné. Les tests contrôlent la langue, le titre et le `h1` de chaque page, les liens et ancres locaux, les figures et leurs données, la cohérence de ces données avec les résultats publiés des projets, les bundles des applications, le lock, les marques, les polices et leurs licences, le CV et le sitemap.

## Licences et crédits

Code du site sous licence [MIT](LICENSE). Polices Newsreader, IBM Plex Sans et IBM Plex Mono sous SIL OFL 1.1 (`assets/fonts/`) ; D3 sous licence ISC (`assets/vendor/`). Les données de chaque projet gardent leurs propres conditions, détaillées dans son dépôt ; celles du BPI Challenge 2017 (FlowLens) interdisent l'usage commercial.

Les années des jeux de données ne sont pas des dates de développement, et les commits portent leurs dates réelles. Le site et les projets ont été réalisés avec l'aide d'outils d'IA ; les sources et les contrôles sont documentés dans chaque dépôt. Le contenu du CV et les coordonnées ne doivent pas être réutilisés pour se faire passer pour leur auteur.
