# Design system Binivol

Tout le design system est visible sur la page `/design` (toujours en développement, en
production seulement avec `ENABLE_DESIGN_PAGE=true`). Les tokens vivent dans
`src/app/globals.css`, les composants dans `src/components/ui/`, le logo dans
`src/components/brand/`.

## Principes

1. **Le noir agit, l'accent signale.** Les actions principales et l'élément actif sont en `ink`.
   Le bleu `accent` est l'unique accent : il met en avant, montre une progression, dessine le focus.
2. **Une seule `StatCard highlight` par écran.** Elle marque le chiffre qui compte.
3. **Un statut = une pastille et un libellé.** Jamais la couleur seule (`StatusDot`).
4. **Les motifs (hachures) sont réservés aux données** : barres, rails de progression, matrices.
5. **Quasi aucune ombre.** Les cartes se détachent par le contraste blanc sur gris. Seuls les
   menus flottants portent `shadow-pop`.
6. **Pilules partout** pour ce qui se clique : boutons, navigation, chips, champs de recherche.

## Tokens

Les valeurs brutes sont des variables sur `:root` (`--canvas`, `--ink`…) et le bloc
`@theme inline` les expose à Tailwind (`bg-canvas`, `text-ink`…). Un thème sombre pourra
redéfinir les variables sous `[data-theme="dark"]` sans toucher aux composants.

### Couleurs

| Token         | Valeur    | Usage                                          |
| ------------- | --------- | ---------------------------------------------- |
| `canvas`      | `#ECECEA` | Fond de l'application                          |
| `surface`     | `#FFFFFF` | Cartes, menus                                  |
| `veil`        | `#F5F5F3` | Sous-blocs, survols, onglets inactifs          |
| `ink`         | `#121212` | Texte, actions principales, élément actif      |
| `ink-2`       | `#2B2B2B` | Texte secondaire fort, survol de `ink`         |
| `muted`       | `#6A6A69` | Texte secondaire — **ajusté**, voir contrastes |
| `line`        | `#E5E5E2` | Filets                                         |
| `accent`      | `#1F6BFF` | Accent unique                                  |
| `accent-2`    | `#5B93FF` | Haut des dégradés                              |
| `accent-soft` | `#E2EBFF` | Fond doux d'accent                             |
| `accent-ink`  | `#1748B8` | Texte accent sur fond doux                     |
| `ok`          | `#22A06B` | Pastille OK                                    |
| `ok-soft`     | `#DFF5EA` | Fond doux OK                                   |
| `ok-ink`      | `#176B48` | Texte OK sur fond doux — **ajout**             |
| `warn`        | `#E5A100` | Pastille alerte                                |
| `warn-soft`   | `#FFF3D1` | Fond doux alerte                               |
| `warn-ink`    | `#8A6200` | Texte alerte sur fond doux                     |
| `danger`      | `#D92D3A` | Pastille danger                                |
| `danger-soft` | `#FDE3E5` | Fond doux danger                               |
| `danger-ink`  | `#A81E29` | Texte danger sur fond doux — **ajout**         |

### Contrastes mesurés (WCAG 2.1, test `src/lib/__tests__/contrast.test.ts`)

| Paire                           | Ratio    | Verdict                             |
| ------------------------------- | -------- | ----------------------------------- |
| blanc sur `accent`              | 4,56 : 1 | AA texte normal                     |
| `accent-ink` sur `accent-soft`  | 6,61 : 1 | AA                                  |
| `muted` (#717170) sur `surface` | 4,89 : 1 | AA                                  |
| `muted` (#717170) sur `canvas`  | 4,13 : 1 | **échec** → teinte ajustée          |
| `muted` (#6A6A69) sur `canvas`  | 4,58 : 1 | AA                                  |
| `muted` (#6A6A69) sur `surface` | 5,42 : 1 | AA                                  |
| `muted` (#6A6A69) sur `veil`    | 4,96 : 1 | AA                                  |
| `warn-ink` sur `warn-soft`      | 4,96 : 1 | AA                                  |
| `ok-ink` sur `ok-soft`          | 5,69 : 1 | AA                                  |
| `danger-ink` sur `danger-soft`  | 6,00 : 1 | AA                                  |
| blanc sur `ok` (#22A06B)        | 3,33 : 1 | réservé aux pastilles, pas au texte |
| blanc sur `warn` (#E5A100)      | 2,23 : 1 | réservé aux pastilles, pas au texte |

**Écart documenté.** La valeur spécifiée pour `muted` (`#717170`) donne 4,13 : 1 sur `canvas`.
Elle a été assombrie au plus près (`#6A6A69`, 4,58 : 1). Les couleurs `ok` et `danger` ne portent
jamais de texte sur leur fond doux : les chips utilisent une encre foncée (`ok-ink`,
`danger-ink`, ajoutées à cet effet).

### Rayons, ombres, espacements

- `rounded-card` 24 px (cartes), `rounded-inner` 16 px (sous-blocs), `rounded-field` 16 px
  (champs), `rounded-pill` 9999 px.
- `shadow-pop` : menus flottants uniquement.
- Grille de 4 px (échelle Tailwind). Gouttière entre cartes `gap-4` (16 px). Padding des cartes
  `p-5` / `sm:p-6` (20 à 24 px). Gouttière de page `px-gutter` (16 px), conteneur `max-w-app`
  (1440 px).

### Motifs

- `bg-hatch-accent` : hachures 135°, bandes de 6 px, `accent` / `accent-2`.
- `bg-hatch-ink` : idem en `ink` / `#3A3A3A`.
- `bg-hatch-track` : rail de progression en `line` / `veil`.
- `bg-accent-gradient` : dégradé vertical `accent-2` → `accent` (StatCard highlight).

### Typographie

Geist et Geist Mono via le paquet `geist` (fichiers embarqués, aucun CDN).

| Classe         | Taille / interligne | Poids | Interlettrage    |
| -------------- | ------------------- | ----- | ---------------- |
| `text-display` | 44 / 48             | 500   | −0,035em         |
| `text-figure`  | 34 / 36             | 500   | `tabular-nums`   |
| `text-title`   | 24 / 30             | 500   |                  |
| `text-section` | 19 / 26             | 600   |                  |
| `text-body`    | 15 / 22             | 400   |                  |
| `text-small`   | 13 / 18             |       |                  |
| `text-mono`    | 12,5 / 18           |       | avec `font-mono` |

## Logo

`BinivolMark` : rond plein en dégradé radial (`accent-2` → `accent`) et « b » minuscule blanc au
trait arrondi dont la panse se termine par une flèche montant vers le haut à droite. Variantes
`default`, `inverse` (rond blanc, « b » accent), `mono` (rond `ink`). Une variante inconnue reçue
à l'exécution retombe sur `default`. Sans `label`, le SVG est décoratif (`aria-hidden`) ; avec
`label`, il porte `role="img"`.

`BinivolLogo` : symbole + mot « Binivol » (Geist 600, −0,03em), un seul nom accessible.

Le tracé est partagé (`markGeometry.ts`) avec le script `pnpm icons` qui régénère
`src/app/icon.svg` et `src/app/apple-icon.png` (180 px).

## Composants

| Composant                                        | Notes                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Button`                                         | `primary` (ink), `accent`, `soft`, `outline`, `ghost` ; `sm`/`md`/`lg` en pilule ; `loading`, `asChild`, icônes |
| `IconButton`                                     | rond 44 px ; `outline`, `ink`, `accent` ; `aria-label` obligatoire (typé)                                       |
| `NavPills`                                       | navigation segmentée, actif en `ink`, `aria-current="page"`, défilement horizontal                              |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | surface blanche, rayon 24, sans ombre                                                                           |
| `StatCard`                                       | `default`, `highlight` (une par écran), `dark` ; valeur en `tabular-nums`                                       |
| `Chip`                                           | tons `neutral`, `accent`, `ok`, `warn`, `danger`, `ink`                                                         |
| `StatusDot`                                      | point **et** libellé ; statuts dans `src/lib/status.ts`, libellés dans `src/lib/labels.ts`                      |
| `Field`, `Input`, `Textarea`, `Select`           | label obligatoire, aide et erreur reliées par `aria-describedby`, `aria-invalid`                                |
| `SearchInput`                                    | pilule avec loupe, `aria-label` obligatoire                                                                     |
| `DataTable`                                      | présentation seule ; en-tête `veil`, filets, sélection, cellules mono, cartes sous 640 px                       |
| `Avatar`                                         | initiales dans un rond `veil` + filet ; `sm`, `md`, `lg`                                                        |
| `EmptyState`                                     | icône, titre, texte, action                                                                                     |
| `HatchedBarChart`                                | barres empilées ink + hachures accent, `role="img"`, résumé textuel                                             |
| `DotMatrix`                                      | lignes × jours, points vide / hachuré / plein, rendu en tableau accessible                                      |
| `ProgressBar`                                    | rail hachuré, remplissage accent, `role="progressbar"`, valeur bornée                                           |
| `DropdownMenu`                                   | enrobage Radix, `shadow-pop`                                                                                    |

Règles d'usage :

- la taille `sm` des boutons (36 px) est réservée aux tableaux denses sur ordinateur, jamais
  sur un écran mobile ni dans le parcours candidat : ailleurs, tout ce qui se clique mesure au
  moins 44 × 44 px ;
- les champs ont une police de 16 px sous 640 px (pas de zoom iOS) ;
- `focus-ring` est l'unique style de focus ;
- `prefers-reduced-motion` neutralise toutes les animations et transitions ;
- un NIVOL s'affiche avec `formatNivol()` dans une cellule mono (exemple fictif :
  `00012345678A`).

## Coquille

- Barre supérieure collante : logo dans une pilule blanche, `NavPills` au centre, recherche,
  notifications (compteur factice), pilule utilisateur avec menu.
- Sous 1024 px, la navigation passe sous la barre ; sous 640 px, `BottomNav` (5 icônes avec
  libellés) la remplace.
- Route group `(public)` : logo centré, sans navigation, pour le parcours candidat.

## Captures

| Écran                  | Fichier                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Accueil 1440 × 900     | `docs/captures/accueil-1440.png`                                |
| Accueil 390 × 844      | `docs/captures/accueil-390.png`                                 |
| Design system (1440)   | `docs/captures/design-1440.png`                                 |
| Design system (390)    | `docs/captures/design-390.png`                                  |
| Dossier en ligne (390) | `docs/captures/dossier-identite-390.png` (et `docs/dossier.md`) |

![Accueil 1440](captures/accueil-1440.png)
