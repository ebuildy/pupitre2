# Volumes et réseaux

Le système de fichiers d'un conteneur est **éphémère** : il disparaît avec lui. Pour conserver des données, on monte un
**volume**.

## Volumes nommés

```bash
docker volume create pgdata
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:17
```

## Montages de dossiers (bind mounts)

```bash
docker run --rm -v "$PWD":/src -w /src node:24-alpine node --version
```

:::info
Les volumes nommés sont gérés par Docker et portables ; les *bind mounts* dépendent de l'arborescence de l'hôte.
:::

## Réseaux

Les conteneurs d'un même réseau utilisateur se joignent par leur **nom** :

```bash
docker network create app
docker run -d --name db --network app postgres:17
docker run -d --name api --network app -e DATABASE_HOST=db registry.example.com/demo/api:1.0
```
