# CR3@TIX VIGILANCE

Prototype fonctionnel d'une appli web anti-somnolence, réimplémentée de zéro avec une identité CR3@TIX.

## Fonctions
- caméra frontale
- détection visage via MediaPipe Face Landmarker
- EAR (Eye Aspect Ratio) pour ouverture/fermeture des yeux
- alerte après délai configurable
- PERCLOS glissant sur 60 secondes
- détection de bâillement
- calibration personnalisée 3 secondes
- sirène générée localement
- enregistrement d'un message vocal 5 secondes
- journal d'alertes et export CSV
- statistiques du jour dans localStorage
- historique visuel 30 secondes
- installation comme appli depuis le navigateur compatible
- cache local de l'interface via service worker

## Lancer
La caméra exige un contexte sécurisé :
- déployer sur Netlify / GitHub Pages / autre HTTPS ; ou
- lancer en local sur `localhost`.

Ne pas ouvrir simplement `index.html` en `file://` si la caméra est bloquée.

## Important
Le modèle MediaPipe est chargé depuis Internet au premier lancement. L'analyse vidéo se fait ensuite dans le navigateur ; aucune image n'est envoyée par le code de l'appli.

Cette appli est une aide de vigilance et n'est pas un dispositif de sécurité certifié. En cas de fatigue au volant, il faut s'arrêter dans un endroit sûr et se reposer.

## Correctif v1.1
- calibration rendue robuste avec compte à rebours visible
- validation explicite de la détection du visage
- messages d’échec détaillés
- restauration correcte du bouton après calibration ou arrêt caméra
- confirmation visuelle après calibration réussie
