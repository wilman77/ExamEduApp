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
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  UsersRound,
  X,
} from 'lucide-react';

type ExamStatus = 'Aktif' | 'Draft' | 'Selesai';
type Exam = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  date: string;
  duration: number;
  status: ExamStatus;
  participants: number;
  color: string;
};
type Page = 'Ringkasan' | 'Ujian' | 'Bank soal' | 'Analitik';

const initialExams: Exam[] = [
  { id: 'EX-104', title: 'Penilaian Akhir Semester', subject: 'Matematika', grade: 'Kelas IX A', date: '2026-11-12', duration: 90, status: 'Aktif', participants: 28, color: 'violet' },
  { id: 'EX-103', title: 'Kuis Bab Sistem Pencernaan', subject: 'Biologi', grade: 'Kelas XI B', date: '2026-11-14', duration: 45, status: 'Draft', participants: 0, color: 'mint' },
  { id: 'EX-102', title: 'Latihan Teks Eksplanasi', subject: 'Bahasa Indonesia', grade: 'Kelas VIII C', date: '2026-11-08', duration: 60, status: 'Selesai', participants: 31, color: 'peach' },
  { id: 'EX-101', title: 'Ulangan Harian: Gerak', subject: 'Fisika', grade: 'Kelas X A', date: '2026-11-06', duration: 50, status: 'Selesai', participants: 26, color: 'blue' },
];

const navItems: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Ringkasan', icon: LayoutDashboard },
  { label: 'Ujian', icon: ClipboardList },
  { label: 'Bank soal', icon: BookOpen },
  { label: 'Analitik', icon: BarChart3 },
];

function loadExams(): Exam[] {
  try {
    const stored = localStorage.getItem('examedu-exams');
    return stored ? JSON.parse(stored) as Exam[] : initialExams;
  } catch {
    return initialExams;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function App() {
  const [page, setPage] = useState<Page>('Ringkasan');
  const [exams, setExams] = useState<Exam[]>(loadExams);
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    localStorage.setItem('examedu-exams', JSON.stringify(exams));
  }, [exams]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredExams = useMemo(() => exams.filter((exam) =>
    `${exam.title} ${exam.subject} ${exam.grade}`.toLowerCase().includes(query.toLowerCase()),
  ), [exams, query]);

  const createExam = (exam: Omit<Exam, 'id' | 'status' | 'participants' | 'color'>) => {
    const newExam: Exam = { ...exam, id: `EX-${Math.floor(100 + Math.random() * 900)}`, status: 'Draft', participants: 0, color: 'violet' };
    setExams((current) => [newExam, ...current]);
    setPage('Ujian');
    setToast('Ujian baru berhasil disimpan sebagai draft.');
  };

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
          <button className="nav-item" onClick={() => setToast('Pengaturan workspace demo belum tersedia.')}><Settings size={18} /><span>Pengaturan</span></button>
          <div className="profile-row"><div className="profile-avatar">NA</div><div className="profile-copy"><b>Nadia Aulia</b><small>Pengajar</small></div><MoreHorizontal size={18} className="muted-icon" /></div>
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
            <button className="teacher-menu" onClick={() => setToast('Anda masuk sebagai Nadia Aulia.')}><span className="profile-avatar small">NA</span><ChevronDown size={15} /></button>
          </div>
        </header>

        <div className="page-content">
          {page === 'Ringkasan' && <Dashboard exams={filteredExams} onCreate={() => setIsModalOpen(true)} onOpenExams={() => setPage('Ujian')} />}
          {page === 'Ujian' && <ExamList exams={filteredExams} onCreate={() => setIsModalOpen(true)} />}
          {page === 'Bank soal' && <QuestionBank onToast={setToast} />}
          {page === 'Analitik' && <Analytics exams={exams} />}
        </div>
      </main>

      {isModalOpen && <CreateExamModal onClose={() => setIsModalOpen(false)} onSave={createExam} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="heading-description">{description}</p></div>{action}</div>;
}

function Dashboard({ exams, onCreate, onOpenExams }: { exams: Exam[]; onCreate: () => void; onOpenExams: () => void }) {
  const activeCount = exams.filter((exam) => exam.status === 'Aktif').length;
  return <>
    <PageHeading eyebrow="SELASA, 10 NOVEMBER 2026" title="Selamat pagi, Nadia 👋" description="Ini ringkasan aktivitas ujian di kelasmu." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Buat ujian</button>} />
    <section className="stat-grid" aria-label="Ringkasan statistik">
      <StatCard label="Total ujian" value={String(exams.length).padStart(2, '0')} note="di workspace kamu" icon={<ClipboardList />} tone="lavender" trend="+2 bulan ini" />
      <StatCard label="Sedang aktif" value={String(activeCount).padStart(2, '0')} note="ujian berlangsung" icon={<Clock3 />} tone="mint" trend="Lihat jadwal" />
      <StatCard label="Total peserta" value="128" note="dari 6 kelas" icon={<UsersRound />} tone="peach" trend="+12 minggu ini" />
      <StatCard label="Rata-rata nilai" value="82,4" note="semua penilaian" icon={<BarChart3 />} tone="sky" trend="+4,8% semester ini" />
    </section>

    <section className="overview-grid">
      <div className="panel upcoming-panel">
        <div className="panel-heading"><div><h2>Jadwal mendatang</h2><p>Ujian yang perlu kamu siapkan</p></div><button className="text-button" onClick={onOpenExams}>Lihat semua <ArrowUpRight size={15} /></button></div>
        <div className="schedule-list">
          {exams.filter((exam) => exam.status !== 'Selesai').slice(0, 3).map((exam) => <div className="schedule-item" key={exam.id}>
            <div className="date-tile"><b>{new Date(`${exam.date}T00:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(`${exam.date}T00:00:00`))}</small></div>
            <div className={`subject-mark ${exam.color}`}><BookOpen size={17} /></div>
            <div className="schedule-copy"><b>{exam.title}</b><small>{exam.subject} <span>·</span> {exam.grade}</small></div>
            <span className={`status-pill ${exam.status.toLowerCase()}`}>{exam.status}</span>
            <button className="more-button" aria-label={`Opsi ${exam.title}`}><MoreHorizontal size={18} /></button>
          </div>)}
          {exams.filter((exam) => exam.status !== 'Selesai').length === 0 && <div className="empty-state">Belum ada ujian mendatang.</div>}
        </div>
      </div>
      <div className="panel activity-panel">
        <div className="panel-heading"><div><h2>Aktivitas kelas</h2><p>Partisipasi peserta minggu ini</p></div><button className="period-select" onClick={() => {}}>7 hari <ChevronDown size={14} /></button></div>
        <div className="chart-summary"><b>84%</b><span className="trend-positive">↗ 8,2%</span><small>tingkat penyelesaian</small></div>
        <div className="mini-chart" aria-label="Grafik aktivitas Senin sampai Minggu">
          {[45, 64, 52, 82, 68, 100, 73].map((height, index) => <div className="chart-column" key={index}><div className={index === 5 ? 'bar active-bar' : 'bar'} style={{ height: `${height}%` }} /><small>{['S', 'S', 'R', 'K', 'J', 'S', 'M'][index]}</small></div>)}
        </div>
      </div>
    </section>

    <section className="panel recent-panel">
      <div className="panel-heading"><div><h2>Ujian terbaru</h2><p>Ujian yang baru dibuat atau diperbarui</p></div><button className="text-button" onClick={onOpenExams}>Semua ujian <ArrowUpRight size={15} /></button></div>
      <ExamTable exams={exams.slice(0, 4)} />
    </section>

    <footer className="page-footer"><span>© 2026 ExamEdu</span><span>Panel pengajar <i>·</i> Data demo disimpan di browser</span></footer>
  </>;
}

function StatCard({ label, value, note, icon, tone, trend }: { label: string; value: string; note: string; icon: React.ReactNode; tone: string; trend: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-value">{value}</div><div className="stat-note"><span>{note}</span><span className="stat-trend">{trend}</span></div></div>;
}

function ExamList({ exams, onCreate }: { exams: Exam[]; onCreate: () => void }) {
  const [filter, setFilter] = useState<'Semua' | ExamStatus>('Semua');
  const shown = filter === 'Semua' ? exams : exams.filter((exam) => exam.status === filter);
  return <>
    <PageHeading eyebrow="KELOLA PENILAIAN" title="Semua ujian" description="Atur jadwal, peserta, dan status ujian di satu tempat." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Buat ujian</button>} />
    <div className="panel list-panel">
      <div className="filter-row"><div className="filter-tabs">{(['Semua', 'Aktif', 'Draft', 'Selesai'] as const).map((item) => <button key={item} className={filter === item ? 'filter-tab active' : 'filter-tab'} onClick={() => setFilter(item)}>{item}<span>{item === 'Semua' ? exams.length : exams.filter((exam) => exam.status === item).length}</span></button>)}</div><button className="outline-button"><CalendarDays size={15} /> Urutkan tanggal</button></div>
      <ExamTable exams={shown} />
      {shown.length === 0 && <div className="empty-state">Tidak ada ujian yang cocok. Coba kata kunci atau filter lain.</div>}
    </div>
    <footer className="page-footer"><span>© 2026 ExamEdu</span><span>Panel pengajar <i>·</i> Data demo disimpan di browser</span></footer>
  </>;
}

function ExamTable({ exams }: { exams: Exam[] }) {
  return <div className="table-scroll"><table className="exam-table"><thead><tr><th>NAMA UJIAN</th><th>MATA PELAJARAN</th><th>JADWAL</th><th>PESERTA</th><th>STATUS</th><th /></tr></thead><tbody>{exams.map((exam) => <tr key={exam.id}>
    <td><div className="exam-name"><span className={`subject-mark small-mark ${exam.color}`}><BookOpen size={15} /></span><div><b>{exam.title}</b><small>{exam.id} <span>·</span> {exam.grade}</small></div></div></td>
    <td>{exam.subject}</td><td>{formatDate(exam.date)}<small className="cell-subtext">{exam.duration} menit</small></td>
    <td><span className="participant-count"><UsersRound size={14} /> {exam.participants}</span></td>
    <td><span className={`status-pill ${exam.status.toLowerCase()}`}><i />{exam.status}</span></td>
    <td><button className="more-button" aria-label={`Menu ${exam.title}`}><MoreHorizontal size={18} /></button></td>
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
    <PageHeading eyebrow="MATERI PENILAIAN" title="Bank soal" description="Kelompokkan soal berdasarkan mata pelajaran dan topik." action={<button className="primary-button" onClick={() => onToast('Pembuatan bank soal akan tersedia setelah backend ditambahkan.')}><Plus size={17} /> Tambah soal</button>} />
    <div className="question-summary"><div className="question-summary-icon"><FileQuestion size={21} /></div><div><b>52 soal tersimpan</b><span>Soal contoh untuk melihat tata letak bank soal.</span></div><button className="outline-button" onClick={() => onToast('Impor soal belum tersedia di versi demo.')}>Impor soal</button></div>
    <div className="question-grid">{questions.map((question) => <article className="question-card" key={question.title}><div className="question-card-top"><span className={`subject-mark ${question.color}`}><BookOpen size={17} /></span><button className="more-button"><MoreHorizontal size={18} /></button></div><p className="eyebrow">{question.subject}</p><h2>{question.title}</h2><div className="question-card-meta"><span>{question.type}</span><span>·</span><b>{question.count} soal</b></div><button className="card-link" onClick={() => onToast(`Pratinjau “${question.title}” belum tersedia.`)}>Lihat koleksi <ArrowUpRight size={15} /></button></article>)}</div>
    <div className="info-banner"><span className="info-dot">i</span><p>Bank soal pada MVP ini masih berupa contoh tampilan. Penyimpanan dan pengelolaan soal membutuhkan layanan backend.</p></div>
  </>;
}

function Analytics({ exams }: { exams: Exam[] }) {
  const complete = exams.filter((exam) => exam.status === 'Selesai').length;
  const active = exams.filter((exam) => exam.status === 'Aktif').length;
  return <>
    <PageHeading eyebrow="INSIGHT PEMBELAJARAN" title="Analitik ujian" description="Pantau aktivitas dan hasil penilaian kelasmu." action={<button className="outline-button"><CalendarDays size={15} /> Semester ini <ChevronDown size={14} /></button>} />
    <section className="analytics-cards"><div className="panel analytics-score"><div className="panel-heading"><div><h2>Rata-rata nilai</h2><p>Gabungan seluruh ujian selesai</p></div><span className="stat-icon lavender"><BarChart3 /></span></div><div className="big-score">82,4<span>/100</span></div><p className="score-caption"><span>↗ 4,8%</span> dibanding periode sebelumnya</p><div className="score-meter"><span style={{ width: '82.4%' }} /></div><div className="meter-labels"><span>0</span><span>Target kelas 80</span><span>100</span></div></div><div className="panel completion-panel"><div className="panel-heading"><div><h2>Status ujian</h2><p>Ringkasan ujian di workspace</p></div><MoreHorizontal size={18} className="muted-icon" /></div><div className="completion-ring"><div><b>{exams.length}</b><small>ujian</small></div></div><div className="legend-list"><span><i className="legend-dot active-dot" />Aktif <b>{active}</b></span><span><i className="legend-dot done-dot" />Selesai <b>{complete}</b></span><span><i className="legend-dot draft-dot" />Draft <b>{exams.filter((exam) => exam.status === 'Draft').length}</b></span></div></div></section>
    <div className="panel insight-panel"><div className="panel-heading"><div><h2>Insight kelas</h2><p>Ringkasan berbasis data contoh</p></div></div><div className="insight-row"><span className="insight-number">01</span><div><b>Partisipasi paling tinggi</b><p>Kelas XI B mencatat penyelesaian ujian sebesar 96%.</p></div><span className="insight-value">96%</span></div><div className="insight-row"><span className="insight-number">02</span><div><b>Topik yang perlu diulas</b><p>Persamaan kuadrat memiliki rata-rata jawaban benar paling rendah.</p></div><span className="insight-value">58%</span></div><div className="insight-row"><span className="insight-number">03</span><div><b>Tren nilai meningkat</b><p>Rata-rata nilai naik pada tiga penilaian terakhir.</p></div><span className="insight-value positive">+4,8%</span></div></div>
    <div className="info-banner"><span className="info-dot">i</span><p>Analitik ini menampilkan data statis untuk demonstrasi, bukan hasil siswa yang sebenarnya.</p></div>
  </>;
}

function CreateExamModal({ onClose, onSave }: { onClose: () => void; onSave: (exam: Omit<Exam, 'id' | 'status' | 'participants' | 'color'>) => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Matematika');
  const [grade, setGrade] = useState('Kelas IX A');
  const [date, setDate] = useState('2026-11-20');
  const [duration, setDuration] = useState('60');
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) { setError('Nama ujian perlu diisi.'); return; }
    onSave({ title: title.trim(), subject, grade, date, duration: Math.max(1, Number(duration) || 60) });
    onClose();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">UJIAN BARU</p><h2 id="modal-title">Buat ujian</h2><p>Lengkapi informasi dasar. Ujian disimpan sebagai draft.</p></div><button className="icon-button" aria-label="Tutup" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit} className="exam-form"><label>Nama ujian<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Penilaian Akhir Bab 1" /></label><div className="form-two-col"><label>Mata pelajaran<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>Matematika</option><option>Biologi</option><option>Bahasa Indonesia</option><option>Fisika</option><option>Bahasa Inggris</option><option>Sejarah</option></select></label><label>Kelas<select value={grade} onChange={(event) => setGrade(event.target.value)}><option>Kelas VII A</option><option>Kelas VIII C</option><option>Kelas IX A</option><option>Kelas X A</option><option>Kelas XI B</option><option>Kelas XII</option></select></label></div><div className="form-two-col"><label>Tanggal ujian<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Durasi (menit)<input type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button"><Check size={16} /> Simpan draft</button></div></form></section></div>;
}

export default App;
