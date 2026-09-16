# Catalogue (plugin Jellyfin)

> **Statut : en attente de migration.** Ce dossier vit temporairement dans le dépôt
> `CarTable` (erreur d'aiguillage initiale) et n'a aucun rapport avec ce projet. Il est
> conçu pour être déplacé tel quel vers son propre dépôt (`Jellyfin-Plugins` ou
> équivalent) — voir "Migration vers son propre dépôt" plus bas.

Ajoute un bouton flottant au client web Jellyfin qui ouvre une page externe (par
exemple un catalogue personnalisé) dans un nouvel onglet ou la fenêtre courante.
Fonctionne aussi bien avec l'ancienne interface Jellyfin que la nouvelle disposition
**Modern** (React/MUI) de Jellyfin 12.

## Comment ça marche

Jellyfin 12 masque (`display: none`) le conteneur d'en-tête legacy dans lequel les
anciens plugins d'injection (comme
[jellyfin-plugin-custom-tabs](https://github.com/IAmParadox27/jellyfin-plugin-custom-tabs))
ajoutent leur contenu. Plutôt que de s'accrocher à cette barre React (fragile : les
classes CSS générées par Emotion changent à chaque build de jellyfin-web, il faut un
`MutationObserver` pour survivre aux re-renders), ce plugin :

1. S'enregistre auprès du plugin
   [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
   (prérequis obligatoire) pour patcher `index.html` et y injecter un `<script>` juste
   avant `</body>`.
2. Ce script ajoute un bouton flottant directement à `document.body`, **en dehors** de
   l'arbre React. Il n'est donc jamais retiré par un re-render et n'a besoin d'aucun
   `MutationObserver` : il persiste tel quel pendant toute la session, en legacy comme
   en Modern layout.
3. Au clic, le bouton ouvre l'URL configurée (nouvel onglet ou fenêtre courante, selon
   le réglage choisi dans le Dashboard).
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
   - Nom : `Catalogue`
   - URL du manifest : `https://raw.githubusercontent.com/babeley/jellyfin-plugins/main/catalogue/manifest.json`
     (à remplacer par l'URL réelle une fois ce dossier migré vers son dépôt définitif —
     voir la section suivante).
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
cd jellyfin-plugin-catalogue
dotnet build -c Release
```

Le binaire compilé se trouve dans `bin/Release/net10.0/Jellyfin.Plugin.Catalogue.dll`.

## Packager une release (zip + manifest) avec jprm

[`jprm`](https://github.com/oddstr13/jellyfin-plugin-repository-manager) est l'outil
officiel de packaging des plugins Jellyfin.

```bash
pip install jprm

jprm plugin build jellyfin-plugin-catalogue \
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
jour `jellyfin-plugin-catalogue/manifest.json` (utilisé par "Ajouter un dépôt") et
pousse ce fichier sur `main`. Pensez à incrémenter `version` dans `build.yaml` en
cohérence avec le tag.

## Développement local (Docker)

Pour itérer sans toucher au serveur de production :

```bash
cd jellyfin-plugin-catalogue/dev
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
jellyfin-plugin-catalogue/
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
├── manifest.json                 Dépôt Jellyfin (généré/mis à jour par la CI)
└── dev/                          Environnement Docker de développement local
```

## Limites connues de cette v1

- Pas d'iframe : le catalogue s'ouvre dans un nouvel onglet/la fenêtre courante, pas
  intégré visuellement dans Jellyfin.
- Une seule cible configurable (une URL). Pas de gestion multi-liens.
