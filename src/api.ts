export type User = { id: string; name: string; email: string; role: 'teacher' | 'student' };
export type WorkspacePreferences = { name: string; subjects: string[]; classes: string[] };
export type QuestionInput = { prompt: string; options: string[]; answer: number; explanation: string; imageData?: string | null };
export type ExamInput = { title: string; subject: string; grade: string; date: string; duration: number; questions: QuestionInput[] };
export type BankCollectionSummary = { id: string; title: string; subject: string; questionCount: number; updatedAt: number };
export type BankCollectionDetail = BankCollectionSummary & { questions: QuestionInput[] };
export type BankCollectionInput = Pick<BankCollectionDetail, 'title' | 'subject' | 'questions'>;
export type ExamDto = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  date: string;
  duration: number;
  status: 'draft' | 'published';
  questionCount: number;
  participants: number;
  submissionCount: number;
  averageScore: number | null;
};

const baseUrl = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'X-Exam-Role': 'teacher', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Permintaan gagal (${response.status}).`);
  return body;
}

export const api = {
  async me() {
    return request<{ user: User | null }>('/auth/me');
  },
  async login(email: string, password: string) {
    return request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'teacher' }) });
  },
  async register(name: string, email: string, password: string, inviteCode: string) {
    return request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role: 'teacher', inviteCode }) });
  },
  async logout() {
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' });
  },
  async workspace() {
    return request<{ workspace: WorkspacePreferences | null }>('/workspace');
  },
  async initializeWorkspace(workspace: WorkspacePreferences) {
    return request<{ workspace: WorkspacePreferences; created: boolean }>('/workspace', { method: 'POST', body: JSON.stringify(workspace) });
  },
  async saveWorkspace(workspace: WorkspacePreferences) {
    return request<{ workspace: WorkspacePreferences }>('/workspace', { method: 'PUT', body: JSON.stringify(workspace) });
  },
  async collections() {
    return request<{ collections: BankCollectionSummary[] }>('/question-collections');
  },
  async collection(id: string) {
    return request<{ collection: BankCollectionDetail }>(`/question-collections/${encodeURIComponent(id)}`);
  },
  async createCollection(collection: BankCollectionInput) {
    return request<{ collection: BankCollectionDetail }>('/question-collections', { method: 'POST', body: JSON.stringify(collection) });
  },
  async saveCollection(id: string, collection: BankCollectionInput) {
    return request<{ collection: BankCollectionDetail }>(`/question-collections/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(collection) });
  },
  async deleteCollection(id: string) {
    return request<{ ok: boolean }>(`/question-collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async exams() {
    return request<{ exams: ExamDto[] }>('/exams');
  },
  async createExam(exam: ExamInput) {
    return request<{ exam: ExamDto }>('/exams', { method: 'POST', body: JSON.stringify(exam) });
  },
  async publishExam(id: string) {
    return request<{ ok: boolean }>(`/exams/${encodeURIComponent(id)}/publish`, { method: 'POST', body: '{}' });
  },
};
