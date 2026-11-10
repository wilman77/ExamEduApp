import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const inviteCode = process.env.TEACHER_SIGNUP_CODE;
if (!inviteCode || !process.env.DATABASE_URL) throw new Error('TEACHER_SIGNUP_CODE dan DATABASE_URL diperlukan untuk pengujian dan pembersihan data sintetis.');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true }, max: 2 });
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const password = crypto.randomBytes(24).toString('base64url');
const createdUserIds = [];

async function call(path, { method = 'GET', body, cookie = '', role = '', origin = '' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(role ? { 'X-Exam-Role': role } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get('set-cookie') || '').split(';')[0],
    headers: response.headers,
  };
}

function status(result, expected) {
  assert.equal(result.status, expected, `Expected HTTP ${expected}, got ${result.status}: ${result.body.error || ''}`);
  return result;
}

async function register(role, label) {
  const email = `${label}-${suffix}@example.invalid`;
  const result = status(await call('/api/auth/register', { method: 'POST', role, body: { name: `Integration ${label}`, email, password, role, ...(role === 'teacher' ? { inviteCode } : {}) } }), 201);
  createdUserIds.push(result.body.user.id);
  assert.ok(result.cookie.startsWith(`exam_${role}_session=`));
  return { id: result.body.user.id, email, cookie: result.cookie, role };
}

try {
  await db.query('SELECT 1');
  status(await call('/health'), 200);
  status(await call('/api/exams'), 401);
  status(await call('/health', { origin: 'https://untrusted.example.invalid' }), 403);
  const allowedOrigin = process.env.TEST_ORIGIN || 'http://localhost:5173';
  const preflight = status(await call('/api/auth/me', { method: 'OPTIONS', origin: allowedOrigin }), 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  console.log('PASS health, auth gate, and exact-origin CORS');

  status(await call('/api/auth/register', { method: 'POST', role: 'teacher', body: { name: 'Denied teacher', email: `denied-${suffix}@example.invalid`, password, role: 'teacher', inviteCode: 'not-the-invitation' } }), 403);
  const teacher = await register('teacher', 'teacher');
  const otherTeacher = await register('teacher', 'other-teacher');
  const student = await register('student', 'student');
  const otherStudent = await register('student', 'other-student');
  const duplicate = status(await call('/api/auth/register', { method: 'POST', role: 'student', body: { name: 'Duplicate', email: student.email.toUpperCase(), password, role: 'student' } }), 409);
  assert.equal(duplicate.cookie, '');
  status(await call('/api/auth/login', { method: 'POST', role: 'teacher', body: { email: student.email, password, role: 'teacher' } }), 401);
  const me = status(await call('/api/auth/me', teacher), 200);
  assert.equal(me.body.user.id, teacher.id);
  console.log('PASS role-specific auth, invitation, and case-insensitive email uniqueness');

  const examInput = {
    title: `Integration exam ${suffix}`, subject: 'Testing', grade: 'Test', date: '2026-11-10', duration: 30,
    questions: [
      { prompt: 'Choose E', options: ['A', 'B', 'C', 'D', 'E'], answer: 4, explanation: 'E is correct.' },
      { prompt: 'Choose C', options: ['A', 'B', 'C', 'D'], answer: 2, explanation: 'C is correct.' },
    ],
  };
  const created = status(await call('/api/exams', { ...teacher, method: 'POST', body: examInput }), 201);
  const examId = created.body.exam.id;
  assert.equal(created.body.exam.questionCount, 2);
  const beforePublish = status(await call('/api/exams', student), 200);
  assert.ok(!beforePublish.body.exams.some((exam) => exam.id === examId));
  status(await call(`/api/exams/${examId}/publish`, { ...otherTeacher, method: 'POST', body: {} }), 404);
  status(await call(`/api/exams/${examId}/publish`, { ...student, method: 'POST', body: {} }), 403);
  status(await call(`/api/exams/${examId}/publish`, { ...teacher, method: 'POST', body: {} }), 200);
  const listed = status(await call('/api/exams', student), 200).body.exams.find((exam) => exam.id === examId);
  assert.equal(listed.questionCount, 2);
  assert.equal(typeof listed.duration, 'number');
  console.log('PASS draft visibility, publication ownership, and numeric DTOs');

  const started = status(await call(`/api/exams/${examId}/attempts`, { ...student, method: 'POST', body: {} }), 201);
  const attemptId = started.body.attempt.id;
  assert.equal(typeof started.body.attempt.startedAt, 'number');
  assert.equal(typeof started.body.attempt.expiresAt, 'number');
  assert.ok(!Object.hasOwn(started.body.attempt.questions[0], 'answer'));
  status(await call(`/api/attempts/${attemptId}`, otherStudent), 403);
  status(await call(`/api/attempts/${attemptId}/answers`, { ...student, method: 'PUT', body: { answers: { 0: -1 } } }), 400);
  status(await call(`/api/attempts/${attemptId}/answers`, { ...student, method: 'PUT', body: { answers: { 0: 0, 1: 2 } } }), 200);
  const [save, submitted] = await Promise.all([
    call(`/api/attempts/${attemptId}/answers`, { ...student, method: 'PUT', body: { answers: { 0: 0, 1: 0 } } }),
    call(`/api/attempts/${attemptId}/submit`, { ...student, method: 'POST', body: { answers: { 0: 4, 1: 2 } } }),
  ]);
  assert.ok([200, 409].includes(save.status));
  status(submitted, 200);
  assert.equal(submitted.body.attempt.result.percentage, 100);
  assert.equal(submitted.body.attempt.result.score, 2);
  const completed = status(await call(`/api/attempts/${attemptId}`, student), 200).body.attempt;
  assert.deepEqual(completed.answers, { 0: 4, 1: 2 });
  assert.equal(completed.questions[0].answer, 4);
  assert.equal(typeof completed.submittedAt, 'number');
  status(await call(`/api/attempts/${attemptId}/answers`, { ...student, method: 'PUT', body: { answers: {} } }), 409);
  status(await call(`/api/exams/${examId}/attempts`, { ...student, method: 'POST', body: {} }), 409);
  console.log('PASS attempt ownership, hidden keys, concurrent autosave/submit, and immutable submitted score');

  const expiredStart = status(await call(`/api/exams/${examId}/attempts`, { ...otherStudent, method: 'POST', body: {} }), 201);
  const expiredId = expiredStart.body.attempt.id;
  await db.query('UPDATE attempts SET expires_at = $1 WHERE id = $2', [Date.now() - 1000, expiredId]);
  const expired = status(await call(`/api/attempts/${expiredId}`, otherStudent), 200).body.attempt;
  assert.equal(expired.status, 'submitted');
  assert.equal(expired.result.score, 0);
  const stats = status(await call('/api/exams', teacher), 200).body.exams.find((exam) => exam.id === examId);
  assert.equal(stats.participants, 2);
  assert.equal(stats.submissionCount, 2);
  assert.equal(stats.averageScore, 50);
  status(await call('/api/auth/logout', { ...student, method: 'POST', body: {} }), 200);
  assert.equal(status(await call('/api/auth/me', student), 200).body.user, null);
  console.log('PASS server expiry, teacher statistics, and logout');
  console.log('All PostgreSQL integration checks passed.');
} catch (error) {
  console.error('Integration test failed:', error.message);
  process.exitCode = 1;
} finally {
  if (createdUserIds.length) {
    const deleted = await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [createdUserIds]);
    console.log(`Cleaned ${deleted.rowCount} synthetic users and their cascading test records.`);
  }
  await db.end();
}
