# Qu'est-ce qu'un conteneur ?

Un **conteneur** est un processus isolé qui embarque son application et toutes ses dépendances. Contrairement à une
machine virtuelle, il partage le noyau de l'hôte : il démarre en quelques millisecondes et consomme peu de mémoire.

## Conteneur ou machine virtuelle ?

| | Conteneur | Machine virtuelle |
|---|---|---|
| Isolation | processus (namespaces, cgroups) | matériel virtualisé |
| Démarrage | millisecondes | minutes |
| Taille | quelques Mo | plusieurs Go |
| Noyau | partagé avec l'hôte | propre à la VM |

:::tip Bon à savoir
Docker n'est qu'un outil parmi d'autres : Podman, containerd ou CRI-O exécutent les mêmes images au format **OCI**.
:::

## Votre premier conteneur

Lancez un conteneur Alpine interactif :

```bash
docker run --rm -it alpine:3.20 sh
```

- `--rm` supprime le conteneur à sa sortie ;
- `-it` attache un terminal interactif ;
- `alpine:3.20` est l'**image** utilisée.

### Lister les conteneurs

```bash
docker ps        # conteneurs en cours d'exécution
docker ps -a     # tous les conteneurs, y compris arrêtés
```

:::warning Attention
Un conteneur arrêté conserve son système de fichiers tant qu'il n'est pas supprimé : pensez à `docker rm`.
:::
