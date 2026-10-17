# 150 — In-person courses, sessions, booking, agenda and attendance

| Field | Value |
| --- | --- |
| Area | In-person training |
| Actors | learner; trainers (admins and managers) |
| Related | [140](140-manager-space.md), [045](045-course-page-and-enrollment.md) |

Covers the original 150 (model), 151 (session management), 152 (booking), 153 (my bookings), 154 (agenda) and 155
(attendance).

## Model (spec 191)

- `course.inPerson` ("Cours en présentiel" in the admin course form; "🏢 Présentiel" on cards).
- `course_session`: course (must be in person), title, `startsAt`, optional `endsAt`, location, capacity (null / 0 =
  unlimited), created by.
- `session_booking`: one per (session, user), `bookedAt`, `attendance` (`unknown` / `present` / `absent`) with who marked
  it and when; deleted with the session.

**Trainers** = admins, platform managers and group managers.

## API (`/api/sessions`)

| Method | Path | |
| --- | --- | --- |
| GET | `/?from=&to=&courseSlug=` | sessions of in-person courses the viewer may see (public published, or enrolled; trainers: all but drafts), with `bookedCount`, `booked` (viewer), `past`, and `canManage` |
| GET | `/courses` | trainers: in-person courses to schedule |
| POST | `/ {courseId, title, startsAt, endsAt?, location?, capacity?}` | trainers; 400 for a course that is not in person |
| PATCH / DELETE | `/:id` | trainers; deleting removes the bookings |
| POST / DELETE | `/:id/booking` | book / cancel. Only upcoming sessions (400), of courses the learner can access (404 / 403); booking a public course enrolls the learner; 409 `Session is full`. Idempotent. The capacity check and insert are one transaction |
| GET | `/:id/participants` | trainers: session and participants with attendance |
| PATCH | `/:id/participants/:userId {attendance}` | trainers |

## UI

- Course page (in-person courses): "📍 Sessions en présentiel" — a card per session: title, "📅 <date> à HH:MM",
  "📍 <lieu>", "🪑 n/N réservées" (or "Places illimitées"), "Réserver une place" / "✓ Réservé" + "Annuler la
  réservation", "Session complète"; past sessions are faded and not bookable. Toasts "Place réservée", "Réservation annulée".
- `/agenda` ("Agenda", top bar): month grid (Monday first, adjacent days greyed, today highlighted), "Aujourd'hui", ‹ ›,
  month label opening a month / year picker; up to 3 sessions per day then "+N autres"; clicking a day shows its
  sessions in the side panel (default "Sessions à venir"). Trainers: "+ Nouvelle session" (dialog: Cours, Titre "ex :
  Session septembre — Groupe A", Date et heure, Lieu "ex : Salle 3B, Paris", Capacité "0 : illimitée"), "Modifier",
  "Supprimer" ("Supprimer cette session ?"), "Feuille de présence".
- `/sessions/:id/attendance` ("Feuille de présence — <title>"): Participant, Email, Inscrit le, Présence
  (— / Présent / Absent, saved at once, toast "Présence enregistrée").

## Differences from the original

- Fixes the original gaps: booking requires course access (public courses are joined automatically), capacity cannot be
  exceeded, bookings go with their session, past sessions are refused.
- Attendance has three states instead of a checkbox; sessions have ids (not `sess-<hex>` per course) and an optional end.
- The agenda lives in the learner app for everyone, with trainer controls; there is no admin agenda.

## Source

`apps/api/src/routes/sessions.ts`, `apps/api/src/db/schema/sessions.ts`, `packages/shared/src/sessions.ts`,
`apps/app/src/routes/Agenda.tsx`, `apps/app/src/routes/Attendance.tsx`, `apps/app/src/components/sessions/`,
`e2e/sessions.spec.ts`.
