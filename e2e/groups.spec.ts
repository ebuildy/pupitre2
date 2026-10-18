import { ADMIN_PASSWORD } from './env.ts'
import { expect, signIn, test, uid } from './fixtures.ts'

const admin = { email: 'admin', password: ADMIN_PASSWORD }

test.describe('groups (specs 130–133)', () => {
  test('an admin creates a group and a subgroup, then renames and moves it', async ({ page }) => {
    const name = `equipe-${uid()}`
    await signIn(page, admin)
    await page.goto('/admin/groups')
    await page.getByRole('button', { name: '+ Nouveau groupe' }).click()
    await page.getByRole('dialog').getByLabel('Nom du groupe').fill(name)
    await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByText(`Groupe « ${name} » créé`)).toBeVisible()

    const row = page.getByTestId(`group-${name}`)
    await row.getByRole('button', { name: '+ sous-groupe' }).click()
    await page.getByRole('dialog').getByLabel('Nom du groupe').fill(`${name}-backend`)
    await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByTestId(`group-${name}-backend`)).toContainText('↳')

    // Rename and move the subgroup to the root.
    await page.getByTestId(`group-${name}-backend`).getByRole('link').click()
    await expect(page.getByText(`${name} › ${name}-backend`)).toBeVisible()
    await page.getByLabel('Nom du groupe').fill(`${name}-api`)
    await page.getByLabel('Groupe parent').selectOption({ label: 'Racine (aucun parent)' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Groupe mis à jour')).toBeVisible()
    await page.goto('/admin/groups')
    await expect(page.getByTestId(`group-${name}-api`)).not.toContainText('↳')
  })

  test('a group with subgroups or members cannot be deleted; an empty one can', async ({
    page,
    adminRequest,
    createGroup,
    createUser,
    addMember,
  }) => {
    const parent = await createGroup()
    const child = await createGroup({ parentId: parent.id })
    expect((await adminRequest.delete(`/api/admin/groups/${parent.id}`)).status()).toBe(409)
    const user = await createUser()
    await addMember(child.id, user.id)
    const res = await adminRequest.delete(`/api/admin/groups/${child.id}`)
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toBe('Cannot delete a group that has members')

    // A move under its own subgroup is refused.
    const cycle = await adminRequest.patch(`/api/admin/groups/${parent.id}`, { data: { parentId: child.id } })
    expect(cycle.status()).toBe(400)

    await adminRequest.delete(`/api/admin/groups/${child.id}/members/${user.id}`)
    await signIn(page, admin)
    await page.goto('/admin/groups')
    await page.getByTestId(`group-${child.name}`).getByRole('button', { name: `Supprimer ${child.name}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByText('Groupe supprimé')).toBeVisible()
    await expect(page.getByTestId(`group-${child.name}`)).toHaveCount(0)
  })

  test('group names are unique, case-insensitively', async ({ adminRequest, createGroup }) => {
    const group = await createGroup()
    const res = await adminRequest.post('/api/admin/groups', { data: { name: group.name.toUpperCase() } })
    expect(res.status()).toBe(409)
  })

  test('every account is a member of the default group "everyone" (spec 038)', async ({ adminRequest, createUser }) => {
    const user = await createUser()
    const detail = await (await adminRequest.get(`/api/admin/users/${user.id}`)).json()
    expect(detail.groups).toContainEqual(expect.objectContaining({ name: 'everyone', isDefault: true }))
    const groups = (await (await adminRequest.get('/api/admin/groups')).json()).groups
    const everyone = groups.find((g: { isDefault: boolean }) => g.isDefault)
    expect((await adminRequest.delete(`/api/admin/groups/${everyone.id}`)).status()).toBe(404)
    expect((await adminRequest.delete(`/api/admin/groups/${everyone.id}/members/${user.id}`)).status()).toBe(400)
  })

  test('the admin adds a member from the group page, and can include subgroup members', async ({
    page,
    createGroup,
    createUser,
    addMember,
  }) => {
    const parent = await createGroup()
    const child = await createGroup({ parentId: parent.id })
    const direct = await createUser()
    const nested = await createUser()
    await addMember(child.id, nested.id)

    await signIn(page, admin)
    await page.goto(`/admin/groups/${parent.id}`)
    await page.getByRole('combobox', { name: 'Ajouter un membre' }).fill(direct.username)
    await page.getByRole('option').getByRole('button', { name: new RegExp(direct.username) }).click()
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByText('Membre ajouté')).toBeVisible()
    const list = page.getByRole('list', { name: /Membres/ })
    await expect(list.getByRole('link', { name: direct.username })).toBeVisible()
    await expect(list.getByRole('link', { name: nested.username })).toHaveCount(0)

    await page.getByLabel('Inclure les membres des sous-groupes').check()
    await expect(list.getByText(`dans ${child.name}`)).toBeVisible()
  })
})

test.describe('group course enrollment (specs 135, 136)', () => {
  test('members get the courses of their group; withdrawing removes only the group access', async ({
    page,
    adminRequest,
    createGroup,
    createUser,
    createCourse,
    addMember,
  }) => {
    const group = await createGroup()
    const course = await createCourse({ visibility: 'private' })
    const member = await createUser()
    const selfEnrolled = await createUser()
    await addMember(group.id, member.id)

    await signIn(page, admin)
    await page.goto(`/admin/courses/${course.id}`)
    await page.getByRole('combobox', { name: '— Ajouter un groupe —' }).selectOption({ label: `${group.name} (1 membre)` })
    await expect(page.getByText('Groupe inscrit : 1 nouveau membre inscrit')).toBeVisible()
    await expect(page.getByRole('cell', { name: member.username }).first()).toBeVisible()

    // Future members get the course when they join.
    await addMember(group.id, selfEnrolled.id)
    await adminRequest.post(`/api/admin/courses/${course.id}/enrollments`, { data: { userId: selfEnrolled.id } })
    const enrollments = (await (await adminRequest.get(`/api/admin/courses/${course.id}/enrollments`)).json()).enrollments
    expect(enrollments.find((e: { userId: string }) => e.userId === selfEnrolled.id).sources).toEqual(['admin', 'group'])

    await adminRequest.delete(`/api/admin/groups/${group.id}/courses/${course.id}`)
    const after = (await (await adminRequest.get(`/api/admin/courses/${course.id}/enrollments`)).json()).enrollments
    expect(after.map((e: { userId: string }) => e.userId)).toEqual([selfEnrolled.id])
  })

  test('"Mes groupes" lists the groups, their courses and members', async ({
    page,
    adminRequest,
    createGroup,
    createUser,
    createCourse,
    addMember,
  }) => {
    const group = await createGroup()
    const course = await createCourse()
    const me = await createUser()
    const mate = await createUser()
    await addMember(group.id, me.id)
    await addMember(group.id, mate.id, 'manager')
    await adminRequest.post(`/api/admin/groups/${group.id}/courses`, { data: { courseId: course.id } })

    await signIn(page, me)
    // A section of the profile, not a top-bar link.
    await expect(page.getByRole('banner').getByRole('link', { name: 'Mes groupes' })).toHaveCount(0)
    await page.goto('/profile')
    await page.getByRole('button', { name: '👥 Groupes' }).click()
    await expect(page).toHaveURL(/\/profile\?tab=groups$/)
    const card = page.getByTestId(`my-group-${group.name}`)
    await expect(card.getByRole('link', { name: course.title })).toBeVisible()
    await expect(card.getByRole('link', { name: mate.username })).toBeVisible()
    await expect(page.getByTestId('my-group-everyone')).toHaveCount(0)

    await page.goto('/my-courses')
    await expect(page.getByRole('link', { name: course.title }).first()).toBeVisible()
  })
})

test.describe('manager space (specs 140–142)', () => {
  test('a group manager enrolls a member of their group; users outside the scope are refused', async ({
    page,
    adminRequest,
    createGroup,
    createUser,
    createCourse,
    addMember,
  }) => {
    const group = await createGroup()
    const manager = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    const course = await createCourse({ visibility: 'private' })
    const pathCourse = await createCourse({ visibility: 'private' })
    const token = uid()
    const path = { title: `Parcours ${token}` }
    await adminRequest.post('/api/admin/paths', {
      data: { slug: `m-${token}`, title: path.title, kind: 'course', status: 'published', items: [pathCourse.id] },
    })
    await addMember(group.id, manager.id, 'manager')
    await addMember(group.id, member.id)

    await signIn(page, manager)
    await page.getByRole('link', { name: 'Mon espace' }).first().click()
    await expect(page).toHaveURL(/\/manager\/users$/)
    const row = page.getByTestId(`member-${member.username}`)
    await expect(row).toContainText(group.name)
    await expect(page.getByTestId(`member-${outsider.username}`)).toHaveCount(0)

    await row.getByRole('button', { name: /Gérer les inscriptions/ }).click()
    const dialog = page.getByRole('dialog')
    const courseForm = dialog.getByRole('form', { name: 'Inscrire à un cours' })
    await courseForm.getByRole('combobox').selectOption({ label: course.title })
    await courseForm.getByRole('button', { name: 'Inscrire' }).click()
    await expect(page.getByText('Inscrit avec succès')).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'Cours actuels', exact: true })).toContainText(course.title)
    await dialog.getByRole('button', { name: `Retirer ${course.title}` }).click()
    await expect(page.getByText('Inscription retirée')).toBeVisible()

    // Paths, in the same dialog.
    await expect(dialog.getByText('Aucun parcours')).toBeVisible()
    const pathForm = dialog.getByRole('form', { name: 'Inscrire à un parcours' })
    await pathForm.getByRole('combobox').selectOption({ label: path.title })
    await pathForm.getByRole('button', { name: 'Inscrire' }).click()
    await expect(page.getByText('Inscrit au parcours')).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'Parcours actuels' })).toContainText(path.title)
    // The path's course is listed, managed by the path.
    await expect(dialog.getByRole('list', { name: 'Cours actuels', exact: true })).toContainText(`${pathCourse.title}Inscription gérée ailleurs`)
    await dialog.getByRole('button', { name: `Retirer ${path.title}` }).click()
    await expect(page.getByText('Parcours retiré')).toBeVisible()
    await expect(dialog.getByText('Aucun parcours')).toBeVisible()

    const res = await page.request.post(`/api/manager/users/${outsider.id}/enrollments`, { data: { courseId: course.id } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('User not in manager scope')
  })

  test('a manager creates a subgroup and adds a member of their scope to it', async ({
    page,
    createGroup,
    createUser,
    addMember,
  }) => {
    const group = await createGroup()
    const manager = await createUser()
    const member = await createUser()
    const outsider = await createUser()
    await addMember(group.id, manager.id, 'manager')
    await addMember(group.id, member.id)
    const subgroup = `sub-${uid()}`

    await signIn(page, manager)
    await page.goto('/manager/groups')
    await page.getByRole('button', { name: `+ sous-groupe ${group.name}` }).click()
    await page.getByRole('dialog').getByLabel('Nom du groupe').fill(subgroup)
    await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByText('Groupe créé')).toBeVisible()

    await page.getByRole('button', { name: `Membres ${subgroup}` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox', { name: 'Ajouter un membre' }).selectOption({ label: member.username })
    await dialog.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByText('Membre ajouté')).toBeVisible()
    await expect(dialog.getByText(member.username)).toBeVisible()

    const groups = (await (await page.request.get('/api/manager/groups')).json()).groups
    const sub = groups.find((g: { name: string }) => g.name === subgroup)
    const res = await page.request.post(`/api/manager/groups/${sub.id}/members`, { data: { userId: outsider.id } })
    expect(res.status()).toBe(403)
  })

  test('learners without a managed group have no manager space', async ({ page, createUser }) => {
    await signIn(page, await createUser())
    await expect(page.getByRole('link', { name: 'Mon espace' })).toHaveCount(0)
    expect((await page.request.get('/api/manager/users')).status()).toBe(403)
    await page.goto('/manager/users')
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
  })
})

test.describe('admin users (specs 162, 163)', () => {
  test('filter by role, change a role, deactivate and delete a user', async ({ page, createUser }) => {
    const user = await createUser()
    await signIn(page, admin)
    await page.goto(`/admin/users?search=${user.username}`)
    const row = page.getByTestId(`user-row-${user.username}`)
    await expect(row).toContainText('Étudiant')

    await row.getByRole('button', { name: `Modifier ${user.username}` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Rôle').selectOption('manager')
    await dialog.getByRole('switch', { name: 'Actif' }).click()
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Utilisateur mis à jour')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(row).toContainText('Manager de groupe')
    await expect(row).toContainText('Désactivé')

    await page.getByRole('combobox', { name: 'Rôle', exact: true }).selectOption('manager')
    await expect(page).toHaveURL(/role=manager/)
    await page.getByLabel('Statut').selectOption('inactive')
    await expect(page).toHaveURL(/role=manager&status=inactive/)
    await expect(row).toBeVisible()
    await page.getByLabel('Statut').selectOption('active')
    await expect(row).toHaveCount(0)

    await page.goto(`/admin/users?search=${user.username}`)
    await row.getByRole('button', { name: `Supprimer ${user.username}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByText('Utilisateur supprimé')).toBeVisible()
    await expect(row).toHaveCount(0)
  })

  test('a deactivated user loses their session at once', async ({ page, adminRequest, createUser }) => {
    const user = await createUser()
    await signIn(page, user)
    expect((await page.request.get('/api/me')).ok()).toBeTruthy()
    await adminRequest.patch(`/api/admin/users/${user.id}`, { data: { isActive: false } })
    expect((await page.request.get('/api/me')).status()).toBe(401)
    await adminRequest.patch(`/api/admin/users/${user.id}`, { data: { isActive: true } })
    // The session was revoked, not only hidden.
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test('admins cannot delete or demote themselves', async ({ adminRequest }) => {
    const me = await (await adminRequest.get('/api/me')).json()
    expect((await adminRequest.delete(`/api/admin/users/${me.id}`)).status()).toBe(400)
    expect((await adminRequest.patch(`/api/admin/users/${me.id}`, { data: { role: 'student' } })).status()).toBe(400)
  })
})
