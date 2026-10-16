# Commits

Un **commit** enregistre un instantané de votre projet, avec un message qui explique *pourquoi* le changement a été
fait.

## Le cycle de base

```bash
git status                 # que s'est-il passé ?
git add src/app.ts         # préparer un fichier
git commit -m "fix: corrige le calcul des XP"
git log --oneline          # historique condensé
```

:::tip Messages de commit
Décrivez l'intention, pas le diff : « corrige le calcul des XP » plutôt que « modifie app.ts ».
:::

## Annuler

| Besoin | Commande |
|---|---|
| retirer un fichier de l'index | `git restore --staged fichier` |
| annuler des modifications locales | `git restore fichier` |
| annuler un commit publié | `git revert <sha>` |
