# CR3@TIX VIGILANCE

Application web d'aide à la vigilance pour conducteurs, avec analyse locale de la caméra frontale.

## Version actuelle — V1.7.2 Stabilisation

- détection du visage via MediaPipe Face Landmarker
- fermeture des yeux via EAR et calibration personnalisée
- PERCLOS glissant calculé selon le temps réel sur 60 secondes
- détection de bâillement avec durée minimale pour réduire les faux positifs
- carillon court lors d'un passage vers un état non vert
- alarme forte sirène / voix / les deux, avec sirène de secours si la voix n'est pas disponible
- acquittement temporaire : une alarme peut repartir si les yeux restent fermés
- recommandations de pause selon durée de trajet et signes récents de fatigue
- recommandations vocales génériques sans prénom
- pop-up de recommandation indépendante de la caméra avec bouton Annuler la recommandation
- pause guidée 15 minutes, activable uniquement après confirmation que le véhicule est stationné
- mode Jour / Nuit / Auto
- calibration indépendante dans Paramètres
- journal, statistiques et export CSV
- réglages de détection et mode d'alarme mémorisés localement
- fallback GPU vers CPU si nécessaire
- interface et cache local via service worker

## Important

Le modèle MediaPipe est chargé depuis Internet. L'analyse vidéo est exécutée localement dans le navigateur ; le code de l'application n'envoie pas les images vers un serveur.

CR3@TIX VIGILANCE est une aide à la vigilance et n'est pas un dispositif de sécurité certifié. Une alerte ou une recommandation ne remplace jamais le repos, les règles de sécurité routière ni les obligations réglementaires applicables aux conducteurs professionnels.
