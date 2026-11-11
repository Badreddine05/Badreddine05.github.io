# Système graphique

Ce document décrit l'identité commune au portfolio et aux applications des projets (FlowLens, GridPulse, RetailScope, NeuroLab). Les fichiers de référence sont dans `assets/` : `css/tokens.css`, `fonts/`, `brand/`.

## Principe

Le portfolio se lit comme un carnet de travail : du papier, de l'encre, des figures numérotées et des légendes. La couleur sert aux données et à l'identité de chaque projet, jamais à la décoration. Le mouvement montre une donnée qui change ou une étape qui s'enchaîne. Il ne sert pas d'effet d'entrée gratuit.

À éviter partout : dégradés, verre dépoli, ombres portées sur des cartes, icônes dans des carrés arrondis au-dessus d'un chiffre, pastilles colorées en série, emoji, barre latérale sombre, slogans en trois temps (« Des données. Du sens. Des décisions. »), titres du type « X, en perspective ».

## Typographie

| Rôle | Famille | Usage |
| --- | --- | --- |
| Titres, lecture, grands chiffres | Newsreader (variable, axe `opsz`) | Titres d'article, chapôs, corps des études, valeurs clés |
| Interface | IBM Plex Sans (variable) | Navigation, boutons, légendes, tableaux, filtres |
| Données | IBM Plex Mono 400/500 | Axes, unités, identifiants, horodatages, petites étiquettes |

- Corps de lecture : 19 px, interligne 1,6, 60 à 72 caractères par ligne.
- Interface : 15 px ; légendes 13 px ; étiquettes d'axe 11–12 px en mono.
- Grands titres : `font-variation-settings: "opsz" 72`, interlettrage −0,02 em, interligne 1,02–1,1.
- Chiffres : `font-variant-numeric: tabular-nums` dans les tableaux et les axes.
- Les flèches et symboles hors du sous-ensemble latin (→, ↗) sont dessinés en SVG, pas tapés au clavier.

## Couleurs

Toutes les couleurs passent par les variables de `tokens.css`. Le mode sombre est automatique (`prefers-color-scheme`) et forçable avec `data-theme="light|dark"` sur `<html>`.

| Variable | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--paper` | `#fbfaf6` | `#121211` | Fond |
| `--paper-2` | `#f3f1ea` | `#1b1a18` | Fond de figure, champ, survol |
| `--ink` | `#17160f` | `#eeebe3` | Texte, données observées |
| `--ink-2` | `#4b4840` | `#b9b5aa` | Texte secondaire |
| `--ink-3` | `#6e6a60` | `#8f8b81` | Légendes, axes |
| `--rule` | `#dedad0` | `#34322d` | Filets, quadrillage |
| `--flow` | `#0b7a72` | `#43c2b3` | FlowLens |
| `--grid` | `#ad4d08` | `#f0a040` | GridPulse |
| `--retail` | `#b8285a` | `#f27ba3` | RetailScope |
| `--neuro` | `#4d44c9` | `#9c93ff` | NeuroLab |

Chaque projet a une variante `--<projet>-soft` pour les aplats (bandes d'incertitude, surfaces). Dans une figure : l'accent du projet pour la série principale, `--ink` pour l'observé ou la référence, `--data-muted` pour le contexte. Le texte en couleur d'accent atteint au moins 4,5:1 sur `--paper`.

## Marques

Chaque marque tient dans une grille de 24 unités, traits de 2 unités à bouts ronds, une seule couleur. Elle reprend une forme tirée du projet lui-même.

- **Badreddine Channoufi** (`mark.svg`) : la hampe d'un « b » dont la panse ouverte forme un « c ». Un point de donnée referme le cercle.
- **FlowLens** : deux variantes de parcours qui s'écartent puis se rejoignent, en forme de lentille. Un dossier circule sur la branche du haut.
- **GridPulse** : la courbe de consommation d'une journée d'hiver, avec la pointe du matin et celle du soir, posée sur une rangée de nœuds du réseau.
- **RetailScope** : le triangle de cohortes. Chaque ligne est un mois d'arrivée, chaque colonne un mois plus tard, et l'opacité baisse avec la rétention.
- **NeuroLab** : une tête vue de dessus et cinq électrodes. C3 et C4, au-dessus du cortex moteur, sont plus grosses.

Taille minimale : 16 px. Espace libre autour d'une marque : un quart de sa taille. Le nom du projet s'écrit en IBM Plex Sans 600, à côté de la marque, interlettrage −0,01 em.

## Mise en page

- Largeur de lecture : 680 px max. Largeur des figures : jusqu'à 1 180 px. Marges latérales : 16 px sur mobile, 24 px sur tablette.
- Les études de cas suivent la grille d'un article de recherche : colonne de texte, gouttière pour les notes à droite (en ligne sous 1 100 px), figures élargies (`l-page`) ou pleine largeur (`l-screen`).
- Filets de 1 px plutôt que des cartes. Rayon de 3 px au maximum, sur les champs et les boutons.
- Boutons : primaire = fond `--ink`, texte `--paper` ; secondaire = filet `--rule-2`. Hauteur 40 px, cible tactile de 44 px sur mobile.

## Mouvement

- Durées : 160 ms (survol), 320 ms (changement d'état), 700 ms (tracé d'une figure). Courbe `--ease-out`.
- Une figure s'anime une fois, quand elle entre dans l'écran. Les animations en boucle restent en pause par défaut ou se règlent au clic.
- `prefers-reduced-motion: reduce` : état final sans transition. Les commandes de lecture restent disponibles.

## Écriture

Phrases courtes et précises, à la première personne sur le portfolio. On dit ce que fait l'outil, sur quelles données, avec quelle limite. Les chiffres viennent des fichiers de données et gardent leur unité. Pas de superlatifs, pas de promesses d'impact, pas de « solution innovante ».
