import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileQuestion,
  LayoutDashboard,
  LogOut,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  UsersRound,
  X,
} from 'lucide-react';
import { api, type BankCollectionDetail, type ExamDto, type ExamInput, type QuestionInput, type User, type WorkspacePreferences } from './api';
import QuestionBank from './QuestionBank';
import { prepareQuestionImage } from './questionImage';
import './question-images.css';

type ExamStatus = 'Aktif' | 'Draft' | 'Selesai';
type Exam = Omit<ExamDto, 'status'> & { status: ExamStatus; color: string };
type Page = 'Ringkasan' | 'Ujian' | 'Bank soal' | 'Analitik' | 'Pengaturan';

const DEFAULT_WORKSPACE: WorkspacePreferences = {
  name: 'Sekolah Cendekia',
  subjects: ['Pengetahuan Umum', 'Matematika', 'Biologi', 'Bahasa Indonesia', 'Fisika', 'Bahasa Inggris', 'Sejarah'],
  classes: ['Kelas VII A', 'Kelas VIII C', 'Kelas IX A', 'Kelas X A', 'Kelas XI B', 'Kelas XII'],
};

function workspaceStorageKey(userId: string) {
  return `examedu-workspace-${userId}`;
}

function cleanWorkspaceList(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    const key = trimmed.toLocaleLowerCase('id-ID');
    if (!trimmed || trimmed.length > 80 || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
    if (cleaned.length === 100) break;
  }
  return cleaned.length ? cleaned : null;
}

function normalizeWorkspace(value: unknown): WorkspacePreferences | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WorkspacePreferences>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const subjects = cleanWorkspaceList(candidate.subjects);
  const classes = cleanWorkspaceList(candidate.classes);
  if (!name || name.length > 80 || !subjects || !classes) return null;
  return { name, subjects, classes };
}

function readLocalWorkspace(userId: string): WorkspacePreferences | null {
  try {
    const stored = window.localStorage.getItem(workspaceStorageKey(userId));
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<WorkspacePreferences>;
    return {
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : DEFAULT_WORKSPACE.name,
      subjects: cleanWorkspaceList(value.subjects) ?? DEFAULT_WORKSPACE.subjects,
      classes: cleanWorkspaceList(value.classes) ?? DEFAULT_WORKSPACE.classes,
    };
  } catch {
    return null;
  }
}

function writeLocalWorkspace(userId: string, workspace: WorkspacePreferences) {
  try {
    window.localStorage.setItem(workspaceStorageKey(userId), JSON.stringify(workspace));
  } catch {
    // Backend tetap menjadi sumber utama jika cache browser tidak tersedia.
  }
}

const navItems: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Ringkasan', icon: LayoutDashboard },
  { label: 'Ujian', icon: ClipboardList },
  { label: 'Bank soal', icon: BookOpen },
  { label: 'Analitik', icon: BarChart3 },
];

function colorForSubject(subject: string) {
  if (/bio/i.test(subject)) return 'mint';
  if (/bahasa indonesia/i.test(subject)) return 'peach';
  if (/fisika|sejarah/i.test(subject)) return 'blue';
  return 'violet';
}

function toExam(dto: ExamDto): Exam {
  return { ...dto, status: dto.status === 'published' ? 'Aktif' : 'Draft', color: colorForSubject(dto.subject) };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function App() {
  const [page, setPage] = useState<Page>('Ringkasan');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState('');
  const [exams, setExams] = useState<Exam[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [examTemplate, setExamTemplate] = useState<BankCollectionDetail | null>(null);
  const [toast, setToast] = useState('');
  const [workspace, setWorkspace] = useState<WorkspacePreferences>(DEFAULT_WORKSPACE);
  const [workspaceLoadedFor, setWorkspaceLoadedFor] = useState<string | null>(null);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceSyncError, setWorkspaceSyncError] = useState('');

  async function loadExams() {
    setDataLoading(true);
    try {
      const response = await api.exams();
      setExams(response.exams.map(toExam));
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Daftar ujian gagal dimuat.');
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api.me().then(async ({ user: currentUser }) => {
      if (cancelled) return;
      if (currentUser && currentUser.role !== 'teacher') {
        await api.logout().catch(() => undefined);
        setAuthNotice('Sesi siswa sudah dikeluarkan. Masuk dengan akun pengajar.');
        return;
      }
      setUser(currentUser);
      if (currentUser) {
        const response = await api.exams();
        if (!cancelled) setExams(response.exams.map(toExam));
      }
    }).catch((error: unknown) => {
      if (!cancelled) setAuthNotice(error instanceof Error ? error.message : 'Backend belum dapat dihubungi.');
    }).finally(() => {
      if (!cancelled) setAuthLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setWorkspace(DEFAULT_WORKSPACE);
      setWorkspaceLoadedFor(null);
      return;
    }
    let cancelled = false;
    setWorkspaceLoadedFor(null);
    void (async () => {
      try {
        const response = await api.workspace();
        if (cancelled) return;
        let loaded = normalizeWorkspace(response.workspace);
        if (!loaded) {
          const legacy = readLocalWorkspace(user.id);
          if (legacy) {
            const initialized = await api.initializeWorkspace(legacy);
            loaded = normalizeWorkspace(initialized.workspace) ?? legacy;
          }
        }
        if (cancelled) return;
        setWorkspace(loaded ?? DEFAULT_WORKSPACE);
        // Jangan menjadikan nilai bawaan di browser baru sebagai cache lama.
        // Biarkan perangkat dengan pengaturan asli melakukan migrasi lebih dulu.
        if (loaded) writeLocalWorkspace(user.id, loaded);
        setWorkspaceSyncError('');
      } catch (error) {
        if (cancelled) return;
        setWorkspace(readLocalWorkspace(user.id) ?? DEFAULT_WORKSPACE);
        setWorkspaceSyncError('Pengaturan server belum dapat dimuat. Muat ulang untuk mencoba lagi; perubahan tidak akan disimpan lokal saja.');
        setToast(error instanceof Error ? `Sinkronisasi pengaturan gagal: ${error.message}` : 'Pengaturan workspace belum dapat disinkronkan.');
      } finally {
        if (!cancelled) setWorkspaceLoadedFor(user.id);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredExams = useMemo(() => exams.filter((exam) =>
    `${exam.title} ${exam.subject} ${exam.grade}`.toLowerCase().includes(query.toLowerCase()),
  ), [exams, query]);

  async function saveWorkspace(next: WorkspacePreferences, message = 'Pengaturan workspace berhasil disinkronkan.') {
    if (!user) return false;
    setWorkspaceSaving(true);
    try {
      const response = await api.saveWorkspace(next);
      const saved = normalizeWorkspace(response.workspace);
      if (!saved) throw new Error('Respons pengaturan dari server tidak valid.');
      setWorkspace(saved);
      writeLocalWorkspace(user.id, saved);
      setWorkspaceSyncError('');
      setToast(message);
      return true;
    } catch {
      setWorkspaceSyncError('Perubahan belum tersimpan di server. Periksa koneksi lalu simpan kembali.');
      setToast('Pengaturan gagal disimpan ke server. Periksa koneksi lalu coba lagi.');
      return false;
    } finally {
      setWorkspaceSaving(false);
    }
  }

  async function createExam(input: ExamInput) {
    const response = await api.createExam(input);
    setExams((current) => [toExam(response.exam), ...current]);
    setPage('Ujian');
    setToast('Ujian tersimpan sebagai draft. Terbitkan dari daftar ujian agar siswa dapat melihatnya.');
  }

  async function publishExam(id: string) {
    try {
      await api.publishExam(id);
      await loadExams();
      setToast('Ujian berhasil diterbitkan untuk siswa.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Ujian gagal diterbitkan.');
    }
  }

  async function logout() {
    try { await api.logout(); } catch { /* sesi di sisi server mungkin sudah kedaluwarsa */ }
    setUser(null);
    setExams([]);
    setAuthNotice('Anda sudah keluar dari akun.');
  }

  if (authLoading) return <div className="app-loading"><span className="brand-mark"><ClipboardList size={20} /></span><b>Memeriksa sesi pengajar…</b></div>;
  if (!user) return <AuthScreen notice={authNotice} onAuthenticated={(nextUser) => { setUser(nextUser); setAuthNotice(''); void loadExams(); }} />;
  if (workspaceLoadedFor !== user.id) return <div className="app-loading"><span className="brand-mark"><ClipboardList size={20} /></span><b>Memuat pengaturan workspace dari server…</b></div>;

  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setPage('Ringkasan'); }}>
          <span className="brand-mark"><ClipboardList size={20} strokeWidth={2.4} /></span>
          <span className="brand-name">exam<span>edu</span><small>TEACHER SPACE</small></span>
        </a>

        <div className="workspace-switcher">
          <span className="school-avatar">{workspace.name.trim().charAt(0).toUpperCase() || 'S'}</span>
          <span className="workspace-copy"><b>{workspace.name}</b><small>Workspace sekolah</small></span>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <p className="sidebar-label">MENU UTAMA</p>
        <nav className="side-nav" aria-label="Menu utama">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${page === label ? 'selected' : ''}`} onClick={() => setPage(label)}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
              {label === 'Ujian' && <span className="nav-count">{exams.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-promo">
          <div className="promo-icon"><FileQuestion size={19} /></div>
          <b>Siap buat ujian?</b>
          <p>Susun soal dan bagikan ujian ke kelasmu dalam beberapa menit.</p>
          <button className="promo-button" onClick={() => setIsModalOpen(true)}>Buat ujian <ArrowUpRight size={15} /></button>
        </div>

        <div className="sidebar-bottom">
          <button className={`nav-item ${page === 'Pengaturan' ? 'selected' : ''}`} aria-label="Pengaturan workspace" title="Pengaturan workspace" onClick={() => setPage('Pengaturan')}><Settings size={18} /><span>Pengaturan</span></button>
          <div className="profile-row"><div className="profile-avatar">{initials || 'PG'}</div><div className="profile-copy"><b>{user.name}</b><small>Pengajar</small></div><button className="logout-icon" aria-label="Keluar" title="Keluar" onClick={() => void logout()}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><ClipboardList size={18} /></span><b>examedu</b></div>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input aria-label="Cari ujian" placeholder="Cari ujian..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="Notifikasi" onClick={() => setToast('Tidak ada notifikasi baru.')}><Bell size={18} /><i /></button>
            <div className="topbar-divider" />
            <button className="teacher-menu" onClick={() => void logout()} title="Keluar"><span className="profile-avatar small">{initials || 'PG'}</span><LogOut size={15} /></button>
          </div>
        </header>

        <div className="page-content">
          {dataLoading && <div className="inline-loading">Memuat data dari server…</div>}
          {page === 'Ringkasan' && <Dashboard exams={filteredExams} allExams={exams} onCreate={() => setIsModalOpen(true)} onOpenExams={() => setPage('Ujian')} onPublish={publishExam} />}
          {page === 'Ujian' && <ExamList exams={filteredExams} onCreate={() => setIsModalOpen(true)} onPublish={publishExam} />}
          {page === 'Bank soal' && <QuestionBank subjects={workspace.subjects} onToast={setToast} onUseCollection={(collection) => { setExamTemplate(collection); setIsModalOpen(true); }} />}
          {page === 'Analitik' && <Analytics exams={exams} />}
          {page === 'Pengaturan' && <WorkspaceSettings workspace={workspace} onSave={saveWorkspace} saving={workspaceSaving} syncError={workspaceSyncError} />}
        </div>
      </main>

      {isModalOpen && <CreateExamModal subjects={workspace.subjects} classes={workspace.classes} template={examTemplate} onClose={() => { setIsModalOpen(false); setExamTemplate(null); }} onSave={createExam} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

function AuthScreen({ notice, onAuthenticated }: { notice: string; onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setWorking(true);
    try {
      const response = mode === 'login'
        ? await api.login(email, password)
        : await api.register(name, email, password, inviteCode);
      onAuthenticated(response.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tidak dapat memproses akun.');
    } finally {
      setWorking(false);
    }
  }

  return <main className="auth-shell teacher-auth">
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark"><ClipboardList size={21} /></span><span>exam<span>edu</span><small>TEACHER SPACE</small></span></div>
      <p className="auth-eyebrow">AKSES PENGAJAR</p>
      <h1>{mode === 'login' ? 'Selamat datang kembali' : 'Buat akun pengajar'}</h1>
      <p className="auth-description">Masuk untuk mengelola ujian dan melihat progres siswa dari satu tempat.</p>
      {notice && <div className="auth-notice">{notice}</div>}
      <form onSubmit={(event) => void submit(event)} className="auth-form">
        {mode === 'register' && <label>Nama lengkap<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={100} placeholder="Nama Anda" /></label>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="nama@sekolah.id" /></label>
        <label>Kata sandi<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={200} placeholder={mode === 'register' ? 'Minimal 10 karakter' : 'Kata sandi Anda'} /></label>
        {mode === 'register' && <label>Kode undangan pengajar<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" required placeholder="Kode dari administrator" /></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={working}>{working ? 'Memproses…' : mode === 'login' ? 'Masuk ke panel' : 'Daftar sebagai pengajar'} <ArrowUpRight size={16} /></button>
      </form>
      <p className="auth-switch">{mode === 'login' ? 'Belum punya akun pengajar?' : 'Sudah punya akun?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Daftar' : 'Masuk'}</button></p>
      <div className="auth-security"><LockKeyhole size={15} /> Sesi terenkripsi di cookie yang tidak dapat dibaca skrip halaman.</div>
    </section>
  </main>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="heading-description">{description}</p></div>{action}</div>;
}

function Dashboard({ exams, allExams, onCreate, onOpenExams, onPublish }: { exams: Exam[]; allExams: Exam[]; onCreate: () => void; onOpenExams: () => void; onPublish: (id: string) => void }) {
  const activeCount = allExams.filter((exam) => exam.status === 'Aktif').length;
  const totalParticipants = allExams.reduce((sum, exam) => sum + exam.participants, 0);
  const totalSubmissions = allExams.reduce((sum, exam) => sum + exam.submissionCount, 0);
  const scoreCount = allExams.reduce((sum, exam) => sum + (exam.averageScore === null ? 0 : exam.submissionCount), 0);
  const weightedScore = scoreCount ? allExams.reduce((sum, exam) => sum + (exam.averageScore ?? 0) * exam.submissionCount, 0) / scoreCount : null;
  const completionRate = totalParticipants ? Math.round((totalSubmissions / totalParticipants) * 100) : 0;
  const chartExams = allExams.slice(0, 7);
  return <>
    <PageHeading eyebrow="PANEL PENGAJAR" title="Ringkasan ujian" description="Ikhtisar ujian dan aktivitas siswa dari data server." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Buat ujian</button>} />
    <section className="stat-grid" aria-label="Ringkasan statistik">
      <StatCard label="Total ujian" value={String(allExams.length).padStart(2, '0')} note="tersimpan di server" icon={<ClipboardList />} tone="lavender" trend="Lihat ujian" />
      <StatCard label="Sedang aktif" value={String(activeCount).padStart(2, '0')} note="sudah diterbitkan" icon={<Clock3 />} tone="mint" trend="Lihat jadwal" />
      <StatCard label="Total peserta" value={String(totalParticipants)} note="percobaan ujian" icon={<UsersRound />} tone="peach" trend={`${totalSubmissions} terkumpul`} />
      <StatCard label="Rata-rata nilai" value={weightedScore === null ? '—' : weightedScore.toLocaleString('id-ID', { maximumFractionDigits: 1 })} note="ujian terkumpul" icon={<BarChart3 />} tone="sky" trend={scoreCount ? `${scoreCount} hasil dinilai` : 'Belum ada hasil'} />
    </section>

    <section className="overview-grid">
      <div className="panel upcoming-panel">
        <div className="panel-heading"><div><h2>Jadwal mendatang</h2><p>Ujian draft dan ujian yang akan datang</p></div><button className="text-button" onClick={onOpenExams}>Lihat semua <ArrowUpRight size={15} /></button></div>
        <div className="schedule-list">
          {exams.filter((exam) => exam.status !== 'Selesai').slice(0, 4).map((exam) => <div className="schedule-item" key={exam.id}>
            <div className="date-tile"><b>{new Date(`${exam.date}T00:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(`${exam.date}T00:00:00`))}</small></div>
            <div className={`subject-mark ${exam.color}`}><BookOpen size={17} /></div>
            <div className="schedule-copy"><b>{exam.title}</b><small>{exam.subject} <span>·</span> {exam.grade}</small></div>
            <span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span>
            <button className="more-button" aria-label={`Opsi ${exam.title}`} onClick={onOpenExams}><MoreHorizontal size={18} /></button>
          </div>)}
          {exams.filter((exam) => exam.status !== 'Selesai').length === 0 && <div className="empty-state">Belum ada ujian. Buat ujian dan terbitkan untuk menampilkannya di portal siswa.</div>}
        </div>
      </div>
      <div className="panel activity-panel">
        <div className="panel-heading"><div><h2>Pengumpulan jawaban</h2><p>Untuk semua ujian di workspace</p></div><span className="period-select">Data server</span></div>
        <div className="chart-summary"><b>{completionRate}%</b><small>percobaan sudah dikumpulkan</small></div>
        {chartExams.length > 0 ? <div className="mini-chart" aria-label="Tingkat pengumpulan per ujian">
          {chartExams.map((exam, index) => {
            const percent = exam.participants ? Math.round((exam.submissionCount / exam.participants) * 100) : 0;
            return <div className="chart-column" key={exam.id} title={`${exam.title}: ${percent}%`}><div className={index === 0 ? 'bar active-bar' : 'bar'} style={{ height: `${Math.max(percent, 4)}%` }} /><small>{index + 1}</small></div>;
          })}
        </div> : <div className="empty-state compact-empty">Statistik akan muncul setelah siswa mulai mengerjakan.</div>}
      </div>
    </section>

    <section className="panel recent-panel">
      <div className="panel-heading"><div><h2>Ujian terbaru</h2><p>Ujian yang baru dibuat atau diperbarui</p></div><button className="text-button" onClick={onOpenExams}>Semua ujian <ArrowUpRight size={15} /></button></div>
      {exams.length ? <ExamTable exams={exams.slice(0, 4)} onPublish={onPublish} /> : <div className="empty-state">Belum ada ujian tersimpan di server.</div>}
    </section>

    <footer className="page-footer"><span>© 2026 ExamEdu</span><span>Panel pengajar <i>·</i> Data disimpan di server</span></footer>
  </>;
}

function StatCard({ label, value, note, icon, tone, trend }: { label: string; value: string; note: string; icon: React.ReactNode; tone: string; trend: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-value">{value}</div><div className="stat-note"><span>{note}</span><span className="stat-trend">{trend}</span></div></div>;
}

function ExamList({ exams, onCreate, onPublish }: { exams: Exam[]; onCreate: () => void; onPublish: (id: string) => void }) {
  const [filter, setFilter] = useState<'Semua' | ExamStatus>('Semua');
  const shown = filter === 'Semua' ? exams : exams.filter((exam) => exam.status === filter);
  return <>
    <PageHeading eyebrow="KELOLA PENILAIAN" title="Semua ujian" description="Atur jadwal, peserta, dan status ujian di satu tempat." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Buat ujian</button>} />
    <div className="panel list-panel">
      <div className="filter-row"><div className="filter-tabs">{(['Semua', 'Aktif', 'Draft', 'Selesai'] as const).map((item) => <button key={item} className={filter === item ? 'filter-tab active' : 'filter-tab'} onClick={() => setFilter(item)}>{item}<span>{item === 'Semua' ? exams.length : exams.filter((exam) => exam.status === item).length}</span></button>)}</div><span className="outline-button"><CalendarDays size={15} /> Data sinkron</span></div>
      <ExamTable exams={shown} onPublish={onPublish} />
      {shown.length === 0 && <div className="empty-state">Tidak ada ujian yang cocok. Coba kata kunci atau filter lain.</div>}
    </div>
    <footer className="page-footer"><span>© 2026 ExamEdu</span><span>Panel pengajar <i>·</i> Data disimpan di server</span></footer>
  </>;
}

function ExamTable({ exams, onPublish }: { exams: Exam[]; onPublish: (id: string) => void }) {
  return <div className="table-scroll"><table className="exam-table"><thead><tr><th>NAMA UJIAN</th><th>MATA PELAJARAN</th><th>JADWAL</th><th>PESERTA</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>{exams.map((exam) => <tr key={exam.id}>
    <td><div className="exam-name"><span className={`subject-mark small-mark ${exam.color}`}><BookOpen size={15} /></span><div><b>{exam.title}</b><small>{exam.id.slice(0, 8)} <span>·</span> {exam.grade} <span>·</span> {exam.questionCount} soal</small></div></div></td>
    <td>{exam.subject}</td><td>{formatDate(exam.date)}<small className="cell-subtext">{exam.duration} menit</small></td>
    <td><span className="participant-count"><UsersRound size={14} /> {exam.participants}</span></td>
    <td><span className={`status-pill ${exam.status.toLowerCase()}`}><i />{exam.status}</span></td>
    <td>{exam.status === 'Draft' ? <button className="publish-button" onClick={() => onPublish(exam.id)}>Terbitkan</button> : <span className="action-hint">Tayang</span>}</td>
  </tr>)}</tbody></table></div>;
}

function Analytics({ exams }: { exams: Exam[] }) {
  const complete = exams.filter((exam) => exam.status === 'Selesai').length;
  const active = exams.filter((exam) => exam.status === 'Aktif').length;
  const drafts = exams.filter((exam) => exam.status === 'Draft').length;
  const totalSubmissions = exams.reduce((sum, exam) => sum + exam.submissionCount, 0);
  const scoredSubmissions = exams.reduce((sum, exam) => sum + (exam.averageScore === null ? 0 : exam.submissionCount), 0);
  const average = scoredSubmissions ? exams.reduce((sum, exam) => sum + (exam.averageScore ?? 0) * exam.submissionCount, 0) / scoredSubmissions : null;
  return <>
    <PageHeading eyebrow="INSIGHT PEMBELAJARAN" title="Analitik ujian" description="Ringkasan hanya menggunakan hasil siswa yang dikumpulkan di server." action={<span className="outline-button"><CalendarDays size={15} /> Semua data</span>} />
    <section className="analytics-cards"><div className="panel analytics-score"><div className="panel-heading"><div><h2>Rata-rata nilai</h2><p>Dari ujian yang sudah dikumpulkan</p></div><span className="stat-icon lavender"><BarChart3 /></span></div><div className="big-score">{average === null ? '—' : average.toLocaleString('id-ID', { maximumFractionDigits: 1 })}<span>{average === null ? '' : '/100'}</span></div><p className="score-caption">{totalSubmissions} jawaban sudah dikumpulkan</p><div className="score-meter"><span style={{ width: `${average ?? 0}%` }} /></div><div className="meter-labels"><span>0</span><span>Nilai aktual</span><span>100</span></div></div><div className="panel completion-panel"><div className="panel-heading"><div><h2>Status ujian</h2><p>Ujian pada akun Anda</p></div><MoreHorizontal size={18} className="muted-icon" /></div><div className="completion-ring"><div><b>{exams.length}</b><small>ujian</small></div></div><div className="legend-list"><span><i className="legend-dot active-dot" />Terbit <b>{active}</b></span><span><i className="legend-dot done-dot" />Selesai <b>{complete}</b></span><span><i className="legend-dot draft-dot" />Draft <b>{drafts}</b></span></div></div></section>
    <div className="panel insight-panel"><div className="panel-heading"><div><h2>Ringkasan data</h2><p>Statistik server aktual</p></div></div>{exams.length ? exams.map((exam) => <div className="insight-row" key={exam.id}><span className="insight-number">{exam.title.slice(0, 2).toUpperCase()}</span><div><b>{exam.title}</b><p>{exam.subject} · {exam.submissionCount} jawaban dikumpulkan dari {exam.participants} peserta.</p></div><span className="insight-value">{exam.averageScore === null ? '—' : `${exam.averageScore}`}</span></div>) : <div className="empty-state">Belum ada data ujian.</div>}</div>
  </>;
}

function WorkspaceSettings({ workspace, onSave, saving, syncError }: { workspace: WorkspacePreferences; onSave: (next: WorkspacePreferences, message?: string) => Promise<boolean>; saving: boolean; syncError: string }) {
  const [name, setName] = useState(workspace.name);
  useEffect(() => setName(workspace.name), [workspace.name]);

  return <>
    <PageHeading eyebrow="PREFERENSI WORKSPACE" title="Pengaturan workspace" description="Atur identitas workspace, mata pelajaran, dan kelas untuk ujian." />
    <div className="settings-grid">
      <section className="panel settings-panel workspace-settings-panel">
        <div className="settings-heading"><span className="settings-icon lavender"><Settings size={18} /></span><div><h2>Identitas workspace</h2><p>Nama ini ditampilkan pada menu workspace di panel pengajar.</p></div></div>
        <form className="settings-form workspace-name-form" onSubmit={(event) => { event.preventDefault(); const trimmed = name.trim(); if (trimmed) void onSave({ ...workspace, name: trimmed }, 'Nama workspace berhasil diperbarui.'); }}>
          <label>Nama workspace<input value={name} onChange={(event) => setName(event.target.value)} disabled={saving} maxLength={80} required placeholder="Contoh: Sekolah Cendekia" /></label>
          <button className="primary-button" type="submit" disabled={saving}><Check size={16} /> Simpan nama</button>
        </form>
      </section>
      <ManageWorkspaceItems title="Mata pelajaran" description="Pilihan ini tersedia saat membuat ujian baru." items={workspace.subjects} placeholder="Contoh: Kimia" saving={saving} onChange={(items) => onSave({ ...workspace, subjects: items }, 'Daftar mata pelajaran berhasil diperbarui.')} />
      <ManageWorkspaceItems title="Kelas" description="Pilihan ini tersedia saat membuat ujian baru." items={workspace.classes} placeholder="Contoh: Kelas X B" saving={saving} onChange={(items) => onSave({ ...workspace, classes: items }, 'Daftar kelas berhasil diperbarui.')} />
    </div>
    <div className="info-banner settings-storage-note" role={syncError ? 'alert' : undefined}><span className="info-dot">i</span><p>{syncError || 'Pengaturan disimpan ke akun pengajar di server. Masuk dengan akun yang sama pada perangkat atau browser lain untuk memuat pengaturan yang sama.'}</p></div>
  </>;
}

function ManageWorkspaceItems({ title, description, items, placeholder, onChange, saving }: { title: string; description: string; items: string[]; placeholder: string; onChange: (items: string[]) => Promise<boolean>; saving: boolean }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    if (items.length >= 100) { setError('Daftar maksimal 100 pilihan.'); return; }
    if (next.length > 80) { setError('Nama maksimal 80 karakter.'); return; }
    if (items.some((item) => item.toLocaleLowerCase('id-ID') === next.toLocaleLowerCase('id-ID'))) { setError('Nama ini sudah ada di daftar.'); return; }
    if (await onChange([...items, next])) {
      setValue('');
      setError('');
    }
  }

  function removeItem(item: string) {
    if (items.length <= 1) { setError('Sisakan setidaknya satu pilihan untuk membuat ujian.'); return; }
    void onChange(items.filter((entry) => entry !== item));
    setError('');
  }

  return <section className="panel settings-panel">
    <div className="settings-heading"><span className="settings-icon lavender">{title === 'Kelas' ? <UsersRound size={18} /> : <BookOpen size={18} />}</span><div><h2>{title}</h2><p>{description}</p></div><span className="settings-count">{items.length}</span></div>
    <form className="settings-form settings-add-form" onSubmit={(event) => void addItem(event)}>
      <label className="visually-hidden" htmlFor={`add-${title.toLowerCase().replace(/\s+/g, '-')}`}>Tambah {title.toLowerCase()}</label>
      <input id={`add-${title.toLowerCase().replace(/\s+/g, '-')}`} value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} disabled={saving} maxLength={80} placeholder={placeholder} />
      <button className="outline-button" type="submit" disabled={!value.trim() || saving}><Plus size={15} /> Tambah</button>
    </form>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <ul className="settings-item-list">{items.map((item) => <li key={item}><span>{item}</span><button type="button" disabled={saving} aria-label={`Hapus ${item}`} title={`Hapus ${item}`} onClick={() => removeItem(item)}><X size={15} /></button></li>)}</ul>
  </section>;
}

function CreateExamModal({ subjects, classes, template, onClose, onSave }: { subjects: string[]; classes: string[]; template?: BankCollectionDetail | null; onClose: () => void; onSave: (exam: ExamInput) => Promise<void> }) {
  const subjectOptions = template?.subject && !subjects.includes(template.subject) ? [template.subject, ...subjects] : subjects;
  const [title, setTitle] = useState(template?.title || '');
  const [subject, setSubject] = useState(template?.subject || subjects[0] || '');
  const [grade, setGrade] = useState(classes[0] || '');
  const [date, setDate] = useState('2026-11-20');
  const [duration, setDuration] = useState('60');
  const [questions, setQuestions] = useState<QuestionInput[]>(template?.questions.map((question) => ({ ...question, options: [...question.options] })) || [{ prompt: '', options: ['', '', '', '', ''], answer: 0, explanation: '' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageWorking, setImageWorking] = useState<number | null>(null);

  function updateQuestion(index: number, update: Partial<QuestionInput>) {
    setQuestions((current) => current.map((question, position) => position === index ? { ...question, ...update } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, position) => position === questionIndex ? {
      ...question, options: question.options.map((option, index) => index === optionIndex ? value : option),
    } : question));
  }

  async function uploadImage(index: number, file: File) {
    setImageWorking(index);
    setError('');
    try {
      updateQuestion(index, { imageData: await prepareQuestionImage(file) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gambar tidak dapat diproses.');
    } finally {
      setImageWorking(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!title.trim()) { setError('Nama ujian perlu diisi.'); return; }
    if (questions.length < 1 || questions.length > 50) { setError('Ujian harus memiliki 1 sampai 50 soal.'); return; }
    if (imageWorking !== null) { setError('Tunggu pemrosesan gambar selesai.'); return; }
    if (questions.some((question) => !question.prompt.trim() || question.options.some((option) => !option.trim()))) {
      setError('Lengkapi teks soal dan semua pilihan jawaban.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), subject, grade, date, duration: Math.max(1, Number(duration) || 60), questions });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ujian gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card exam-editor-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">UJIAN BARU</p><h2 id="modal-title">Buat ujian</h2><p>Ujian tersimpan sebagai draft. Anda dapat menerbitkannya dari daftar ujian.</p></div><button className="icon-button" aria-label="Tutup" onClick={onClose}><X size={19} /></button></div><form onSubmit={(event) => void submit(event)} className="exam-form">
    <label>Nama ujian<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Contoh: Penilaian Akhir Bab 1" /></label>
    <div className="form-two-col"><label>Mata pelajaran<select value={subject} onChange={(event) => setSubject(event.target.value)} required>{subjectOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Kelas<select value={grade} onChange={(event) => setGrade(event.target.value)} required>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
    <div className="form-two-col"><label>Tanggal ujian<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Durasi (menit)<input type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label></div>
    <div className="question-editor-heading"><div><b>Soal pilihan ganda</b><small>{questions.length} dari maksimal 50 soal per ujian. Gambar JPG, PNG, atau WebP akan dikompresi otomatis.</small></div><button type="button" className="outline-button" disabled={questions.length >= 50 || saving || imageWorking !== null} onClick={() => setQuestions((current) => current.length >= 50 ? current : [...current, { prompt: '', options: ['', '', '', '', ''], answer: 0, explanation: '' }])}><Plus size={15} /> Tambah soal</button></div>
    <div className="question-editor-list">{questions.map((question, index) => <fieldset className="question-editor" key={index}><legend>Soal {index + 1}</legend>{questions.length > 1 && <button type="button" className="remove-question" disabled={saving || imageWorking !== null} aria-label={`Hapus soal ${index + 1}`} onClick={() => setQuestions((current) => current.filter((_, position) => position !== index))}><X size={15} /></button>}
      <label>Pertanyaan<textarea value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} maxLength={1000} rows={2} required placeholder="Tulis pertanyaan…" /></label>
      <label className="question-image-upload">Gambar soal (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving || imageWorking !== null} aria-label={`Unggah gambar soal ${index + 1}`} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadImage(index, file); }} /></label>
      {imageWorking === index && <p className="question-image-note">Memproses gambar…</p>}
      {question.imageData && <div className="question-image-preview"><img src={question.imageData} alt={`Pratinjau gambar soal ${index + 1}`} /><button type="button" className="text-button" disabled={saving || imageWorking !== null} onClick={() => updateQuestion(index, { imageData: null })}>Hapus gambar</button></div>}
      <div className="answer-choice-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}><span>Pilihan {String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} maxLength={300} required placeholder={`Jawaban ${String.fromCharCode(65 + optionIndex)}`} /></label>)}</div>
      <div className="form-two-col"><label>Kunci jawaban<select value={question.answer} onChange={(event) => updateQuestion(index, { answer: Number(event.target.value) })}>{question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Pilihan {String.fromCharCode(65 + optionIndex)}</option>)}</select></label><label>Pembahasan (opsional)<input value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} maxLength={1000} placeholder="Penjelasan setelah ujian" /></label></div>
    </fieldset>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={saving || imageWorking !== null}><Check size={16} /> {saving ? 'Menyimpan…' : 'Simpan draft'}</button></div>
  </form></section></div>;
}

export default App;
