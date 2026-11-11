# Origine du projet et dépendances

Le dépôt original de Badreddine05 contient deux commits du 1er mars 2024. Leur historique, leurs auteurs et leurs dates sont conservés. `casse_briques 3/`, `nv_casse_brique (1).zip` et `Rapport.pdf` restent inchangés. Le README historique décrit un squelette pédagogique ECS/gfx utilisé en programmation fonctionnelle avancée, avec backends SDL et js_of_ocaml. L'ensemble de ce squelette n'est pas revendiqué comme une création individuelle. Aucune nouvelle licence n'est appliquée aux fichiers historiques ou à leurs images, dont la provenance détaillée n'est pas établie dans le dépôt.

Le moteur `core/` est une refonte OCaml indépendante. Il reprend le principe du casse-briques et conserve comme mode de jeu la raquette à trois segments du projet historique. La nouvelle démo utilise des formes dessinées dans le Canvas et n'embarque pas les images ni l'ancien exécutable. Le code de cette refonte et ses outils sont sous la [licence MIT à portée explicite](LICENSE-new-code.txt).

Le bundle JavaScript est produit à partir du code OCaml avec js_of_ocaml. Les copies suivantes sont identiques aux fichiers officiels téléchargés depuis les tags utilisés pour la compilation :

| Composant | Source exacte | Notice distribuée |
| --- | --- | --- |
| OCaml 5.3.0 | [LICENSE officiel](https://github.com/ocaml/ocaml/blob/5.3.0/LICENSE) | `licenses/OCaml-5.3.0-LICENSE.txt` |
| js_of_ocaml 6.2.0 | [LICENSE officiel](https://github.com/ocsigen/js_of_ocaml/blob/6.2.0/LICENSE) | `licenses/js_of_ocaml-6.2.0-LICENSE.txt` |

Ces fichiers incluent leurs clauses et exceptions de liaison. Ils sont copiés avec le bundle public dans `dist/licenses/`. La démo charge des fichiers locaux, sans appel réseau nécessaire au gameplay.

Les polices de l'interface, Newsreader, IBM Plex Sans et IBM Plex Mono, sont distribuées sous SIL Open Font License 1.1. Les fichiers `web/fonts/` sont copiés dans `dist/fonts/` et leurs notices (`licenses/*-OFL.txt`) dans `dist/licenses/`.
