import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const connectionString = process.env.DATABASE_URL?.trim();
const separatePostgresKeys = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const configuredSeparatePostgresKeys = separatePostgresKeys.filter((key) => process.env[key] !== undefined && process.env[key] !== '');
const missingSeparatePostgresKeys = separatePostgresKeys.filter((key) => !process.env[key]);
if (!connectionString && missingSeparatePostgresKeys.length !== 0) {
  const detail = configuredSeparatePostgresKeys.length === 0
    ? 'DATABASE_URL atau konfigurasi lengkap PGHOST, PGPORT, PGDATABASE, PGUSER, dan PGPASSWORD'
    : `konfigurasi PG lengkap (kurang: ${missingSeparatePostgresKeys.join(', ')})`;
  throw new Error(`${detail} wajib diatur untuk menghubungkan backend ke PostgreSQL.`);
}
if (!connectionString && (!/^\d+$/.test(process.env.PGPORT) || Number(process.env.PGPORT) < 1 || Number(process.env.PGPORT) > 65535)) {
  throw new Error('PGPORT harus berupa nomor port antara 1 dan 65535.');
}

const pool = new Pool({
  ...(connectionString ? { connectionString } : {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  }),
  max: Number(process.env.PG_POOL_SIZE || 5),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
});
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error));

const migrationDirectory = path.join(__dirname, 'migrations');
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [48201921]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)');
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(({ version }) => Number(version)));
    const migrations = fs.readdirSync(migrationDirectory)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .map((file) => ({ file, version: Number(file.match(/^\d+/)[0]) }))
      .sort((a, b) => a.version - b.version);
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await client.query(fs.readFileSync(path.join(migrationDirectory, migration.file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [migration.version, Date.now()]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const defaultOrigins = isProduction ? '' : 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
const allowedOrigins = new Set((process.env.APP_ORIGINS ?? defaultOrigins).split(',').map((origin) => origin.trim()).filter(Boolean));
const sessionCookieName = (role) => `exam_${role}_session`;
const sessionDays = 7;
const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(sameSite)) throw new Error('COOKIE_SAMESITE harus berupa lax, strict, atau none.');
const secureCookie = process.env.COOKIE_SECURE === 'true' || isProduction;
if (sameSite === 'none' && !secureCookie) throw new Error('COOKIE_SAMESITE=none memerlukan COOKIE_SECURE=true.');

const app = express();
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  const origin = req.get('Origin');
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origin aplikasi ini tidak diizinkan.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Exam-Role');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' } });

function badRequest(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makePasswordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

async function createSession(userId, executor = pool) {
  await executor.query('DELETE FROM sessions WHERE expires_at <= $1', [Date.now()]);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await executor.query('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [hash(rawToken), userId, now + sessionDays * 24 * 60 * 60 * 1000, now]);
  return rawToken;
}

function writeSessionCookie(res, rawToken, role) {
  res.cookie(sessionCookieName(role), rawToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite,
    path: '/',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  });
}

function clearSession(res, role) {
  res.clearCookie(sessionCookieName(role), {
    httpOnly: true,
    secure: secureCookie,
    sameSite,
    path: '/',
  });
}

app.use('/api', asyncRoute(async (req, _res, next) => {
  const requestedRole = req.get('X-Exam-Role') || req.body?.role;
  if (requestedRole !== 'teacher' && requestedRole !== 'student') return next();
  const rawToken = req.cookies[sessionCookieName(requestedRole)];
  if (!rawToken) return next();
  const result = await pool.query(`SELECT users.id, users.name, users.email, users.role, sessions.token_hash
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`, [hash(rawToken), Date.now()]);
  const row = result.rows[0];
  if (row) {
    req.user = publicUser(row);
    req.sessionHash = row.token_hash;
  }
  return next();
}));

function requireAuth(req, res, next) {
  if (!req.user) return badRequest(res, 'Silakan masuk untuk melanjutkan.', 401);
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return badRequest(res, 'Silakan masuk untuk melanjutkan.', 401);
    if (req.user.role !== role) return badRequest(res, 'Akun ini tidak memiliki akses ke fitur tersebut.', 403);
    next();
  };
}

app.get('/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));
app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role;
  if (!name || name.length > 100) return badRequest(res, 'Nama wajib diisi (maksimal 100 karakter).');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return badRequest(res, 'Alamat email tidak valid.');
  if (password.length < 10 || password.length > 200) return badRequest(res, 'Kata sandi harus berisi minimal 10 karakter.');
  if (role !== 'teacher' && role !== 'student') return badRequest(res, 'Jenis akun tidak valid.');
  if (role === 'teacher') {
    const expectedCode = process.env.TEACHER_SIGNUP_CODE;
    if (!expectedCode) return badRequest(res, 'Registrasi pengajar belum dibuka. Atur TEACHER_SIGNUP_CODE pada backend.', 403);
    const providedCode = typeof req.body.inviteCode === 'string' ? Buffer.from(req.body.inviteCode) : Buffer.alloc(0);
    const expectedCodeBuffer = Buffer.from(expectedCode);
    if (providedCode.length !== expectedCodeBuffer.length || !crypto.timingSafeEqual(providedCode, expectedCodeBuffer)) {
      return badRequest(res, 'Kode undangan pengajar tidak valid.', 403);
    }
  }
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = makePasswordHash(password, salt);
  try {
    const registration = await withTransaction(async (client) => {
      const inserted = await client.query('INSERT INTO users (id, name, email, role, salt, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, role', [id, name, email, role, salt, passwordHash, Date.now()]);
      const sessionToken = await createSession(id, client);
      return { user: inserted.rows[0], sessionToken };
    });
    writeSessionCookie(res, registration.sessionToken, role);
    return res.status(201).json({ user: publicUser(registration.user) });
  } catch (error) {
    if (error?.code === '23505') return badRequest(res, 'Email ini sudah terdaftar. Silakan masuk.', 409);
    throw error;
  }
}));

app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role;
  if (!email || !password || (role !== 'teacher' && role !== 'student')) return badRequest(res, 'Email dan kata sandi wajib diisi.');
  const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const row = result.rows[0];
  const candidate = row ? makePasswordHash(password, row.salt) : '';
  const valid = row && candidate.length === row.password_hash.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(row.password_hash));
  if (!valid || row.role !== role) return badRequest(res, 'Email, kata sandi, atau jenis akun tidak cocok.', 401);
  if (req.sessionHash) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionHash]);
  const sessionToken = await createSession(row.id);
  writeSessionCookie(res, sessionToken, row.role);
  return res.json({ user: publicUser(row) });
}));

app.post('/api/auth/logout', requireAuth, asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionHash]);
  clearSession(res, req.user.role);
  res.json({ ok: true });
}));

app.get('/api/exams', requireAuth, asyncRoute(async (req, res) => {
  if (req.user.role === 'teacher') {
    const result = await pool.query(`SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id) AS participant_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.submitted_at IS NOT NULL) AS submission_count,
      (SELECT AVG(a.score * 100.0 / NULLIF((SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id), 0))
        FROM attempts a WHERE a.exam_id = e.id AND a.submitted_at IS NOT NULL) AS average_score
      FROM exams e WHERE e.owner_id = $1 ORDER BY e.created_at DESC`, [req.user.id]);
    return res.json({ exams: result.rows.map((exam) => ({
      id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade,
      date: exam.exam_date, duration: Number(exam.duration_minutes), status: exam.status,
      questionCount: Number(exam.question_count), participants: Number(exam.participant_count),
      submissionCount: Number(exam.submission_count),
      averageScore: exam.average_score === null ? null : Math.round(Number(exam.average_score) * 10) / 10,
    })) });
  }
  const result = await pool.query(`SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
      a.id AS attempt_id, a.submitted_at, a.expires_at, a.score,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS total_questions
    FROM exams e
    LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = $1
    WHERE e.status = 'published'
    ORDER BY e.exam_date ASC, e.created_at DESC`, [req.user.id]);
  return res.json({ exams: result.rows.map((exam) => ({
    id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade,
    date: exam.exam_date, duration: Number(exam.duration_minutes), status: exam.status,
    questionCount: Number(exam.question_count),
    attempt: exam.attempt_id ? {
      id: exam.attempt_id,
      status: exam.submitted_at ? 'submitted' : (Number(exam.expires_at) <= Date.now() ? 'expired' : 'in_progress'),
      score: exam.score === null ? null : Math.round((Number(exam.score) / Math.max(1, Number(exam.total_questions))) * 100),
    } : null,
  })) });
}));

function validateExamInput(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const grade = typeof body.grade === 'string' ? body.grade.trim() : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const duration = Number(body.duration);
  if (!title || title.length > 160) return 'Nama ujian wajib diisi (maksimal 160 karakter).';
  if (!subject || subject.length > 100) return 'Mata pelajaran wajib diisi.';
  if (!grade || grade.length > 100) return 'Kelas wajib diisi.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Tanggal ujian tidak valid.';
  if (!Number.isInteger(duration) || duration < 1 || duration > 300) return 'Durasi ujian harus antara 1 dan 300 menit.';
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 30) return 'Ujian harus memiliki 1 sampai 30 soal.';
  for (const [index, question] of body.questions.entries()) {
    if (!question || typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.trim().length > 1000) return `Teks soal ${index + 1} wajib diisi (maksimal 1000 karakter).`;
    if (!Array.isArray(question.options) || ![4, 5].includes(question.options.length) || question.options.some((option) => typeof option !== 'string' || !option.trim() || option.trim().length > 300)) return `Soal ${index + 1} harus memiliki empat atau lima pilihan jawaban.`;
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) return `Kunci jawaban soal ${index + 1} tidak valid.`;
    if (typeof question.explanation !== 'string' || question.explanation.length > 1000) return `Pembahasan soal ${index + 1} terlalu panjang.`;
  }
  return null;
}

app.post('/api/exams', writeLimiter, requireRole('teacher'), asyncRoute(async (req, res) => {
  const validationError = validateExamInput(req.body);
  if (validationError) return badRequest(res, validationError);
  const examId = crypto.randomUUID();
  const now = Date.now();
  await withTransaction(async (client) => {
    await client.query(`INSERT INTO exams (id, owner_id, title, subject, grade, exam_date, duration_minutes, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)`, [examId, req.user.id, req.body.title.trim(), req.body.subject.trim(), req.body.grade.trim(), req.body.date, Number(req.body.duration), now]);
    for (const [index, question] of req.body.questions.entries()) {
      await client.query('INSERT INTO questions (exam_id, position, prompt, options_json, answer_index, explanation) VALUES ($1, $2, $3, $4, $5, $6)', [examId, index, question.prompt.trim(), JSON.stringify(question.options.map((option) => option.trim())), question.answer, question.explanation.trim()]);
    }
  });
  return res.status(201).json({ exam: {
    id: examId, title: req.body.title.trim(), subject: req.body.subject.trim(), grade: req.body.grade.trim(),
    date: req.body.date, duration: Number(req.body.duration), status: 'draft',
    questionCount: req.body.questions.length, participants: 0, submissionCount: 0, averageScore: null,
  } });
}));

app.post('/api/exams/:examId/publish', writeLimiter, requireRole('teacher'), asyncRoute(async (req, res) => {
  const result = await pool.query(`UPDATE exams e SET status = 'published'
    WHERE e.id = $1 AND e.owner_id = $2
      AND EXISTS (SELECT 1 FROM questions q WHERE q.exam_id = e.id)
    RETURNING e.id`, [req.params.examId, req.user.id]);
  if (result.rowCount === 0) return badRequest(res, 'Ujian tidak ditemukan atau belum memiliki soal.', 404);
  res.json({ ok: true });
}));

async function getExamForStudent(examId) {
  const result = await pool.query("SELECT * FROM exams WHERE id = $1 AND status = 'published'", [examId]);
  return result.rows[0] || null;
}

async function questionRows(examId, executor = pool) {
  const result = await executor.query('SELECT id, position, prompt, options_json, answer_index, explanation FROM questions WHERE exam_id = $1 ORDER BY position, id', [examId]);
  return result.rows;
}

function listQuestions(rows, revealAnswers = false) {
  return rows.map((question) => ({
    id: Number(question.id),
    prompt: question.prompt,
    options: JSON.parse(question.options_json),
    ...(revealAnswers ? { answer: Number(question.answer_index), explanation: question.explanation } : {}),
  }));
}

async function finalizeLockedAttempt(client, attempt) {
  if (attempt.submitted_at) return attempt;
  const answers = JSON.parse(attempt.answers_json || '{}');
  const questions = await questionRows(attempt.exam_id, client);
  const score = questions.reduce((total, question, index) => total + (Number(answers[index]) === Number(question.answer_index) ? 1 : 0), 0);
  const submittedAt = Date.now();
  const updated = await client.query('UPDATE attempts SET submitted_at = $1, score = $2 WHERE id = $3 RETURNING *', [submittedAt, score, attempt.id]);
  return updated.rows[0];
}

async function lockAttempt(client, attemptId) {
  const result = await client.query('SELECT * FROM attempts WHERE id = $1 FOR UPDATE', [attemptId]);
  if (!result.rows[0]) throw new Error('Attempt no longer exists.');
  return result.rows[0];
}

async function finalizeAttempt(attempt) {
  return withTransaction(async (client) => {
    const current = await lockAttempt(client, attempt.id);
    return finalizeLockedAttempt(client, current);
  });
}

async function attemptDto(attempt) {
  const examResult = await pool.query('SELECT id, title, subject, grade, exam_date, duration_minutes FROM exams WHERE id = $1', [attempt.exam_id]);
  const exam = examResult.rows[0];
  if (!exam) throw new Error('Attempt references a missing exam.');
  const questions = await questionRows(attempt.exam_id);
  const answers = JSON.parse(attempt.answers_json || '{}');
  const common = {
    id: attempt.id,
    status: attempt.submitted_at ? 'submitted' : 'in_progress',
    startedAt: Number(attempt.started_at),
    expiresAt: Number(attempt.expires_at),
    answers,
    exam: { id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade, date: exam.exam_date, duration: Number(exam.duration_minutes) },
  };
  if (!attempt.submitted_at) return { ...common, questions: listQuestions(questions) };
  const review = listQuestions(questions, true).map((question, index) => ({
    ...question,
    selectedAnswer: answers[index] === undefined ? null : Number(answers[index]),
    correct: answers[index] !== undefined && Number(answers[index]) === question.answer,
  }));
  const questionCount = questions.length;
  const score = Number(attempt.score || 0);
  return {
    ...common,
    submittedAt: Number(attempt.submitted_at),
    questions: review,
    result: {
      score,
      questionCount,
      correctCount: score,
      percentage: questionCount ? Math.round((score / questionCount) * 100) : 0,
      review,
    },
  };
}

app.post('/api/exams/:examId/attempts', writeLimiter, requireRole('student'), asyncRoute(async (req, res) => {
  const exam = await getExamForStudent(req.params.examId);
  if (!exam) return badRequest(res, 'Ujian tidak ditemukan atau belum diterbitkan.', 404);
  let attemptResult = await pool.query('SELECT * FROM attempts WHERE exam_id = $1 AND student_id = $2', [exam.id, req.user.id]);
  let attempt = attemptResult.rows[0];
  if (attempt) {
    if (attempt.submitted_at) return badRequest(res, 'Ujian ini sudah dikumpulkan.', 409);
    if (Number(attempt.expires_at) <= Date.now()) {
      attempt = await finalizeAttempt(attempt);
      return res.status(409).json({ error: 'Waktu ujian sudah habis.', attempt: await attemptDto(attempt) });
    }
    return res.json({ attempt: await attemptDto(attempt) });
  }
  const startedAt = Date.now();
  const attemptId = crypto.randomUUID();
  const inserted = await pool.query(`INSERT INTO attempts (id, exam_id, student_id, started_at, expires_at, answers_json)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (student_id, exam_id) DO NOTHING RETURNING *`, [attemptId, exam.id, req.user.id, startedAt, startedAt + Number(exam.duration_minutes) * 60 * 1000, '{}']);
  attempt = inserted.rows[0];
  if (!attempt) {
    attemptResult = await pool.query('SELECT * FROM attempts WHERE exam_id = $1 AND student_id = $2', [exam.id, req.user.id]);
    attempt = attemptResult.rows[0];
    if (!attempt) throw new Error('Attempt conflict occurred but no attempt row was found.');
    if (attempt.submitted_at) return badRequest(res, 'Ujian ini sudah dikumpulkan.', 409);
    if (Number(attempt.expires_at) <= Date.now()) {
      attempt = await finalizeAttempt(attempt);
      return res.status(409).json({ error: 'Waktu ujian sudah habis.', attempt: await attemptDto(attempt) });
    }
    return res.json({ attempt: await attemptDto(attempt) });
  }
  return res.status(201).json({ attempt: await attemptDto(attempt) });
}));

const ownedAttempt = asyncRoute(async (req, res, next) => {
  const result = await pool.query('SELECT * FROM attempts WHERE id = $1', [req.params.attemptId]);
  const attempt = result.rows[0];
  if (!attempt) return badRequest(res, 'Sesi ujian tidak ditemukan.', 404);
  if (attempt.student_id !== req.user.id) return badRequest(res, 'Sesi ujian ini bukan milik akun Anda.', 403);
  req.attempt = attempt;
  return next();
});

app.get('/api/attempts/:attemptId', requireRole('student'), ownedAttempt, asyncRoute(async (req, res) => {
  let attempt = req.attempt;
  if (!attempt.submitted_at && Number(attempt.expires_at) <= Date.now()) attempt = await finalizeAttempt(attempt);
  res.json({ attempt: await attemptDto(attempt) });
}));

app.put('/api/attempts/:attemptId/answers', writeLimiter, requireRole('student'), ownedAttempt, asyncRoute(async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    const attempt = await lockAttempt(client, req.attempt.id);
    if (attempt.submitted_at) return { error: 'Jawaban sudah dikumpulkan dan tidak dapat diubah.', status: 409 };
    if (Number(attempt.expires_at) <= Date.now()) {
      return { error: 'Waktu ujian sudah habis.', status: 409, attempt: await finalizeLockedAttempt(client, attempt) };
    }
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return { error: 'Format jawaban tidak valid.', status: 400 };
    const questions = await questionRows(attempt.exam_id, client);
    for (const [indexText, selected] of Object.entries(answers)) {
      const index = Number(indexText);
      if (!Number.isInteger(index) || index < 0 || index >= questions.length || !Number.isInteger(selected) || selected < 0 || selected >= JSON.parse(questions[index].options_json).length) {
        return { error: 'Pilihan jawaban tidak valid.', status: 400 };
      }
    }
    await client.query('UPDATE attempts SET answers_json = $1 WHERE id = $2', [JSON.stringify(answers), attempt.id]);
    return { ok: true, savedAt: Date.now() };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error, ...(outcome.attempt ? { attempt: await attemptDto(outcome.attempt) } : {}) });
  return res.json(outcome);
}));

app.post('/api/attempts/:attemptId/submit', writeLimiter, requireRole('student'), ownedAttempt, asyncRoute(async (req, res) => {
  const outcome = await withTransaction(async (client) => {
    let attempt = await lockAttempt(client, req.attempt.id);
    if (!attempt.submitted_at && Number(attempt.expires_at) > Date.now() && req.body.answers && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)) {
      const questions = await questionRows(attempt.exam_id, client);
      const answers = req.body.answers;
      const valid = Object.entries(answers).every(([indexText, selected]) => {
        const index = Number(indexText);
        return Number.isInteger(index) && index >= 0 && index < questions.length && Number.isInteger(selected) && selected >= 0 && selected < JSON.parse(questions[index].options_json).length;
      });
      if (!valid) return { error: 'Pilihan jawaban tidak valid.', status: 400 };
      const updated = await client.query('UPDATE attempts SET answers_json = $1 WHERE id = $2 RETURNING *', [JSON.stringify(answers), attempt.id]);
      attempt = updated.rows[0];
    }
    if (!attempt.submitted_at) attempt = await finalizeLockedAttempt(client, attempt);
    return { attempt };
  });
  if (outcome.error) return badRequest(res, outcome.error, outcome.status);
  return res.json({ attempt: await attemptDto(outcome.attempt) });
}));

app.use((_req, res) => res.status(404).json({ error: 'Rute tidak ditemukan.' }));
app.use((error, _req, res, _next) => {
  console.error('API error:', error);
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format JSON tidak valid.' });
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

let server;
async function start() {
  await migrate();
  server = app.listen(port, host, () => {
    console.log(`ExamEdu API listening on port ${port}`);
    console.log('Database: PostgreSQL');
  });
}

async function shutdown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

process.on('SIGTERM', () => { shutdown().finally(() => process.exit(0)); });
process.on('SIGINT', () => { shutdown().finally(() => process.exit(0)); });

start().catch((error) => {
  console.error('Failed to start ExamEdu API:', error);
  pool.end().finally(() => process.exit(1));
});
