# Le shell

Le **shell** interprète les commandes que vous tapez. Sur la plupart des distributions, il s'agit de `bash`.

## Se déplacer

```bash
pwd              # où suis-je ?
ls -la           # contenu du dossier, fichiers cachés compris
cd /var/log      # aller dans un dossier
cd ~             # revenir à son dossier personnel
```

## Manipuler des fichiers

| Commande | Effet |
|---|---|
| `cp a b` | copie `a` vers `b` |
| `mv a b` | déplace ou renomme |
| `rm a` | supprime |
| `mkdir -p x/y` | crée l'arborescence |

:::danger Prudence
`rm -rf` supprime sans confirmation ni corbeille. Relisez toujours la commande avant de valider.
:::

## Rediriger les sorties

```bash
journalctl -u nginx > nginx.log      # écrase le fichier
echo "fin" >> nginx.log              # ajoute à la fin
grep error nginx.log | wc -l         # enchaîne deux commandes
```
