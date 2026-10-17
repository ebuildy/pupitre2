import { apiClient, expect, signIn, test, uid } from './fixtures.ts'

test.describe('registration (specs 020–022)', () => {
  test('a visitor creates an account from the login page and is signed in', async ({ page }) => {
    const name = `new_${uid()}`
    await page.goto('/login')
    await page.getByRole('link', { name: 'Créer un compte' }).click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByText('Créez votre compte pour commencer')).toBeVisible()

    await page.getByLabel("Nom d'utilisateur").fill(name)
    await page.getByLabel('Email').fill(`${name}@example.test`)
    await page.getByLabel('Mot de passe', { exact: true }).fill('court')
    // Live checklist from the public password policy (default: 8 characters).
    const rules = page.getByTestId('password-rules')
    await expect(rules.getByText('Au moins 8 caractères')).not.toContainText('✓')
    await page.getByLabel('Mot de passe', { exact: true }).fill('Password123!')
    await expect(rules.getByRole('listitem').first()).toContainText('✓')

    await page.getByLabel('Confirmer le mot de passe').fill('Password123')
    await expect(page.getByText('Les mots de passe ne correspondent pas')).toBeVisible()
    await page.getByLabel('Confirmer le mot de passe').fill('Password123!')
    await expect(page.getByText('Les mots de passe ne correspondent pas')).toBeHidden()

    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await expect(page).toHaveURL(/\/courses$/)
    await expect(page.getByTestId('current-user')).toHaveText(name)
    const me = await (await page.request.get('/api/me')).json()
    expect(me).toMatchObject({ username: name, role: 'student', hasPassword: true })
  })

  test('an e-mail or username already used is refused', async ({ page, createUser }) => {
    const existing = await createUser()
    await page.goto('/register')
    await page.getByLabel("Nom d'utilisateur").fill(`other_${uid()}`)
    await page.getByLabel('Email').fill(existing.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('Password123!')
    await page.getByLabel('Confirmer le mot de passe').fill('Password123!')
    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await expect(page.getByRole('alert')).toHaveText("Email ou nom d'utilisateur déjà utilisé")

    await page.getByLabel("Nom d'utilisateur").fill(existing.username)
    await page.getByLabel('Email').fill(`other-${uid()}@example.test`)
    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await expect(page.getByRole('alert')).toHaveText("Email ou nom d'utilisateur déjà utilisé")
  })

  test('a signed-in user opening /register lands on the catalogue', async ({ page, createUser }) => {
    await signIn(page, await createUser())
    await page.goto('/register')
    await expect(page).toHaveURL(/\/courses$/)
  })

  test('the API refuses a short username', async () => {
    const api = await apiClient()
    const res = await api.post('/api/auth/sign-up/email', {
      data: { name: 'ab', username: 'ab', email: `ab-${uid()}@example.test`, password: 'Password123!' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toBe('Username must be at least 3 characters')
    await api.dispose()
  })
})

test.describe('profile (specs 035, 036)', () => {
  test('the user edits their display name, bio and username', async ({ page, createUser }) => {
    const user = await createUser()
    await signIn(page, user)
    await page.getByRole('link', { name: 'Mon profil' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByTestId('profile-username')).toHaveText(user.username)

    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    const newName = `renamed_${uid()}`
    await page.getByLabel("Nom d'utilisateur").fill(newName)
    await page.getByLabel('Nom affiché').fill('Camille Martin')
    await page.getByLabel('Bio').fill('J’apprends Kubernetes.')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByText('Profil mis à jour')).toBeVisible()
    await expect(page.getByText('J’apprends Kubernetes.')).toBeVisible()
    await expect(page.getByTestId('profile-username')).toHaveText(newName)
    // The top bar follows (session refreshed).
    await expect(page.getByTestId('current-user')).toHaveText(newName)
    // The new username signs in.
    expect((await (await page.request.get('/api/me')).json()).bio).toBe('J’apprends Kubernetes.')
  })

  test('a username already taken is refused', async ({ page, createUser }) => {
    const other = await createUser()
    await signIn(page, await createUser())
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByLabel("Nom d'utilisateur").fill(other.username)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('alert')).toHaveText("Nom d'utilisateur déjà utilisé")
  })

  test('the avatar can be set to an image URL and removed', async ({ page, createUser }) => {
    await signIn(page, await createUser())
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Modifier la photo de profil' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('URL externe').fill('ftp://nope')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog.getByText('L’adresse doit commencer par http:// ou https://')).toBeVisible()

    await dialog.getByLabel('URL externe').fill('https://example.test/me.png')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText('Photo de profil mise à jour')).toBeVisible()
    expect((await (await page.request.get('/api/me')).json()).image).toBe('https://example.test/me.png')

    await page.getByRole('button', { name: 'Modifier la photo de profil' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Retirer la photo' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect((await (await page.request.get('/api/me')).json()).image).toBeNull()
  })

  test('the user changes their password', async ({ page, createUser }) => {
    const user = await createUser()
    await signIn(page, user)
    await page.goto('/profile')
    await page.getByRole('tab', { name: '🔒 Sécurité' }).click()
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()

    await page.getByLabel('Mot de passe actuel').fill('wrong-password')
    await page.getByLabel('Nouveau mot de passe').fill('NewPassword456!')
    await page.getByLabel('Confirmer le mot de passe').fill('NewPassword456!')
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByRole('alert')).toHaveText('Mot de passe actuel incorrect')

    await page.getByLabel('Mot de passe actuel').fill(user.password)
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByText('Mot de passe mis à jour')).toBeVisible()

    const api = await apiClient()
    const oldLogin = await api.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    expect(oldLogin.status()).toBe(401)
    const newLogin = await api.post('/api/auth/sign-in/email', { data: { email: user.email, password: 'NewPassword456!' } })
    expect(newLogin.ok()).toBeTruthy()
    await api.dispose()
  })

  test('the profile page requires a session', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fprofile$/)
  })
})

test.describe('public profile (spec 037)', () => {
  test('a leaderboard row opens the public profile, without the e-mail', async ({ page, createUser, adminRequest }) => {
    const user = await createUser()
    // Enough XP to be first on the leaderboard (other tests award far less).
    const res = await adminRequest.post(`/api/admin/users/${user.id}/xp`, { data: { amount: 90_000, reason: 'test' } })
    expect(res.ok()).toBeTruthy()

    await page.goto('/leaderboard')
    await page.getByRole('link', { name: user.username }).click()
    await expect(page).toHaveURL(new RegExp(`/users/${user.id}$`))
    await expect(page.getByRole('heading', { name: user.username })).toBeVisible()
    await expect(page.getByText(/^90\s000 XP$/)).toBeVisible()
    await expect(page.getByText(user.email)).toHaveCount(0)

    const profile = await (await page.request.get(`/api/users/${user.id}`)).json()
    expect(profile).not.toHaveProperty('email')
  })

  test('unknown and deactivated users are not found', async ({ page, createUser }) => {
    const inactive = await createUser({ isActive: false })
    expect((await page.request.get(`/api/users/${inactive.id}`)).status()).toBe(404)
    await page.goto('/users/does-not-exist')
    await expect(page.getByText('Profil introuvable.')).toBeVisible()
  })
})

test.describe('rate limiting (spec 009)', () => {
  test('the 11th sign-in attempt within a minute from one IP is refused; other IPs are not', async () => {
    const attacker = await apiClient()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const res = await attacker.post('/api/auth/sign-in/email', {
        data: { email: `nobody-${uid()}@example.test`, password: 'wrong' },
      })
      statuses.push(res.status())
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBeTruthy()
    expect(statuses[10]).toBe(429)
    await attacker.dispose()

    const other = await apiClient()
    const res = await other.post('/api/auth/sign-in/email', { data: { email: 'nobody@example.test', password: 'wrong' } })
    expect(res.status()).toBe(401)
    await other.dispose()
  })
})
