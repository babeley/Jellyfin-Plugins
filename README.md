# Jellyfin-Plugins

Dépôt de plugins Jellyfin maison. Chaque plugin vit dans son propre sous-dossier, avec
son propre `README.md` et son propre workflow de release.

## Manifest partagé

`manifest.json` (à la racine) est **unique pour tout le dépôt** : c'est l'URL à utiliser
dans Jellyfin (Dashboard → Plugins → Catalogue → Réglages → Dépôts → Ajouter) pour
installer n'importe quel plugin publié ici.

```
https://raw.githubusercontent.com/babeley/jellyfin-plugins/main/manifest.json
```

Chaque workflow de release (un par plugin) ajoute ou met à jour l'entrée de son propre
plugin dans ce fichier via `jprm repo add` — les entrées des autres plugins sont
préservées.

## Plugins

- [`Catalogue/`](Catalogue/README.md) — bouton flottant qui ouvre un catalogue externe
  dans le client web Jellyfin.
