# Branches

Une branche est un **pointeur mobile** vers un commit. Créer une branche ne copie rien : c'est instantané.

## Travailler sur une branche

```bash
git switch -c feat/quiz
# … commits …
git switch main
git merge --ff-only feat/quiz
```

## Merge ou rebase ?

- `merge` conserve l'historique tel quel et crée un commit de fusion si nécessaire ;
- `rebase` rejoue vos commits sur la branche cible pour un historique linéaire.

:::warning Règle d'or
Ne rebasez jamais une branche déjà partagée avec d'autres personnes.
:::
