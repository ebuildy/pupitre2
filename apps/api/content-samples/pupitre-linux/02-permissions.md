# Droits et utilisateurs

Chaque fichier appartient à un **utilisateur** et à un **groupe**, et porte trois séries de droits : pour le
propriétaire, le groupe et les autres.

## Lire les droits

```text
-rwxr-x--- 1 alice devs 4096 oct. 16 deploy.sh
 └┬┘└┬┘└┬┘
  │  │  └── autres : aucun droit
  │  └───── groupe : lecture et exécution
  └──────── propriétaire : lecture, écriture, exécution
```

## Modifier les droits

```bash
chmod u+x deploy.sh     # rendre exécutable pour le propriétaire
chmod 750 deploy.sh     # rwx r-x ---
chown alice:devs deploy.sh
```

:::note Notation octale
`r` = 4, `w` = 2, `x` = 1 : `7` = rwx, `5` = r-x, `0` = aucun droit.
:::
