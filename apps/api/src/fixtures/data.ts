import type { CourseStatus, CourseVisibility, Difficulty, ModuleInput } from '@pupitre/shared'

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
  /** Spec 049 (default 0). */
  xpRequired?: number
  /** Default 200. */
  completionXp?: number
  /** Generated courses: what the template modules talk about. */
  topic?: string
  /** Spec 106. */
  badge?: { name: string; icon: string }
  /** Spec 150. */
  inPerson?: boolean
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
    badge: { name: 'Pingouin du shell', icon: '🐧' },
  },
  {
    slug: 'git-essentials',
    title: 'Git au quotidien',
    description: 'Commits, branches, merge et rebase : le workflow Git pour travailler en équipe.',
    category: 'git',
    difficulty: 'beginner',
    visibility: 'public',
    status: 'published',
    badge: { name: 'Maître des branches', icon: '🌿' },
  },
  {
    slug: 'docker-intro',
    title: 'Introduction à Docker',
    description: 'Images, conteneurs, volumes et réseaux : conteneuriser une application pas à pas.',
    category: 'docker',
    difficulty: 'intermediate',
    visibility: 'public',
    status: 'published',
    badge: { name: 'Capitaine des conteneurs', icon: '🐋' },
  },
  {
    slug: 'kubernetes-basics',
    title: 'Kubernetes : les fondamentaux',
    description: 'Pods, deployments et services pour déployer vos conteneurs sur un cluster.',
    category: 'kubernetes',
    difficulty: 'intermediate',
    visibility: 'public',
    status: 'published',
    badge: { name: 'Pilote de pods', icon: '☸️' },
    inPerson: true,
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
    xpRequired: 200,
    completionXp: 300,
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

/** Spec 130: a small organisation. `manager` (known account) manages "Ingénierie"; generated managers the others. */
export const GROUPS: { name: string; description: string; parent?: string }[] = [
  { name: 'Ingénierie', description: 'Toutes les équipes techniques' },
  { name: 'Équipe Plateforme', description: 'Infrastructure, CI/CD et Kubernetes', parent: 'Ingénierie' },
  { name: 'Équipe Produit', description: 'Développement des applications', parent: 'Ingénierie' },
  { name: 'Support', description: 'Support client et exploitation' },
]

/** Spec 120: one course path and one skill path (members by course slug / skill slug). */
export const PATHS = [
  {
    slug: 'parcours-devops',
    title: 'Parcours DevOps',
    description: 'De Linux à Kubernetes : les bases pour déployer vos applications.',
    kind: 'course' as const,
    level: 'beginner' as const,
    items: ['linux-basics', 'git-essentials', 'docker-intro', 'kubernetes-basics'],
  },
  {
    slug: 'parcours-conteneurs',
    title: 'Maîtriser les conteneurs',
    description: 'Une suite de compétences, de Linux à l’orchestration.',
    kind: 'skill' as const,
    level: 'intermediate' as const,
    items: ['linux', 'docker', 'kubernetes'],
  },
]

/** Spec 150: sessions of the in-person curated course (fixed dates, so runs stay identical). */
export const SESSIONS = [
  { course: 'kubernetes-basics', title: 'Atelier Kubernetes — Groupe A', startsAt: '2026-11-05T09:00:00+01:00', location: 'Salle 3B, Paris', capacity: 12 },
  { course: 'kubernetes-basics', title: 'Atelier Kubernetes — Groupe B', startsAt: '2026-11-19T14:00:00+01:00', location: 'Salle 3B, Paris', capacity: 2 },
  { course: 'kubernetes-basics', title: 'Atelier Kubernetes — Lyon', startsAt: '2026-12-03T09:30:00+01:00', location: 'Campus Lyon, salle Rhône', capacity: null },
]

/** Reasons of the admin XP bonuses given to a few learners. */
export const XP_BONUSES = [
  { reason: 'Bonus : participation à l’atelier DevOps', amount: 50 },
  { reason: 'Bonus : aide apportée sur le forum', amount: 30 },
  { reason: 'Correction : XP attribués en double', amount: -20 },
]

/** Spec 015: generated students share this password. */
export const STUDENT_PASSWORD = 'Student@1234'
export const MANAGER_PASSWORD = 'Manager@1234'

// ─── Modules (spec 191) ───────────────────────────────────────────────────────

/** Badge icons of generated courses, by category slug. */
export const CATEGORY_BADGE_ICONS: Record<string, string> = {
  devops: '⚙️',
  docker: '🐋',
  kubernetes: '☸️',
  git: '🌿',
  linux: '🐧',
  programming: '📦',
  python: '🐍',
  networking: '🌐',
  database: '🗄️',
  security: '🛡️',
  cloud: '☁️',
}

const repo = (name: string) => `https://git.example.com/pupitre/${name}.git`
const source = (name: string, path: string) => ({ kind: 'source' as const, repo: repo(name), ref: 'main', path })

/** Modules of the curated courses: files of `content-samples/` (fake loader) and text written in the platform. */
export const CURATED_MODULES: Record<string, ModuleInput[]> = {
  'docker-intro': [
    { slug: 'conteneurs', name: 'Qu’est-ce qu’un conteneur ?', type: 'text', skills: ['docker', 'conteneurs'], content: source('pupitre-docker', '01-conteneurs.md') },
    { slug: 'images', name: 'Les images', type: 'text', skills: ['docker'], content: source('pupitre-docker', '02-images.md') },
    { slug: 'mini-quiz-images', name: 'Mini-quiz : les images', type: 'quiz', inline: true, content: source('pupitre-docker', 'mini-quiz-images.yaml') },
    { slug: 'volumes', name: 'Volumes et réseaux', type: 'text', skills: ['docker', 'reseau'], content: source('pupitre-docker', '03-volumes.md') },
    {
      slug: 'notes-formateur',
      name: 'Notes du formateur',
      type: 'text',
      hidden: true,
      content: { kind: 'inline', body: '# Notes du formateur\n\nPrévoir 10 minutes de démonstration sur `docker ps -a`.' },
    },
    { slug: 'quiz-final', name: 'Quiz final', type: 'quiz', skills: ['docker'], prerequisites: ['volumes'], content: source('pupitre-docker', 'quiz-docker.yaml') },
  ],
  'linux-basics': [
    { slug: 'shell', name: 'Le shell', type: 'text', skills: ['linux', 'bash'], content: source('pupitre-linux', '01-shell.md') },
    { slug: 'permissions', name: 'Droits et utilisateurs', type: 'text', skills: ['linux', 'securite'], content: source('pupitre-linux', '02-permissions.md') },
    { slug: 'quiz', name: 'Quiz', type: 'quiz', skills: ['linux'], content: source('pupitre-linux', 'quiz-linux.yaml') },
  ],
  'git-essentials': [
    { slug: 'commits', name: 'Commits', type: 'text', skills: ['git'], content: source('pupitre-git', '01-commits.md') },
    { slug: 'branches', name: 'Branches', type: 'text', skills: ['git'], content: source('pupitre-git', '02-branches.md') },
    { slug: 'quiz', name: 'Quiz', type: 'quiz', skills: ['git'], content: source('pupitre-git', 'quiz-git.yaml') },
  ],
  'kubernetes-basics': [
    {
      slug: 'pods',
      name: 'Les pods',
      type: 'text',
      skills: ['kubernetes', 'conteneurs'],
      content: {
        kind: 'inline',
        body: '# Les pods\n\nUn **pod** regroupe un ou plusieurs conteneurs qui partagent le réseau et le stockage.\n\n```yaml\napiVersion: v1\nkind: Pod\nmetadata:\n  name: web\nspec:\n  containers:\n    - name: nginx\n      image: nginx:1.27\n```\n',
      },
    },
    // A source that doesn't exist: shows the "content unavailable" state (spec 064).
    { slug: 'services', name: 'Les services', type: 'text', content: source('pupitre-kubernetes', '02-services.md') },
  ],
}

/** Modules of every other course: two lessons and a quiz, written in the platform from templates. */
export function templateModules(topic: string, difficulty: Difficulty, skills: string[] = []): ModuleInput[] {
  const levels = { beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'avancé' } as const
  return [
    {
      slug: 'presentation',
      name: 'Présentation',
      type: 'text',
      skills,
      content: {
        kind: 'inline',
        body: `# Présentation\n\nCe cours de niveau **${levels[difficulty]}** vous fait découvrir ${topic}.\n\n## Objectifs\n\n- comprendre à quoi sert ${topic} ;\n- l’installer et le configurer ;\n- l’utiliser sur un cas concret.\n\n:::tip Prérequis\nSavoir utiliser un terminal et un éditeur de texte.\n:::\n`,
      },
    },
    {
      slug: 'pratique',
      name: 'Mise en pratique',
      type: 'text',
      skills,
      content: {
        kind: 'inline',
        body: `# Mise en pratique\n\nInstallons ${topic} dans un conteneur jetable :\n\n\`\`\`bash\ndocker run --rm -it ubuntu:24.04 bash\n\`\`\`\n\n## Exercice\n\nReproduisez l’exemple du cours, puis adaptez-le à votre projet.\n`,
      },
    },
    {
      slug: 'quiz',
      name: 'Quiz',
      type: 'quiz',
      skills,
      content: {
        kind: 'inline',
        body: [
          'passingScore: 60',
          'questions:',
          '  - id: sujet',
          '    type: boolean',
          `    question: "Ce cours porte sur ${topic}."`,
          '    correctAnswer: true',
          '  - id: niveau',
          '    type: single',
          '    question: "Quel est le niveau de ce cours ?"',
          '    answers:',
          ...(['beginner', 'intermediate', 'advanced'] as const).map(
            (d) => `      - { id: ${d}, text: "${levels[d]}"${d === difficulty ? ', correct: true' : ''} }`,
          ),
        ].join('\n'),
      },
    },
  ]
}
