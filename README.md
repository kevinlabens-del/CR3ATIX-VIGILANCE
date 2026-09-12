# CR3@TIX VIGILANCE

Application web d'aide à la vigilance pour conducteurs, avec analyse locale de la caméra frontale.

## Version actuelle — V1.8

### Surveillance et détection
- détection du visage via MediaPipe Face Landmarker
- fermeture des yeux via EAR et calibration personnalisée
- PERCLOS glissant calculé selon le temps réel sur 60 secondes
- détection de bâillement avec durée minimale pour réduire les faux positifs
- carillon court lors d'un passage vers un état non vert
- alarme forte sirène / voix / les deux, avec sirène de secours si la voix n'est pas disponible
- acquittement temporaire : une alarme peut repartir si les yeux restent fermés

### Assistant de pause
- recommandations selon durée de trajet et signes récents de fatigue
- recommandations vocales génériques sans prénom
- pop-up indépendante de la caméra avec bouton Annuler la recommandation
- pause guidée 15 minutes, activable uniquement après confirmation que le véhicule est stationné

### V1.8 — maintien écran et reprise
- Screen Wake Lock demandé pendant une surveillance active lorsque l'appli est visible
- indication claire si Wake Lock est indisponible ou refusé
- détection du passage de l'application en arrière-plan
- état explicite « SURVEILLANCE SUSPENDUE » lorsque l'analyse ne peut plus être garantie
- reprise automatique au retour au premier plan
- vérification du flux vidéo lors de la reprise
- relance automatique de la caméra si le flux a été interrompu
- message visible confirmant la reprise ou signalant qu'une relance manuelle est nécessaire

### Interface et stockage
- mode Jour / Nuit / Auto
- calibration indépendante dans Paramètres
- journal, statistiques et export CSV
- réglages de détection et mode d'alarme mémorisés localement
- fallback GPU vers CPU si nécessaire
- cache local de l'interface via service worker

## Limites importantes

Le Wake Lock empêche l'écran de s'éteindre tant que la page reste visible et que le navigateur l'autorise. Il ne permet pas de garantir une analyse caméra continue lorsque Android place réellement le navigateur ou l'application en arrière-plan. Dans ce cas, VIGILANCE signale la suspension et tente une reprise automatique dès le retour au premier plan.

Le modèle MediaPipe est chargé depuis Internet. L'analyse vidéo est exécutée localement dans le navigateur ; le code de l'application n'envoie pas les images vers un serveur.

CR3@TIX VIGILANCE est une aide à la vigilance et n'est pas un dispositif de sécurité certifié. Une alerte ou une recommandation ne remplace jamais le repos, les règles de sécurité routière ni les obligations réglementaires applicables aux conducteurs professionnels.
