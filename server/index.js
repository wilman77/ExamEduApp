import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, 'data', 'examedu.sqlite'));
const defaultOrigins = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
const allowedOrigins = new Set((process.env.APP_ORIGINS || defaultOrigins).split(',').map((origin) => origin.trim()).filter(Boolean));
const sessionCookieName = (role) => `exam_${role}_session`;
const sessionDays = 7;
const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
const secureCookie = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && sameSite === 'none');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    grade TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS exams_owner_idx ON exams(owner_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL,
    answer_index INTEGER NOT NULL,
    explanation TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS questions_exam_idx ON questions(exam_id, position);
  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    submitted_at INTEGER,
    answers_json TEXT NOT NULL DEFAULT '{}',
    score INTEGER,
    UNIQUE(student_id, exam_id)
  );
  CREATE INDEX IF NOT EXISTS attempts_exam_idx ON attempts(exam_id);
`);

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
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

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makePasswordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function setSession(res, userId, role) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hash(rawToken), userId, now + sessionDays * 24 * 60 * 60 * 1000, now);
  res.cookie(sessionCookieName(role), rawToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: sameSite === 'none' ? 'none' : 'lax',
    path: '/',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  });
}

function clearSession(res, role) {
  res.clearCookie(sessionCookieName(role), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: sameSite === 'none' ? 'none' : 'lax',
    path: '/',
  });
}

function optionalAuth(req, _res, next) {
  const requestedRole = req.get('X-Exam-Role') || req.body?.role;
  if (requestedRole !== 'teacher' && requestedRole !== 'student') return next();
  const rawToken = req.cookies[sessionCookieName(requestedRole)];
  if (!rawToken) return next();
  const row = db.prepare(`SELECT users.id, users.name, users.email, users.role, sessions.token_hash
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hash(rawToken), Date.now());
  if (row) {
    req.user = publicUser(row);
    req.sessionHash = row.token_hash;
  }
  next();
}

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

app.use('/api', optionalAuth);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

app.post('/api/auth/register', authLimiter, (req, res) => {
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
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return badRequest(res, 'Email ini sudah terdaftar. Silakan masuk.', 409);

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = makePasswordHash(password, salt);
  try {
    db.prepare('INSERT INTO users (id, name, email, role, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, email, role, salt, passwordHash, Date.now());
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return badRequest(res, 'Email ini sudah terdaftar. Silakan masuk.', 409);
    throw error;
  }
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
  setSession(res, id, role);
  return res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role;
  if (!email || !password || (role !== 'teacher' && role !== 'student')) return badRequest(res, 'Email dan kata sandi wajib diisi.');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const candidate = row ? makePasswordHash(password, row.salt) : '';
  const valid = row && candidate.length === row.password_hash.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(row.password_hash));
  if (!valid || row.role !== role) return badRequest(res, 'Email, kata sandi, atau jenis akun tidak cocok.', 401);
  if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
  setSession(res, row.id, row.role);
  return res.json({ user: publicUser(row) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
  clearSession(res, req.user.role);
  res.json({ ok: true });
});

app.get('/api/exams', requireAuth, (req, res) => {
  if (req.user.role === 'teacher') {
    const exams = db.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id) AS participant_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.submitted_at IS NOT NULL) AS submission_count,
      (SELECT AVG(a.score * 100.0 / NULLIF((SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id), 0))
        FROM attempts a WHERE a.exam_id = e.id AND a.submitted_at IS NOT NULL) AS average_score
      FROM exams e WHERE e.owner_id = ? ORDER BY e.created_at DESC`).all(req.user.id);
    return res.json({ exams: exams.map((exam) => ({
      id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade,
      date: exam.exam_date, duration: exam.duration_minutes, status: exam.status,
      questionCount: exam.question_count, participants: exam.participant_count,
      submissionCount: exam.submission_count,
      averageScore: exam.average_score === null ? null : Math.round(exam.average_score * 10) / 10,
    })) });
  }
  const exams = db.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
      a.id AS attempt_id, a.submitted_at, a.expires_at, a.score,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS total_questions
    FROM exams e
    LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = ?
    WHERE e.status = 'published'
    ORDER BY e.exam_date ASC, e.created_at DESC`).all(req.user.id);
  return res.json({ exams: exams.map((exam) => ({
    id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade,
    date: exam.exam_date, duration: exam.duration_minutes, status: exam.status,
    questionCount: exam.question_count,
    attempt: exam.attempt_id ? {
      id: exam.attempt_id,
      status: exam.submitted_at ? 'submitted' : (exam.expires_at <= Date.now() ? 'expired' : 'in_progress'),
      score: exam.score === null ? null : Math.round((exam.score / Math.max(1, exam.total_questions)) * 100),
    } : null,
  })) });
});

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
    if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some((option) => typeof option !== 'string' || !option.trim() || option.trim().length > 300)) return `Soal ${index + 1} harus memiliki empat pilihan jawaban.`;
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) return `Kunci jawaban soal ${index + 1} tidak valid.`;
    if (typeof question.explanation !== 'string' || question.explanation.length > 1000) return `Pembahasan soal ${index + 1} terlalu panjang.`;
  }
  return null;
}

app.post('/api/exams', writeLimiter, requireRole('teacher'), (req, res) => {
  const validationError = validateExamInput(req.body);
  if (validationError) return badRequest(res, validationError);
  const examId = crypto.randomUUID();
  const now = Date.now();
  const insertExam = db.prepare(`INSERT INTO exams (id, owner_id, title, subject, grade, exam_date, duration_minutes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`);
  const insertQuestion = db.prepare(`INSERT INTO questions (exam_id, position, prompt, options_json, answer_index, explanation)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const save = db.transaction(() => {
    insertExam.run(examId, req.user.id, req.body.title.trim(), req.body.subject.trim(), req.body.grade.trim(), req.body.date, Number(req.body.duration), now);
    req.body.questions.forEach((question, index) => insertQuestion.run(examId, index, question.prompt.trim(), JSON.stringify(question.options.map((option) => option.trim())), question.answer, question.explanation.trim()));
  });
  save();
  return res.status(201).json({ exam: {
    id: examId, title: req.body.title.trim(), subject: req.body.subject.trim(), grade: req.body.grade.trim(),
    date: req.body.date, duration: Number(req.body.duration), status: 'draft',
    questionCount: req.body.questions.length, participants: 0, submissionCount: 0, averageScore: null,
  } });
});

app.post('/api/exams/:examId/publish', writeLimiter, requireRole('teacher'), (req, res) => {
  const exam = db.prepare('SELECT id, owner_id FROM exams WHERE id = ?').get(req.params.examId);
  if (!exam || exam.owner_id !== req.user.id) return badRequest(res, 'Ujian tidak ditemukan.', 404);
  const count = db.prepare('SELECT COUNT(*) AS count FROM questions WHERE exam_id = ?').get(exam.id).count;
  if (count < 1) return badRequest(res, 'Tambahkan setidaknya satu soal sebelum menerbitkan ujian.');
  db.prepare("UPDATE exams SET status = 'published' WHERE id = ?").run(exam.id);
  res.json({ ok: true });
});

function getExamForStudent(examId) {
  return db.prepare("SELECT * FROM exams WHERE id = ? AND status = 'published'").get(examId);
}

function questionRows(examId) {
  return db.prepare('SELECT id, position, prompt, options_json, answer_index, explanation FROM questions WHERE exam_id = ? ORDER BY position, id').all(examId);
}

function listQuestions(rows, revealAnswers = false) {
  return rows.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: JSON.parse(question.options_json),
    ...(revealAnswers ? { answer: question.answer_index, explanation: question.explanation } : {}),
  }));
}

function finalizeAttempt(attempt) {
  if (attempt.submitted_at) return attempt;
  const answers = JSON.parse(attempt.answers_json || '{}');
  const questions = questionRows(attempt.exam_id);
  const score = questions.reduce((total, question, index) => total + (Number(answers[index]) === question.answer_index ? 1 : 0), 0);
  const submittedAt = Date.now();
  db.prepare('UPDATE attempts SET submitted_at = ?, score = ? WHERE id = ? AND submitted_at IS NULL').run(submittedAt, score, attempt.id);
  return db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
}

function attemptDto(attempt) {
  const exam = db.prepare('SELECT id, title, subject, grade, exam_date, duration_minutes FROM exams WHERE id = ?').get(attempt.exam_id);
  const questions = questionRows(attempt.exam_id);
  const answers = JSON.parse(attempt.answers_json || '{}');
  const common = {
    id: attempt.id,
    status: attempt.submitted_at ? 'submitted' : 'in_progress',
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    answers,
    exam: { id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade, date: exam.exam_date, duration: exam.duration_minutes },
  };
  if (!attempt.submitted_at) return { ...common, questions: listQuestions(questions) };
  const review = listQuestions(questions, true).map((question, index) => ({
    ...question,
    selectedAnswer: answers[index] === undefined ? null : Number(answers[index]),
    correct: answers[index] !== undefined && Number(answers[index]) === question.answer,
  }));
  const questionCount = questions.length;
  const score = attempt.score || 0;
  return {
    ...common,
    submittedAt: attempt.submitted_at,
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

app.post('/api/exams/:examId/attempts', writeLimiter, requireRole('student'), (req, res) => {
  const exam = getExamForStudent(req.params.examId);
  if (!exam) return badRequest(res, 'Ujian tidak ditemukan atau belum diterbitkan.', 404);
  let attempt = db.prepare('SELECT * FROM attempts WHERE exam_id = ? AND student_id = ?').get(exam.id, req.user.id);
  if (attempt) {
    if (attempt.submitted_at) return badRequest(res, 'Ujian ini sudah dikumpulkan.', 409);
    if (attempt.expires_at <= Date.now()) {
      attempt = finalizeAttempt(attempt);
      return res.status(409).json({ error: 'Waktu ujian sudah habis.', attempt: attemptDto(attempt) });
    }
    return res.json({ attempt: attemptDto(attempt) });
  }
  const startedAt = Date.now();
  const attemptId = crypto.randomUUID();
  db.prepare('INSERT INTO attempts (id, exam_id, student_id, started_at, expires_at, answers_json) VALUES (?, ?, ?, ?, ?, ?)')
    .run(attemptId, exam.id, req.user.id, startedAt, startedAt + exam.duration_minutes * 60 * 1000, '{}');
  attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  return res.status(201).json({ attempt: attemptDto(attempt) });
});

function ownedAttempt(req, res, next) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(req.params.attemptId);
  if (!attempt) return badRequest(res, 'Sesi ujian tidak ditemukan.', 404);
  if (attempt.student_id !== req.user.id) return badRequest(res, 'Sesi ujian ini bukan milik akun Anda.', 403);
  req.attempt = attempt;
  next();
}

app.get('/api/attempts/:attemptId', requireRole('student'), ownedAttempt, (req, res) => {
  let attempt = req.attempt;
  if (!attempt.submitted_at && attempt.expires_at <= Date.now()) attempt = finalizeAttempt(attempt);
  res.json({ attempt: attemptDto(attempt) });
});

app.put('/api/attempts/:attemptId/answers', writeLimiter, requireRole('student'), ownedAttempt, (req, res) => {
  const attempt = req.attempt;
  if (attempt.submitted_at) return badRequest(res, 'Jawaban sudah dikumpulkan dan tidak dapat diubah.', 409);
  if (attempt.expires_at <= Date.now()) {
    const completed = finalizeAttempt(attempt);
    return res.status(409).json({ error: 'Waktu ujian sudah habis.', attempt: attemptDto(completed) });
  }
  const answers = req.body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return badRequest(res, 'Format jawaban tidak valid.');
  const questions = questionRows(attempt.exam_id);
  for (const [indexText, selected] of Object.entries(answers)) {
    const index = Number(indexText);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length || !Number.isInteger(selected) || selected < 0 || selected >= JSON.parse(questions[index].options_json).length) {
      return badRequest(res, 'Pilihan jawaban tidak valid.');
    }
  }
  db.prepare('UPDATE attempts SET answers_json = ? WHERE id = ? AND submitted_at IS NULL').run(JSON.stringify(answers), attempt.id);
  res.json({ ok: true, savedAt: Date.now() });
});

app.post('/api/attempts/:attemptId/submit', writeLimiter, requireRole('student'), ownedAttempt, (req, res) => {
  let attempt = req.attempt;
  if (!attempt.submitted_at && attempt.expires_at > Date.now() && req.body.answers && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers)) {
    const questions = questionRows(attempt.exam_id);
    const answers = req.body.answers;
    const valid = Object.entries(answers).every(([indexText, selected]) => {
      const index = Number(indexText);
      return Number.isInteger(index) && index >= 0 && index < questions.length && Number.isInteger(selected) && selected >= 0 && selected < JSON.parse(questions[index].options_json).length;
    });
    if (!valid) return badRequest(res, 'Pilihan jawaban tidak valid.');
    db.prepare('UPDATE attempts SET answers_json = ? WHERE id = ? AND submitted_at IS NULL').run(JSON.stringify(answers), attempt.id);
    attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
  }
  if (!attempt.submitted_at) attempt = finalizeAttempt(attempt);
  res.json({ attempt: attemptDto(attempt) });
});

app.use((_req, res) => res.status(404).json({ error: 'Rute tidak ditemukan.' }));
app.use((error, _req, res, _next) => {
  console.error('API error:', error);
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format JSON tidak valid.' });
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(port, () => {
  console.log(`ExamEdu API listening on http://localhost:${port}`);
  console.log(`Database: ${databasePath}`);
});
