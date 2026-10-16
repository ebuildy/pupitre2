# Les images

Une **image** est un modèle en lecture seule, composé de **couches** empilées. Chaque instruction d'un `Dockerfile`
produit une couche, mise en cache et réutilisée par les constructions suivantes.

## Écrire un Dockerfile

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
CMD ["node", "server.js"]
```

:::tip Ordre des instructions
Copiez d'abord les fichiers qui changent rarement (dépendances), puis le code : le cache des couches est conservé
tant que les fichiers copiés ne changent pas.
:::

## Construire et publier

```bash
docker build -t registry.example.com/demo/api:1.0 .
docker push registry.example.com/demo/api:1.0
```

## Tags et digests

Un tag (`1.0`, `latest`) est une étiquette **mobile** ; un digest (`sha256:…`) désigne une image **immuable**.
En production, épinglez vos images par digest.
