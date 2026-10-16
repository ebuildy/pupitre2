import type { CourseStatus, CourseVisibility, Difficulty } from '@pupitre/shared'

/** Category tree, parents first. */
export const CATEGORIES: { slug: string; title: string; parent?: string }[] = [
  { slug: 'devops', title: 'DevOps' },
  { slug: 'docker', title: 'Docker', parent: 'devops' },
  { slug: 'kubernetes', title: 'Kubernetes', parent: 'devops' },
  { slug: 'git', title: 'Git', parent: 'devops' },
  { slug: 'linux', title: 'Linux' },
  { slug: 'programming', title: 'Programmation' },
  { slug: 'python', title: 'Python', parent: 'programming' },
  { slug: 'networking', title: 'Réseaux' },
  { slug: 'database', title: 'Bases de données' },
  { slug: 'security', title: 'Sécurité' },
  { slug: 'cloud', title: 'Cloud' },
]

export type CourseFixture = {
  slug: string
  title: string
  description: string
  category: string
  difficulty: Difficulty
  visibility: CourseVisibility
  status: CourseStatus
}

/** Hand-written courses, one per visibility/status case; stable slugs to use in docs and manual tests. */
export const CURATED_COURSES: CourseFixture[] = [
  {
    slug: 'linux-basics',
    title: 'Les bases de Linux',
    description: 'Naviguer dans le système de fichiers, gérer les droits et écrire vos premiers scripts shell.',
    category: 'linux',
    difficulty: 'beginner',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'git-essentials',
    title: 'Git au quotidien',
    description: 'Commits, branches, merge et rebase : le workflow Git pour travailler en équipe.',
    category: 'git',
    difficulty: 'beginner',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'docker-intro',
    title: 'Introduction à Docker',
    description: 'Images, conteneurs, volumes et réseaux : conteneuriser une application pas à pas.',
    category: 'docker',
    difficulty: 'intermediate',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'kubernetes-basics',
    title: 'Kubernetes : les fondamentaux',
    description: 'Pods, deployments et services pour déployer vos conteneurs sur un cluster.',
    category: 'kubernetes',
    difficulty: 'intermediate',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'python-automation',
    title: 'Automatiser avec Python',
    description: 'Écrire des scripts Python pour automatiser les tâches d’administration.',
    category: 'python',
    difficulty: 'beginner',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'web-security',
    title: 'Sécurité des applications web',
    description: 'Les failles OWASP les plus courantes et comment s’en protéger.',
    category: 'security',
    difficulty: 'advanced',
    visibility: 'public',
    status: 'published',
  },
  {
    slug: 'internal-onboarding',
    title: 'Onboarding interne',
    description: 'Cours privé : accessible uniquement sur inscription par un administrateur.',
    category: 'devops',
    difficulty: 'beginner',
    visibility: 'private',
    status: 'published',
  },
  {
    slug: 'terraform-draft',
    title: 'Terraform (brouillon)',
    description: 'Cours en préparation, visible uniquement des administrateurs.',
    category: 'cloud',
    difficulty: 'intermediate',
    visibility: 'public',
    status: 'draft',
  },
  {
    slug: 'legacy-svn',
    title: 'Subversion (archivé)',
    description: 'Ancien cours conservé pour l’historique des apprenants inscrits.',
    category: 'git',
    difficulty: 'beginner',
    visibility: 'public',
    status: 'archived',
  },
]

/** Topics of generated courses, by category slug. Proper nouns, so they fit every title template. */
export const TOPICS: Record<string, string[]> = {
  devops: ['Ansible', 'Prometheus'],
  docker: ['Docker Compose', 'Podman'],
  kubernetes: ['Helm', 'Argo CD'],
  git: ['GitLab CI', 'GitHub Actions'],
  linux: ['Bash', 'systemd'],
  programming: ['TypeScript', 'Go'],
  python: ['FastAPI', 'pandas'],
  networking: ['TCP/IP', 'Wireshark'],
  database: ['PostgreSQL', 'Redis'],
  security: ['Burp Suite', 'Vault'],
  cloud: ['AWS', 'OpenStack'],
}

export const COURSE_TEMPLATES: {
  difficulty: Difficulty
  title: (topic: string) => string
  description: (topic: string) => string
}[] = [
  {
    difficulty: 'beginner',
    title: (t) => `Premiers pas avec ${t}`,
    description: (t) => `Découvrez ${t} pas à pas : installation, concepts clés et premiers exercices guidés.`,
  },
  {
    difficulty: 'beginner',
    title: (t) => `${t} : les fondamentaux`,
    description: (t) => `Les notions indispensables de ${t}, illustrées par des exemples concrets.`,
  },
  {
    difficulty: 'intermediate',
    title: (t) => `${t} en pratique`,
    description: (t) => `Mettez ${t} en œuvre sur un projet réaliste, du poste de développement à la production.`,
  },
  {
    difficulty: 'intermediate',
    title: (t) => `Atelier ${t}`,
    description: (t) => `Un atelier pratique pour consolider vos acquis sur ${t} avec des cas d’usage variés.`,
  },
  {
    difficulty: 'advanced',
    title: (t) => `Maîtriser ${t}`,
    description: (t) => `Bonnes pratiques, performances et pièges à éviter : passez au niveau expert sur ${t}.`,
  },
]

/** Known accounts, easy to remember for manual testing (the admin comes from the bootstrap, spec 016). */
export const KNOWN_USERS = [
  { username: 'etudiant', name: 'Élise Étudiante', email: 'etudiant@pupitre.local', role: 'student', password: 'Student@1234' },
  { username: 'manager', name: 'Marc Manager', email: 'manager@pupitre.local', role: 'manager', password: 'Manager@1234' },
  { username: 'inactif', name: 'Ines Inactive', email: 'inactif@pupitre.local', role: 'student', password: 'Student@1234', isActive: false },
] as const

/** Spec 015: generated students share this password. */
export const STUDENT_PASSWORD = 'Student@1234'
export const MANAGER_PASSWORD = 'Manager@1234'
