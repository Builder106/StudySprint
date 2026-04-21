const STARTER_SUBJECTS = [
  "Computer Science",
  "Mathematics",
  "Languages",
  "Writing",
  "Science",
];

const STARTER_GOALS = [
  {
    title: "Welcome sprint",
    description: "Your first study goal. Log a quick session to see how tracking works, then edit or delete this anytime.",
    target_hours: 5,
    subjects: ["Writing"],
  },
  {
    title: "Weekly reading",
    description: "Read for 30 minutes a day across the week.",
    target_hours: 3.5,
    subjects: ["Languages"],
  },
];

export async function seedSubjects(client) {
  for (const name of STARTER_SUBJECTS) {
    await client.query(
      "INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [name],
    );
  }
}

export async function createStarterDataForUser(client, userId) {
  await seedSubjects(client);

  for (const goal of STARTER_GOALS) {
    const { rows: goalRows } = await client.query(
      `INSERT INTO study_goals (user_id, title, description, target_hours, status)
       VALUES ($1, $2, $3, $4, 'Active')
       RETURNING id`,
      [userId, goal.title, goal.description, goal.target_hours],
    );
    const goalId = goalRows[0].id;
    for (const subjectName of goal.subjects) {
      await client.query(
        `INSERT INTO goal_subjects (goal_id, subject_id)
         SELECT $1, s.id FROM subjects s WHERE s.name = $2
         ON CONFLICT DO NOTHING`,
        [goalId, subjectName],
      );
    }
  }
}
