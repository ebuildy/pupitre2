// French is the default language and the reference: every other locale must have the same keys.

export const common = {
  logout: 'Déconnexion',
  signIn: 'Se connecter',
  adminButton: '⚙ Admin',
  backToCatalogue: 'Retour au catalogue',
  accessDenied: {
    title: 'Accès refusé',
    body: "Vous n'avez pas les droits nécessaires pour accéder à cette page.",
  },
  language: 'Langue',
  // Spec 018
  roles: {
    student: 'Étudiant',
    manager: 'Manager de groupe',
    admin: 'Administrateur',
  },
  difficulty: {
    beginner: 'Débutant',
    intermediate: 'Intermédiaire',
    advanced: 'Avancé',
  },
}

export const auth = {
  login: {
    identifierLabel: 'Identifiant ou e-mail',
    identifierPlaceholder: 'identifiant ou e-mail',
    passwordLabel: 'Mot de passe',
    passwordPlaceholder: 'mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    errors: {
      emptyFields: 'Veuillez remplir tous les champs',
      invalidCredentials: 'Identifiant ou mot de passe incorrect',
      generic: 'Erreur de connexion',
    },
  },
}

export const app = {
  pages: {
    catalogue: 'Catalogue',
    myCourses: 'Mes cours',
  },
}

export const admin = {
  title: 'Administration',
  nav: {
    dashboard: 'Tableau de bord',
  },
  dashboard: {
    title: 'Tableau de bord',
  },
}
