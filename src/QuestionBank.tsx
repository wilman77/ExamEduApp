import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { api, type BankCollectionDetail, type BankCollectionInput, type BankCollectionSummary, type QuestionInput } from './api';
import { prepareQuestionImage } from './questionImage';
import './question-bank.css';

type Props = { subjects: string[]; onToast: (message: string) => void; onUseCollection: (collection: BankCollectionDetail) => void };
type Draft = { title: string; subject: string; questions: QuestionInput[] };
const blankQuestion = (): QuestionInput => ({ prompt: '', options: ['', '', '', ''], answer: 0, explanation: '', imageData: null });
const limit = (value: string, max: number) => value.slice(0, max);
const errText = (e: unknown) => e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.';

function validQuestion(q: QuestionInput, index: number): string | null {
  if (!q.prompt.trim()) return `Pertanyaan ${index + 1}: pertanyaan wajib diisi.`;
  if (q.prompt.length > 1000) return `Pertanyaan ${index + 1}: maksimal 1000 karakter.`;
  if (q.options.length < 4 || q.options.length > 5) return `Pertanyaan ${index + 1}: pilihan harus 4 atau 5.`;
  if (q.options.some((o) => !o.trim())) return `Pertanyaan ${index + 1}: semua pilihan harus diisi.`;
  if (q.options.some((o) => o.length > 300)) return `Pertanyaan ${index + 1}: pilihan maksimal 300 karakter.`;
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return `Pertanyaan ${index + 1}: kunci jawaban tidak valid.`;
  if (q.explanation.length > 1000) return `Pertanyaan ${index + 1}: pembahasan maksimal 1000 karakter.`;
  return null;
}

function excelCellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(excelCellText).join('');
  if (typeof value === 'object') {
    const cell = value as { richText?: unknown[]; result?: unknown; text?: unknown; hyperlink?: unknown };
    if (Array.isArray(cell.richText)) return cell.richText.map(excelCellText).join('');
    if (cell.result != null) return excelCellText(cell.result);
    if (cell.text != null) return excelCellText(cell.text);
    if (cell.hyperlink != null) return excelCellText(cell.hyperlink);
  }
  return '';
}

function excelImportApi(module: typeof import('exceljs')) {
  return (module as typeof module & { default?: typeof module }).default ?? module;
}

export default function QuestionBank({ subjects, onToast, onUseCollection }: Props) {
  const [collections, setCollections] = useState<BankCollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [processingImage, setProcessingImage] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => { setLoading(true); setError(''); try { setCollections((await api.collections()).collections); } catch (e) { setError(errText(e)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const shown = useMemo(() => collections.filter((c) => `${c.title} ${c.subject}`.toLowerCase().includes(search.toLowerCase())), [collections, search]);

  const startNew = () => { setEditingId(null); setDraft({ title: '', subject: subjects[0] ?? '', questions: [blankQuestion()] }); };
  const open = async (summary: BankCollectionSummary) => { setOpenMenu(null); setLoading(true); try { const result = await api.collection(summary.id); setEditingId(summary.id); setDraft({ title: result.collection.title, subject: result.collection.subject, questions: result.collection.questions }); } catch (e) { onToast(errText(e)); } finally { setLoading(false); } };
  const useCollection = async (summary: BankCollectionSummary) => { setOpenMenu(null); try { const result = await api.collection(summary.id); onUseCollection(result.collection); } catch (e) { onToast(errText(e)); } };
  const updateQuestion = (index: number, patch: Partial<QuestionInput>) => setDraft((d) => d && ({ ...d, questions: d.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }));
  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || draft.title.length > 160) return onToast('Judul wajib diisi dan maksimal 160 karakter.');
    if (!draft.subject.trim() || draft.subject.length > 100) return onToast('Mata pelajaran wajib diisi dan maksimal 100 karakter.');
    if (!draft.questions.length || draft.questions.length > 50) return onToast('Koleksi harus memiliki 1–50 pertanyaan.');
    const invalid = draft.questions.map(validQuestion).find(Boolean); if (invalid) return onToast(invalid);
    setSaving(true); try { const input: BankCollectionInput = { title: draft.title.trim(), subject: draft.subject.trim(), questions: draft.questions }; const result = editingId ? await api.saveCollection(editingId, input) : await api.createCollection(input); setCollections((old) => editingId ? old.map((c) => c.id === result.collection.id ? result.collection : c) : [result.collection, ...old]); setEditingId(result.collection.id); setDraft({ title: result.collection.title, subject: result.collection.subject, questions: result.collection.questions }); onToast('Bank soal berhasil disimpan.'); } catch (e) { onToast(errText(e)); } finally { setSaving(false); }
  };
  const remove = async (summary: BankCollectionSummary) => { setOpenMenu(null); if (!window.confirm(`Hapus koleksi “${summary.title}”? Tindakan ini tidak dapat dibatalkan.`)) return; try { await api.deleteCollection(summary.id); setCollections((old) => old.filter((c) => c.id !== summary.id)); if (editingId === summary.id) setDraft(null); onToast('Koleksi dihapus.'); } catch (e) { onToast(errText(e)); } };
  const image = async (index: number, event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setProcessingImage(index); try { updateQuestion(index, { imageData: await prepareQuestionImage(file) }); } catch (e) { onToast(errText(e)); } finally { setProcessingImage(null); } };

  const parseImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) return onToast('Pilih file Excel .xlsx.');
    if (file.size > 5 * 1024 * 1024) return onToast('Ukuran file maksimal 5 MB.');
    setImporting(true);
    try {
      const imported = await import('exceljs'); const ExcelJS = excelImportApi(imported); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('Sheet pertama tidak ditemukan.');
      if (sheet.rowCount > 5000) throw new Error('Import ditolak: worksheet tidak boleh memiliki lebih dari 5000 baris.');
      const rows = sheet.getRows(1, sheet.rowCount) ?? []; if (!rows.length) throw new Error('File tidak memiliki baris.');
      const rowValues = (row: { values: unknown }) => row.values as unknown[];
      const headers = rowValues(rows[0]).slice(1).map(excelCellText).map((h) => h.trim().toLowerCase().replace(/\s*\(opsional\)\s*$/i, ''));
      const aliases: Record<string, string[]> = { prompt: ['pertanyaan', 'question', 'prompt'], a: ['pilihan a', 'option a', 'a'], b: ['pilihan b', 'option b', 'b'], c: ['pilihan c', 'option c', 'c'], d: ['pilihan d', 'option d', 'd'], e: ['pilihan e', 'option e', 'e'], answer: ['kunci', 'jawaban', 'answer', 'key'], explanation: ['pembahasan', 'penjelasan', 'explanation'] };
      const col = (key: string) => headers.findIndex((h) => aliases[key].includes(h)); const promptCol = col('prompt'); const answerCol = col('answer');
      if (promptCol < 0 || answerCol < 0 || ['a', 'b', 'c', 'd'].some((k) => col(k) < 0)) throw new Error('Heading wajib: Pertanyaan, Pilihan A–D, dan Kunci.');
      const dataRows: { row: typeof rows[number]; rowNumber: number }[] = [];
      for (const row of rows.slice(1)) {
        const values = rowValues(row); const hasContent = values.slice(1).some((value) => excelCellText(value).trim() !== '');
        if (!hasContent) continue;
        const rowNumber = (row as { number?: number }).number ?? dataRows.length + 2;
        if (!excelCellText(values[promptCol + 1]).trim()) throw new Error(`Baris Excel ${rowNumber}: pertanyaan wajib diisi.`);
        dataRows.push({ row, rowNumber });
        if (dataRows.length > 50) throw new Error('Import ditolak: jumlah pertanyaan melebihi 50.');
      }
      if (!dataRows.length) throw new Error('Tidak ada pertanyaan berisi.');
      const questions = dataRows.map(({ row, rowNumber }, i) => { const values = rowValues(row); const opts = ['a', 'b', 'c', 'd', 'e'].map((k) => col(k) >= 0 ? excelCellText(values[col(k) + 1]).trim() : ''); if (!opts[4]) opts.pop(); const raw = excelCellText(values[answerCol + 1]).trim().toUpperCase(); const answer = /^[A-E]$/.test(raw) ? raw.charCodeAt(0) - 65 : Number(raw) - 1; const q: QuestionInput = { prompt: excelCellText(values[promptCol + 1]).trim(), options: opts, answer, explanation: col('explanation') >= 0 ? excelCellText(values[col('explanation') + 1]).trim() : '', imageData: null }; const issue = validQuestion(q, i); if (issue) throw new Error(`Baris Excel ${rowNumber}: ${issue.replace(/^Pertanyaan \d+:\s*/, '')}`); return q; });
      const title = limit(file.name.replace(/\.xlsx$/i, '').trim() || 'Bank soal impor', 160); setEditingId(null); setDraft({ title, subject: subjects[0] ?? '', questions }); onToast('Import berhasil dipratinjau. Klik Simpan untuk menyimpan ke bank soal.');
    } catch (e) { onToast(`Import gagal: ${errText(e)}`); } finally { setImporting(false); }
  };
  const downloadTemplate = async () => { try { const imported = await import('exceljs'); const ExcelJS = excelImportApi(imported); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Bank Soal'); sheet.addRow(['Pertanyaan', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Pilihan E (opsional)', 'Kunci', 'Pembahasan (opsional)']); sheet.addRow(['Ibu kota Indonesia adalah ...', 'Bandung', 'Jakarta', 'Surabaya', 'Medan', '', 'B', 'Contoh pembahasan']); sheet.getRow(1).font = { bold: true }; sheet.columns.forEach((c) => { c.width = 24; }); const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'template-bank-soal.xlsx'; a.click(); URL.revokeObjectURL(url); } catch (e) { onToast(errText(e)); } };

  if (draft) return <Editor draft={draft} subjects={subjects} setDraft={setDraft} saving={saving} processingImage={processingImage !== null} onSave={save} onBack={() => setDraft(null)} onImage={image} updateQuestion={updateQuestion} />;
  return <main className="qb-page"><header className="qb-header"><div><p className="eyebrow">PENGELOLAAN SOAL</p><h1>Bank Soal</h1><p className="subtle">Simpan dan gunakan kembali pertanyaan untuk ujian Anda.</p></div><div className="qb-actions"><button className="btn secondary" onClick={downloadTemplate} disabled={importing}>Unduh template</button><label className="btn secondary">{importing ? 'Memproses…' : 'Impor Excel'}<input hidden type="file" accept=".xlsx" onChange={parseImport} disabled={importing} /></label><button className="btn primary" onClick={startNew} disabled={importing}>＋ Buat koleksi</button></div></header><section className="qb-toolbar"><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari koleksi atau mata pelajaran" /></div><span className="count">{collections.length} koleksi</span></section>{loading ? <div className="state">Memuat bank soal…</div> : error ? <div className="state error-state"><strong>Bank soal belum dapat dimuat</strong><span>{error}</span><button className="btn secondary" onClick={load}>Coba lagi</button></div> : shown.length === 0 ? <div className="empty"><div className="empty-icon">▤</div><h2>{search ? 'Koleksi tidak ditemukan' : 'Belum ada koleksi soal'}</h2><p>{search ? 'Coba kata kunci lain.' : 'Buat koleksi pertama atau impor dari template Excel.'}</p><button className="btn primary" onClick={startNew}>Buat koleksi pertama</button></div> : <div className="collection-grid">{shown.map((c) => <article className="collection-card" key={c.id} onClick={() => void open(c)}><div className="card-top"><span className="subject-pill">{c.subject}</span><button className="menu-button" aria-label={`Menu koleksi ${c.title}`} onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === c.id ? null : c.id); }}>•••</button>{openMenu === c.id && <div className="card-menu" onClick={(e) => e.stopPropagation()}><button onClick={(e) => { e.stopPropagation(); void open(c); }}>Lihat koleksi</button><button onClick={(e) => { e.stopPropagation(); void useCollection(c); }}>Gunakan untuk ujian</button><button onClick={(e) => { e.stopPropagation(); void remove(c); }}>Hapus</button></div>}</div><h2>{c.title}</h2><p className="card-meta">{c.questionCount} pertanyaan · Diperbarui {new Date(c.updatedAt).toLocaleDateString('id-ID')}</p><div className="card-links"><button className="text-button" onClick={(e) => { e.stopPropagation(); void open(c); }}>Lihat koleksi →</button><button className="text-button" onClick={(e) => { e.stopPropagation(); void useCollection(c); }}>Gunakan</button></div></article>)}</div>}</main>;
}

function Editor({ draft, subjects, setDraft, saving, processingImage, onSave, onBack, onImage, updateQuestion }: { draft: Draft; subjects: string[]; setDraft: React.Dispatch<React.SetStateAction<Draft | null>>; saving: boolean; processingImage: boolean; onSave: () => void; onBack: () => void; onImage: (i: number, e: ChangeEvent<HTMLInputElement>) => void; updateQuestion: (i: number, p: Partial<QuestionInput>) => void }) {
  const busy = saving || processingImage;
  return <main className="qb-page editor-page"><header className="editor-header"><button className="back-button" onClick={onBack} disabled={busy}>← Kembali</button><div><p className="eyebrow">{draft.questions.length} / 50 PERTANYAAN</p><h1>{draft.title || 'Koleksi baru'}</h1></div><button className="btn primary" onClick={onSave} disabled={busy}>{saving ? 'Menyimpan…' : 'Simpan koleksi'}</button></header><section className="collection-form"><label>Judul koleksi<input disabled={busy} maxLength={160} value={draft.title} onChange={(e) => setDraft((d) => d && ({ ...d, title: e.target.value }))} placeholder="Contoh: Latihan UTS Matematika" /><small>{draft.title.length}/160</small></label><label>Mata pelajaran<input disabled={busy} maxLength={100} list="subject-options" value={draft.subject} onChange={(e) => setDraft((d) => d && ({ ...d, subject: e.target.value }))} placeholder="Pilih atau ketik mata pelajaran" /><datalist id="subject-options">{subjects.map((s) => <option key={s} value={s} />)}</datalist></label></section><div className="editor-note">Maksimal 50 pertanyaan. Anda dapat menambahkan gambar pada setiap pertanyaan.</div><div className="questions">{draft.questions.map((q, i) => <QuestionEditor key={i} q={q} index={i} disabled={busy} update={(p) => updateQuestion(i, p)} onImage={(e) => onImage(i, e)} onRemove={() => setDraft((d) => d && ({ ...d, questions: d.questions.filter((_, n) => n !== i) }))} />)}</div><button className="add-question" disabled={busy || draft.questions.length >= 50} onClick={() => setDraft((d) => d && ({ ...d, questions: [...d.questions, blankQuestion()] }))}>＋ Tambah pertanyaan</button></main>;
}
function QuestionEditor({ q, index, update, onImage, onRemove, disabled }: { q: QuestionInput; index: number; update: (p: Partial<QuestionInput>) => void; onImage: (e: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void; disabled: boolean }) {
  const options = q.options.length === 5 ? q.options : [...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill('')];
  return <article className="question-editor"><div className="question-title"><h2>Pertanyaan {index + 1}</h2><button className="remove-button" onClick={onRemove} disabled={disabled || (index === 0 && q.prompt === '' && q.options.every((o) => !o))}>Hapus</button></div><label>Pertanyaan<textarea disabled={disabled} maxLength={1000} value={q.prompt} onChange={(e) => update({ prompt: e.target.value })} placeholder="Tulis pertanyaan…" /><small>{q.prompt.length}/1000</small></label><div className="choice-head"><span>Pilihan jawaban</span><button className="link-button" disabled={disabled} onClick={() => update({ options: q.options.length === 4 ? [...q.options, ''] : q.options.slice(0, 4), answer: Math.min(q.answer, 3) })}>{q.options.length === 4 ? '+ Tambah pilihan E' : '− Hapus pilihan E'}</button></div><div className="choices">{options.map((value, n) => <label className="choice" key={n}><input disabled={disabled} type="radio" name={`answer-${index}`} checked={q.answer === n} onChange={() => update({ answer: n })} /><span>{String.fromCharCode(65 + n)}</span><input disabled={disabled} maxLength={300} value={value} onChange={(e) => { const next = [...options]; next[n] = e.target.value; update({ options: next }); }} placeholder={`Pilihan ${String.fromCharCode(65 + n)}`} /></label>)}</div><label>Pembahasan (opsional)<textarea disabled={disabled} maxLength={1000} value={q.explanation} onChange={(e) => update({ explanation: e.target.value })} placeholder="Jelaskan jawaban yang benar…" /><small>{q.explanation.length}/1000</small></label><div className="image-row">{q.imageData ? <><img src={q.imageData} alt="Pratinjau soal" /><button className="link-button danger" disabled={disabled} onClick={() => update({ imageData: null })}>Hapus gambar</button></> : <label className="upload-link">＋ Tambah gambar<input hidden disabled={disabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={onImage} /></label>}<span>JPG, PNG, atau WebP</span></div></article>;
}
