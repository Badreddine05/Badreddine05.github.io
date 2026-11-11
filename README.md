# Portfolio — Badreddine Channoufi

Portfolio personnel consacré à la Data Engineering, à la Business Intelligence et aux systèmes d’information. Il présente le parcours, un CV HTML/PDF et trois applications interactives avec leur démarche.

**Site : [badreddine05.github.io](https://badreddine05.github.io/)**

| Projet | Démonstration | Code source |
| --- | --- | --- |
| RetailScope — analyse commerciale | [/retailscope/](https://badreddine05.github.io/retailscope/) | [retailscope](https://github.com/Badreddine05/retailscope) |
| GridPulse — observatoire électrique | [/gridpulse/](https://badreddine05.github.io/gridpulse/) | [gridpulse](https://github.com/Badreddine05/gridpulse) |
| FlowLens — analyse des processus | [/flowlens/](https://badreddine05.github.io/flowlens/) | [flowlens](https://github.com/Badreddine05/flowlens) |

## Architecture

Le portfolio est un site statique HTML/CSS/JavaScript, publié par GitHub Pages depuis la racine de `main`. Il fonctionne sans compilation. `.nojekyll` conserve les répertoires générés des applications. Les projets ont trois dépôts indépendants ; leurs builds sont copiés dans ce dépôt pour offrir un point d’entrée unique. `projects.lock.json` conserve le dépôt et le commit exacts de chaque version intégrée.

```text
index.html / style.css / app.js   portfolio et interactions
data/cv.json                     contenu structuré du CV
cv.html / cv.css                 CV dans le navigateur
assets/                         polices, aperçus et PDF
scripts/build-cv.mjs              génération HTML
scripts/render_cv.py              génération PDF avec ReportLab
scripts/sync-projects.mjs         intégration des builds
projects.lock.json               références Git immuables
retailscope/ gridpulse/ flowlens/ builds des applications
tests/site.test.mjs               contrôles d’intégrité
```

## Prévisualiser et tester

```sh
python -m http.server 8080
```

Ouvrir [localhost:8080](http://localhost:8080/). Les démos nécessitent un serveur HTTP pour leurs données ; une ouverture en `file://` ne suffit pas.

Node.js 22.12+ est requis pour les scripts et tests. Le portfolio n’a aucune dépendance npm à installer.

```sh
npm test
```

## Mettre à jour les projets

Le lock contient exactement trois entrées `{slug, repository, commit}` sous `projects`. Les slugs autorisés sont `retailscope`, `gridpulse` et `flowlens`, les dépôts sont ceux de `Badreddine05`, et chaque commit est un SHA Git complet de 40 caractères. `repository` accepte `Badreddine05/slug` ou l’URL HTTPS GitHub correspondante.

```sh
node scripts/sync-projects.mjs
npm test
```

Le script récupère les dépôts publics dans `.cache/`, vérifie chaque commit, exécute `npm ci` et `npm run build`, puis copie `dist/` vers le sous-répertoire concerné. Il emploie des arguments structurés, sans shell ni jeton GitHub. Le point d’entrée JavaScript de npm est localisé pour fonctionner aussi sous Windows.

Avant tout remplacement récursif, le chemin cible est résolu et comparé à la liste fixe des trois dossiers. Les liens symboliques sont refusés. La source doit contenir `index.html`. Les autres fichiers du portfolio restent hors de ce périmètre.

Pour intégrer des builds déjà préparés dans les dossiers frères, sans réseau ni compilation :

```sh
node scripts/sync-projects.mjs --local
```

Ce mode copie `../retailscope/dist`, `../gridpulse/dist` et `../flowlens/dist`. Il valide le format du lock mais **ne vérifie pas** la correspondance entre builds locaux et commits distants. Utiliser le mode normal pour reconstruire les références épinglées. Après intégration, examiner les changements et commiter les builds avec leur lock.

## Mettre à jour le CV

Les faits sont centralisés dans `data/cv.json` :

```sh
node scripts/build-cv.mjs
python -m pip install -r requirements-pdf.txt
python scripts/render_cv.py
npm test
```

Le PDF est généré avec **ReportLab**. Sa présentation s’inspire de l’organisation de *Jake’s Resume* : hiérarchie simple, sections et typographie sobre. Le code du modèle Jake n’est pas repris. Le PDF doit être rendu et inspecté après modification : le test d’en-tête PDF ne remplace pas une revue visuelle. Le contenu public ne comporte pas de numéro de téléphone.

## Vérification et maintenance

La CI exécute les tests Node, régénère le CV HTML et vérifie l’absence de différence avec le fichier commité. Les tests contrôlent les pages et ancres, les fichiers locaux visés, les bundles des trois démos, le CV JSON, l’absence de téléphone, le lock, le PDF et les fichiers de découverte.

Ils lisent seulement les points d’entrée HTML et les métadonnées nécessaires. Ils ne parcourent pas les gros jeux de données ou tous les bundles et n’appellent pas les liens externes. Chaque dépôt projet conserve ses propres tests et son pipeline.

## Provenance et licences

Les dates d’expérience et de formation décrivent le parcours confirmé. Les commits enregistrent les étapes réelles de réalisation. Les années des jeux de données ne sont pas des dates de développement. Le site et les projets ont été réalisés avec assistance de Codex ; les sources et contrôles sont documentés dans les dépôts concernés.

Code original du portfolio : [MIT](LICENSE). Les polices et données des démos conservent leurs conditions propres. Consulter les notices des trois dépôts, notamment les conditions non commerciales du jeu BPI utilisé par FlowLens. Le contenu du CV et les coordonnées publiques ne doivent pas être repris pour usurper l’identité de son auteur.
