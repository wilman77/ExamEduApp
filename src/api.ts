export type User = { id: string; name: string; email: string; role: 'teacher' | 'student' };
export type QuestionInput = { prompt: string; options: string[]; answer: number; explanation: string };
export type ExamInput = { title: string; subject: string; grade: string; date: string; duration: number; questions: QuestionInput[] };
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
