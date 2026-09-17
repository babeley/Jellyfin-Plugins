# Catalogue (plugin Jellyfin)

Ajoute un bouton dans le bandeau du client web Jellyfin (icône classeur, juste à gauche
de l'avatar) qui ouvre une page externe (par exemple un catalogue personnalisé) — soit
dans un nouvel onglet, soit dans une iframe en surimpression qui garde le bandeau
Jellyfin visible. Fonctionne aussi bien avec l'ancienne interface Jellyfin que la
nouvelle disposition **Modern** (React/MUI) de Jellyfin 12, et de façon identique sur
toutes les vues (bibliothèque comme tableau de bord admin).

## Comment ça marche

1. Le plugin s'enregistre auprès de
   [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
   (prérequis obligatoire) pour patcher `index.html` et y injecter un `<script>` juste
   avant `</body>`.
2. Ce script ajoute un bouton directement à `document.body`, **en dehors** de l'arbre
   React (jamais comme enfant d'un conteneur que React gère). Une première version
   insérait le bouton comme enfant réel du bandeau ; ça cassait parfois la
   réconciliation de React et provoquait l'affichage d'un bandeau dupliqué en
   naviguant. Le bouton est donc en `position: fixed`, positionné dynamiquement (calcul
   de la position de l'avatar via `getBoundingClientRect`, recalculé au
   redimensionnement et périodiquement) pour rester visuellement ancré juste à gauche
   de l'avatar, sans jamais être un nœud du DOM que React gère.
3. Au clic, selon le réglage "Ouvrir dans un nouvel onglet" du Dashboard :
   - activé → `window.open()` classique dans un nouvel onglet ;
   - désactivé → une iframe s'ouvre en surimpression, occupant tout l'espace sous le
     bandeau Jellyfin qui reste visible. Le même bouton devient "Fermer" tant que la
     surimpression est ouverte, et la surimpression se ferme automatiquement dès qu'on
     navigue vers une autre vue Jellyfin. Ça ne fonctionne que si la page cible
     autorise son affichage en iframe (pas de `X-Frame-Options`/CSP
     `frame-ancestors` bloquant) — sinon la surimpression reste vide.
4. L'URL (avec son token) est servie par un point d'API du plugin
   (`GET /Catalogue/Config`), authentifié comme n'importe quel endpoint Jellyfin —
   jamais exposée à un visiteur non connecté.

## Prérequis

- Jellyfin 12.x (testé avec `Jellyfin.Controller` 12.1.0 / .NET 10).
- Plugin **File Transformation** ≥ 3.0.0.0 (première version supportant Jellyfin 12),
  installé depuis Dashboard → Plugins → Catalogue, puis Jellyfin redémarré.

## Installation sur le serveur de production (via Dashboard)

Aucun accès fichier au serveur n'est nécessaire.

1. **Installer le prérequis** : Dashboard → Plugins → Catalogue → chercher
   "File Transformation" → Installer → redémarrer Jellyfin.
2. **Ajouter ce dépôt** : Dashboard → Plugins → Catalogue → Réglages (roue crantée) →
   Dépôts → Ajouter :
   - Nom : `Jellyfin-Plugins`
   - URL du manifest : `https://raw.githubusercontent.com/babeley/jellyfin-plugins/main/manifest.json`

   Ce manifest est unique pour tout le dépôt `Jellyfin-Plugins` (voir le README à la
   racine) : il liste tous les plugins qui y sont publiés, pas seulement Catalogue.
3. Retourner dans le Catalogue, installer "Catalogue", redémarrer Jellyfin.
4. Dashboard → Plugins → **Catalogue** : renseigner l'URL complète du catalogue (avec
   le token) et le mode d'ouverture, puis Enregistrer.

Le manifest n'existe qu'à partir de la première release publiée (voir plus bas) : tant
qu'aucun tag n'a été poussé, le dépôt apparaît vide dans le Catalogue.

## Changer l'URL du catalogue plus tard

Tout se passe dans Dashboard → Plugins → **Catalogue**, sans rebuild ni redéploiement :
modifiez le champ URL (et/ou la case "Ouvrir dans un nouvel onglet"), Enregistrer. Le
nouveau lien est pris en compte au prochain chargement de page (F5).

## Build local

```bash
cd Catalogue
dotnet build -c Release
```

Le binaire compilé se trouve dans `bin/Release/net10.0/Jellyfin.Plugin.Catalogue.dll`.

## Packager une release (zip + manifest) avec jprm

[`jprm`](https://github.com/oddstr13/jellyfin-plugin-repository-manager) est l'outil
officiel de packaging des plugins Jellyfin.

```bash
pip install jprm

jprm plugin build Catalogue \
  --output=artifacts \
  --version=1.0.0.0 \
  --dotnet-framework=net10.0
```

Ceci produit `artifacts/catalogue_1.0.0.0.zip` (DLL + `meta.json`), prêt à être attaché
à une release GitHub.

## Publier une nouvelle version

Le workflow `.github/workflows/release-catalogue-plugin.yml` automatise tout :

```bash
git tag catalogue-v1.0.0.0
git push origin catalogue-v1.0.0.0
```

Il compile le plugin, publie une Release GitHub avec le zip en pièce jointe, puis met à
jour `manifest.json` (à la racine du dépôt, utilisé par "Ajouter un dépôt" — voir
"Manifest partagé" dans le README racine) et pousse ce fichier sur `main`. Pensez à
incrémenter `version` dans `build.yaml` en cohérence avec le tag.

## Développement local (Docker)

Pour itérer sans toucher au serveur de production :

```bash
cd Catalogue/dev
./build-and-install.sh        # compile et copie la DLL dans plugins/Catalogue
docker compose up -d
```

Puis ouvrir http://localhost:8096, terminer l'assistant de configuration Jellyfin, et
installer manuellement le plugin **File Transformation** une première fois :

1. Télécharger le zip de la dernière release (≥ 3.0.0.0) depuis
   https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/releases
2. Extraire son contenu dans `dev/plugins/FileTransformation/`
3. Redémarrer le conteneur : `docker compose restart jellyfin`

Après chaque modification du code du plugin :

```bash
./build-and-install.sh
docker compose restart jellyfin
```

`dev/config`, `dev/cache`, `dev/media` et `dev/plugins` sont ignorés par git (voir
`.gitignore`) : c'est un environnement de test jetable, indépendant du serveur de
production.

## Structure du projet

```
Catalogue/
├── Plugin.cs                     Point d'entrée du plugin (BasePlugin, page de config)
├── Configuration/
│   ├── PluginConfiguration.cs    CatalogueUrl, OpenInNewTab
│   └── configPage.html           Page Dashboard (formulaire admin)
├── Controller/
│   └── CatalogueController.cs    GET /Catalogue/Config (authentifié)
├── Services/
│   └── StartupService.cs         Enregistre la transformation au démarrage (tâche planifiée)
├── Helpers/
│   └── TransformationPatches.cs  Injecte le <script> avant </body> dans index.html
├── Model/
│   ├── PatchRequestPayload.cs    Payload reçu de File Transformation ({ contents })
│   └── CatalogueConfig.cs        Réponse JSON de l'endpoint Config
├── Inject/
│   └── catalogue-link.js         Script injecté côté client (bouton flottant)
├── build.yaml                    Métadonnées du plugin (jprm)
└── dev/                          Environnement Docker de développement local
```

Le manifest du dépôt Jellyfin (`manifest.json`, partagé par tous les plugins) vit à la
racine du dépôt, pas dans ce dossier — voir le README racine.

## Limites connues

- Le positionnement du bouton dépend de la structure MUI (`MuiAppBar-root`) pour
  repérer l'avatar ; une refonte du bandeau dans une future version de jellyfin-web
  peut décaler ou masquer le calcul de position (le bouton reste flottant en `fixed`
  dans tous les cas, jamais totalement invisible).
- L'iframe en surimpression dépend de l'autorisation d'affichage en iframe côté page
  cible (voir ci-dessus).
- Une seule cible configurable (une URL). Pas de gestion multi-liens.
