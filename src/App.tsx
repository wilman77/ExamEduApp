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
import { api, type ExamDto, type ExamInput, type QuestionInput, type User } from './api';

type ExamStatus = 'Aktif' | 'Draft' | 'Selesai';
type Exam = Omit<ExamDto, 'status'> & { status: ExamStatus; color: string };
type Page = 'Ringkasan' | 'Ujian' | 'Bank soal' | 'Analitik';

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
  const [toast, setToast] = useState('');

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredExams = useMemo(() => exams.filter((exam) =>
    `${exam.title} ${exam.subject} ${exam.grade}`.toLowerCase().includes(query.toLowerCase()),
  ), [exams, query]);

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

  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setPage('Ringkasan'); }}>
          <span className="brand-mark"><ClipboardList size={20} strokeWidth={2.4} /></span>
          <span className="brand-name">exam<span>edu</span><small>TEACHER SPACE</small></span>
        </a>

        <div className="workspace-switcher">
          <span className="school-avatar">S</span>
          <span className="workspace-copy"><b>Sekolah Cendekia</b><small>Workspace sekolah</small></span>
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
          <button className="nav-item" onClick={() => setToast('Pengaturan workspace akan ditambahkan kemudian.')}><Settings size={18} /><span>Pengaturan</span></button>
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
          {page === 'Bank soal' && <QuestionBank onToast={setToast} />}
          {page === 'Analitik' && <Analytics exams={exams} />}
        </div>
      </main>

      {isModalOpen && <CreateExamModal onClose={() => setIsModalOpen(false)} onSave={createExam} />}
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

function QuestionBank({ onToast }: { onToast: (message: string) => void }) {
  const questions = [
    { subject: 'Matematika', title: 'Persamaan kuadrat dan faktorisasi', type: 'Pilihan ganda', count: 12, color: 'violet' },
    { subject: 'Biologi', title: 'Sistem organ pada manusia', type: 'Pilihan ganda', count: 18, color: 'mint' },
    { subject: 'Bahasa Indonesia', title: 'Teks eksplanasi', type: 'Uraian', count: 8, color: 'peach' },
    { subject: 'Fisika', title: 'Gerak lurus dan kecepatan', type: 'Pilihan ganda', count: 14, color: 'blue' },
  ];
  return <>
    <PageHeading eyebrow="MATERI PENILAIAN" title="Bank soal" description="Koleksi ini masih contoh tampilan; soal untuk ujian baru disimpan bersama ujiannya." action={<button className="primary-button" onClick={() => onToast('Tambahkan soal melalui formulir Buat ujian untuk saat ini.')}><Plus size={17} /> Tambah soal</button>} />
    <div className="question-summary"><div className="question-summary-icon"><FileQuestion size={21} /></div><div><b>Contoh tampilan bank soal</b><span>Soal contoh di bawah tidak tersimpan sebagai koleksi akun.</span></div><button className="outline-button" onClick={() => onToast('Impor soal belum tersedia.')}>Impor soal</button></div>
    <div className="question-grid">{questions.map((question) => <article className="question-card" key={question.title}><div className="question-card-top"><span className={`subject-mark ${question.color}`}><BookOpen size={17} /></span><button className="more-button" aria-label="Menu contoh soal"><MoreHorizontal size={18} /></button></div><p className="eyebrow">{question.subject}</p><h2>{question.title}</h2><div className="question-card-meta"><span>{question.type}</span><span>·</span><b>{question.count} soal contoh</b></div><button className="card-link" onClick={() => onToast('Koleksi contoh tidak dapat diedit.')}>Lihat koleksi <ArrowUpRight size={15} /></button></article>)}</div>
    <div className="info-banner"><span className="info-dot">i</span><p>Bank soal terpisah belum tersedia. Soal yang dibuat pada formulir ujian tersimpan di server dan menjadi bagian dari ujian tersebut.</p></div>
  </>;
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

function CreateExamModal({ onClose, onSave }: { onClose: () => void; onSave: (exam: ExamInput) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Matematika');
  const [grade, setGrade] = useState('Kelas IX A');
  const [date, setDate] = useState('2026-11-20');
  const [duration, setDuration] = useState('60');
  const [questions, setQuestions] = useState<QuestionInput[]>([{ prompt: '', options: ['', '', '', ''], answer: 0, explanation: '' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateQuestion(index: number, update: Partial<QuestionInput>) {
    setQuestions((current) => current.map((question, position) => position === index ? { ...question, ...update } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, position) => position === questionIndex ? {
      ...question, options: question.options.map((option, index) => index === optionIndex ? value : option),
    } : question));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!title.trim()) { setError('Nama ujian perlu diisi.'); return; }
    if (questions.some((question) => !question.prompt.trim() || question.options.some((option) => !option.trim()))) {
      setError('Lengkapi teks soal dan keempat pilihan jawaban.');
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
    <div className="form-two-col"><label>Mata pelajaran<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>Matematika</option><option>Biologi</option><option>Bahasa Indonesia</option><option>Fisika</option><option>Bahasa Inggris</option><option>Sejarah</option></select></label><label>Kelas<select value={grade} onChange={(event) => setGrade(event.target.value)}><option>Kelas VII A</option><option>Kelas VIII C</option><option>Kelas IX A</option><option>Kelas X A</option><option>Kelas XI B</option><option>Kelas XII</option></select></label></div>
    <div className="form-two-col"><label>Tanggal ujian<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Durasi (menit)<input type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label></div>
    <div className="question-editor-heading"><div><b>Soal pilihan ganda</b><small>Minimal satu soal; maksimal 30 per ujian.</small></div><button type="button" className="outline-button" disabled={questions.length >= 30} onClick={() => setQuestions((current) => [...current, { prompt: '', options: ['', '', '', ''], answer: 0, explanation: '' }])}><Plus size={15} /> Tambah soal</button></div>
    <div className="question-editor-list">{questions.map((question, index) => <fieldset className="question-editor" key={index}><legend>Soal {index + 1}</legend>{questions.length > 1 && <button type="button" className="remove-question" aria-label={`Hapus soal ${index + 1}`} onClick={() => setQuestions((current) => current.filter((_, position) => position !== index))}><X size={15} /></button>}
      <label>Pertanyaan<textarea value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} maxLength={1000} rows={2} required placeholder="Tulis pertanyaan…" /></label>
      <div className="answer-choice-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}><span>Pilihan {String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} maxLength={300} required placeholder={`Jawaban ${String.fromCharCode(65 + optionIndex)}`} /></label>)}</div>
      <div className="form-two-col"><label>Kunci jawaban<select value={question.answer} onChange={(event) => updateQuestion(index, { answer: Number(event.target.value) })}>{question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Pilihan {String.fromCharCode(65 + optionIndex)}</option>)}</select></label><label>Pembahasan (opsional)<input value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} maxLength={1000} placeholder="Penjelasan setelah ujian" /></label></div>
    </fieldset>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={saving}><Check size={16} /> {saving ? 'Menyimpan…' : 'Simpan draft'}</button></div>
  </form></section></div>;
}

export default App;
