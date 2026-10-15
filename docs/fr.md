# Healthchecks

[Healthchecks](https://healthchecks.io/) surveille vos tâches planifiées : une
tâche cron, une sauvegarde, un renouvellement de certificat ou n'importe quel
script « pingue » une adresse quand il tourne, et Healthchecks donne l'alerte
quand le ping n'arrive pas. Cette intégration amène les contrôles d'un projet
Healthchecks dans Gladys, que vous utilisiez healthchecks.io ou votre propre
serveur : chaque contrôle devient un appareil avec son état, son dernier ping et
le prochain attendu. Des scènes peuvent réagir quand **n'importe quel**
contrôle tombe en panne, prend du retard ou se rétablit, un widget liste les
contrôles en panne d'abord, et des scènes peuvent mettre en pause, reprendre ou
pinguer un contrôle.

Testée contre un vrai Healthchecks v4.4 auto-hébergé (Docker) ; pas encore sur
healthchecks.io lui-même : vos retours sont bienvenus sur
[les issues](https://github.com/guim31/gladys-healthchecks/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un projet Healthchecks : sur [healthchecks.io](https://healthchecks.io/)
  (offre gratuite comprise) ou sur votre propre serveur Healthchecks, joignable
  depuis la machine de Gladys.
- Une clé d'API du projet. La clé **en lecture seule** suffit pour suivre les
  contrôles ; la clé **complète** permet aussi la pause, la reprise et
  « Envoyer un ping ».

L'intégration fait une requête par intervalle de rafraîchissement (une minute
par défaut) : bien en dessous de ce qu'accepte healthchecks.io.

## Mise en route

### 1. Créer une clé d'API

Dans Healthchecks, ouvrez votre projet, puis **Settings** → **API Access** →
**Create API Keys**. Deux clés apparaissent : la complète (« API key ») et celle
en lecture seule. Copiez celle que vous voulez : Healthchecks la réaffiche plus
tard, mais gardez-la pour vous.

### 2. Configurer l'intégration

Dans Gladys, ouvrez **Intégrations → Healthchecks → Configuration** :

- **Adresse de Healthchecks** : `https://healthchecks.io` (par défaut), ou
  l'adresse de votre serveur, celle de son réglage `SITE_ROOT` (par exemple
  `http://192.168.1.2:8000`).
- **Clé d'API** : la clé copiée plus haut.
- **Intervalle de rafraîchissement** : de 30 secondes à 5 minutes.
- **Langue des noms** : langue des noms des fonctionnalités, des états et des
  résultats de scène (français par défaut).

Enregistrez, puis cliquez sur **Tester la connexion** : le résultat donne le
nombre de contrôles, ceux en panne ou en retard, et signale une clé en lecture
seule.

### 3. Ajouter les contrôles

Ouvrez l'onglet **Découverte** : un appareil « Healthchecks » résume le projet,
et chaque contrôle est proposé sous son nom. Ajoutez ceux que vous voulez voir
dans Gladys. Les déclencheurs de scène valent pour tous les contrôles, ajoutés
ou non.

## Les appareils

Chaque contrôle devient un appareil avec :

- **État** : À l'heure, En retard, En panne, En cours, En pause ou Nouveau, en
  texte.
- **Fonctionne** : Non (rouge) quand le contrôle est en panne, Oui (vert) sinon
  (à l'heure, en retard, en cours, nouveau ou en pause). Pratique comme
  condition de scène.
- **Dernier ping** : jour/mois et heure du dernier ping.
- **Prochain ping attendu** : quand le contrôle passera en retard sans nouveau
  ping ; « - » quand rien n'est attendu (contrôle en panne, en pause ou
  nouveau).
- **Pings reçus** : le compteur de Healthchecks.
- **Durée de la dernière exécution** : en secondes, entre les signaux « start »
  et « success », pour les contrôles qui envoient un signal de début
  (`/start`).

L'appareil **Healthchecks** du projet compte les **Contrôles en panne**, les
**Contrôles en retard** et les **Contrôles au total**.

Dernier ping, prochain ping, pings et durée sont envoyés au plus toutes les 5
minutes par contrôle (tout de suite quand l'état change), pour rester dans les
limites de Gladys.

## Tableau de bord

Le widget **Healthchecks** affiche trois tuiles (en panne, en retard, à
l'heure), puis une ligne par contrôle : en panne d'abord, puis en retard, puis
en cours, nouveaux, en pause et à l'heure, avec l'état et le dernier ping. Dix
lignes au plus ; le reste est compté. Dans les réglages du widget, choisissez
des contrôles pour n'afficher qu'eux (appareils ajoutés à Gladys). Le bouton
**Actualiser** relit Healthchecks.

## Scènes

### Déclencheurs

- **Un contrôle tombe en panne** : pas de ping avant la fin de son délai de
  grâce, ou un signal d'échec (`/fail`). Variables : nom du contrôle,
  étiquettes, dernier ping.
- **Un contrôle est rétabli** : un contrôle en panne reçoit de nouveau un ping.
  Variables : les mêmes, plus la durée de la panne en minutes.
- **Un contrôle est en retard** : le ping attendu n'est pas venu et le délai de
  grâce commence : encore le temps d'agir avant la panne.

Chaque déclencheur peut se limiter à certains contrôles (vide : tous). L'état
est gardé dans le volume `/data` : un contrôle tombé en panne pendant un
redémarrage de Gladys ou de l'intégration est annoncé une fois à la lecture
suivante. Rien n'est annoncé à la première lecture, ni pour un contrôle mis en
pause, repris ou en cours.

### Actions

- **État d'un contrôle** : donne `down` (oui/non), l'état en toutes lettres
  (`state`), le nom (`name`), le dernier ping (`last_ping`) et une phrase toute
  prête (`sentence`), par exemple « Sauvegarde : En panne, dernier ping 14/10
  03:12. ».
- **Compter les contrôles en panne** : en panne, en retard, au total, et les
  noms des contrôles en panne.
- **Mettre un contrôle en pause** et **Reprendre un contrôle** : pour une
  maintenance prévue (clé d'API complète). Un contrôle repris attend son
  prochain ping.
- **Envoyer un ping** : envoie le signal de succès d'un contrôle (clé d'API
  complète), pour qu'une scène Gladys signale elle-même qu'elle a tourné.

### Idées de scènes

- Quand **Un contrôle tombe en panne**, limité aux contrôles de sauvegarde dans
  son champ Contrôles, envoyer un message Telegram « La sauvegarde n'a pas
  tourné, dernier ping {{last_ping}} ».
- Chaque matin à 8 h, **Compter les contrôles en panne** et, s'il y en a au
  moins un, lire leurs noms sur l'enceinte.
- Dans une scène nocturne de Gladys (arrosage, programmation du chauffage…),
  finir par **Envoyer un ping** à un contrôle dédié : Healthchecks vous prévient
  si Gladys elle-même a cessé de la lancer.
- Avant d'éteindre le NAS pour une maintenance, **Mettre un contrôle en pause**
  pour la sauvegarde, puis **Reprendre un contrôle** à son retour.

## Dépannage

- **Clé d'API refusée** : recopiez la clé depuis Settings → API Access du bon
  projet ; chaque projet a ses propres clés.
- **Aucun Healthchecks à cette adresse** : vérifiez l'adresse ; pour votre
  propre serveur, c'est celle de `SITE_ROOT`, avec son sous-chemin s'il en a
  un.
- **L'adresse redirige** : saisissez l'adresse finale, souvent en `https://`.
  L'intégration ne suit pas les redirections, pour que la clé ne parte jamais
  ailleurs.
- **Certificat refusé** : un certificat auto-signé n'est pas accepté ; utilisez
  l'adresse en `http://` sur le réseau local, ou un certificat reconnu.
- **Il faut la clé d'API complète** : pause, reprise et ping demandent la clé
  complète, pas celle en lecture seule.
- **Envoyer un ping échoue sur un serveur auto-hébergé** : l'adresse de ping est
  construite par Healthchecks à partir de son réglage `PING_ENDPOINT` (ou
  `SITE_ROOT`) ; Gladys doit pouvoir la joindre.

## Limites

- Un projet par configuration (une clé d'API = un projet).
- L'intégration lit Healthchecks : un contrôle ne se crée ni ne se modifie
  depuis Gladys.
- Une courte panne entre deux lectures peut passer inaperçue dans les états des
  appareils ; Healthchecks garde tout l'historique.
- « En cours » (un signal de début sans sa fin) ne change pas l'état suivi par
  les déclencheurs.
- Développée sans accès à un compte healthchecks.io : testée contre le serveur
  auto-hébergé (même API). Vos retours sont bienvenus.
