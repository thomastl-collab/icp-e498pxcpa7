# ICP — web app (PWA)

Appli hors ligne pour relever les Indicateurs de Condition Physique (Luc Léger, pompes, tractions, Killy, gainage, souplesse).
Toutes les données restent sur l'iPhone (stockage local du navigateur). Rien n'est envoyé en ligne.

## Mise en ligne sur GitHub Pages (gratuit)

1. Sur github.com, crée un dépôt public nommé `icp14`.
2. Bouton **Add file > Upload files** : glisse **tout le contenu** de ce dossier (index.html, app.js, style.css, sw.js,
   manifest.webmanifest, les dossiers `icons` et `vendor`). Puis **Commit changes**.
3. **Settings > Pages** : Source = *Deploy from a branch*, Branch = `main`, dossier `/ (root)`, **Save**.
4. Après 1 à 2 minutes, l'appli est en ligne sur `https://<ton-identifiant>.github.io/icp14/`.

## Installation sur l'iPhone

1. Ouvre l'adresse ci-dessus dans **Safari**.
2. Bouton **Partager > Sur l'écran d'accueil**.
3. Lance l'appli une fois depuis l'icône **avec du réseau** : elle se met en cache et marche ensuite hors ligne.

## Bon à savoir sur le terrain

- **Luc Léger** : garde l'appli ouverte et au premier plan, écran allumé. Si l'iPhone se verrouille ou si tu changes
  d'appli, le son s'arrête (limite des web apps sur iPhone). L'appli demande à l'écran de rester allumé pendant les tests.
- Pas de son ? Désactive le **mode silencieux** et monte le volume. Vérifie avec **Réglages > Test du son**.
- Connecte l'enceinte Bluetooth **avant** de lancer le test.
- Exporte la synthèse (CSV ou PDF) après chaque session : c'est ta sauvegarde.
- Ne supprime pas l'icône de l'écran d'accueil : cela effacerait les données.

## Mettre à jour l'appli

1. Remplace les fichiers modifiés dans le dépôt GitHub.
2. Dans `sw.js`, change la ligne `const CACHE = 'icp-v1.1.0';` (ex. `v1.1.1`) pour forcer la mise à jour.
3. Sur l'iPhone, ouvre l'appli avec du réseau, ferme-la puis rouvre-la.

Les données enregistrées ne sont pas touchées par une mise à jour.
