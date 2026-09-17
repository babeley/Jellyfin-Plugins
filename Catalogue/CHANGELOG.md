# Changelog — Catalogue

Historique complet du plugin. `build.yaml` ne contient que l'entrée de la version en
cours de packaging (voir pourquoi dans le README, section "Publier une nouvelle
version") : c'est ce fichier-ci qu'il faut lire pour l'historique complet.

## 1.3.1.0

Nouvelle icône (boîte à fiches). Corrige la superposition avec le bouton recherche de
Jellyfin : le calcul de position ciblait "le dernier élément cliquable du bandeau", pas
fiable si un autre bouton se trouve après l'avatar dans le DOM. Cible maintenant
précisément l'avatar via sa classe MUI dédiée (.MuiAvatar-root).

## 1.3.0.0

Corrige un bug sérieux : insérer le bouton comme enfant réel du bandeau React cassait
parfois la réconciliation de React et affichait un second bandeau en double
(typiquement en naviguant vers une fiche). Le bouton n'est plus du tout inséré dans le
bandeau : il reste hors de l'arbre React (comme au tout début du plugin), positionné en
`fixed` juste à gauche de l'avatar par un calcul de position dynamique, recalculé au
redimensionnement et périodiquement. Toujours icône seule avec infobulle (plus de
libellé "Catalogue"/"Fermer" en toutes lettres), et position identique sur toutes les
vues, y compris le tableau de bord.

## 1.2.1.0

Nouvelle icône (classeur, plus explicite qu'une simple liste). Le repli hors de la
ligne de navigation (barre d'icônes, bouton flottant) est maintenant sans libellé avec
infobulle, au lieu de toujours afficher "Catalogue" en toutes lettres. L'état "Fermer"
est nettement accentué (fond bleu) quelle que soit la position du bouton. Corrige les
menus déroulants de Jellyfin (Plus, avatar) qui s'affichaient derrière la
surimpression : son z-index était plus élevé que celui des menus, alors qu'il suffit
qu'il dépasse le contenu normal de la page.

## 1.2.0.0

Le bouton (icône + libellé "Catalogue", plus de bulle d'aide) s'insère maintenant dans
la ligne de liens du bandeau (juste après le logo), avec repli sur la barre d'icônes
puis sur un bouton flottant si introuvable. Le même bouton sert à fermer la
surimpression (devient "Fermer"), qui occupe maintenant tout l'espace sous le bandeau
sans marge. La surimpression se ferme automatiquement dès qu'on change de vue dans
Jellyfin.

## 1.1.0.0

Le bouton s'intègre maintenant dans le bandeau Jellyfin (à côté des icônes
cast/recherche/avatar) au lieu de flotter en bas à droite, avec repli automatique en
bouton flottant si le bandeau n'est pas trouvé. Quand "Ouvrir dans un nouvel onglet"
est désactivé, le catalogue s'affiche maintenant dans une iframe en surimpression qui
garde le bandeau Jellyfin visible, au lieu de remplacer complètement la page.

## 1.0.2.0

Corrige la version affichée par Jellyfin (0.0.0.0 au lieu de la vraie version) : le
csproj désactivait la génération d'AssemblyInfo sans fournir de remplacement, donc le
binaire compilé n'avait jamais de numéro de version.

## 1.0.1.0

Corrige l'enregistrement des réglages : la page de config utilisait un `<script>` qui
n'est jamais exécuté par la disposition Modern de Jellyfin 12 (le HTML s'affiche mais
aucun script séparé ne tourne). La logique est déplacée dans des attributs
onload/onsubmit inline, qui sont bien exécutés dans ce contexte.

## 1.0.0.0

Version initiale. Bouton flottant configurable (URL + ouverture nouvel onglet/fenêtre
courante).
