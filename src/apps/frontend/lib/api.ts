export type ChatSource = {
  kind: "structured" | "document";
  title: string;
  document_type: string | null;
  source_uri: string | null;
  chunk_id: string | null;
};

export type ChatResponse = {
  intent: string;
  intents?: string[];
  answer: string;
  sources: ChatSource[];
  retrieved_context: string[];
  safety_notes: string[];
};

export type UserSummary = {
  id: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
  full_name: string | null;
  is_active: boolean | null;
};

export type StudentSummary = {
  id: string;
  full_name: string;
  level: string;
};

export type AttendanceRecordResponse = {
  id: string;
  student_id: string;
  class_id: string | null;
  class_date: string;
  status: string;
  note: string | null;
};

export type StudentDashboardResponse = {
  student: StudentSummary;
  progress: {
    student_id: string;
    course: string;
    recent_average: number;
    skills: Record<string, { average: number; latest: number }>;
    attendance_rate: number;
  };
  attendance: AttendanceRecordResponse[];
  teacher_feedback: Array<{
    id: string;
    student_id: string;
    teacher_name: string;
    comment: string;
    created_at: string;
  }>;
  upcoming_classes: ParentUpcomingClass[];
  class_alerts: ParentClassAlert[];
  assignment_completion: {
    completed: number;
    total: number;
  };
};

export type ParentClassAction = {
  id: string;
  class_id: string;
  action_type: "unexpected_absence_notice" | "teacher_reminder" | "assessment_result_notice";
  content: string;
  scheduled_for: string;
  sent_at?: string | null;
  created_at: string;
};

export type ParentUpcomingClass = {
  class_id: string;
  class_name: string;
  class_date: string;
  schedule_note: string | null;
  location: string | null;
  actions: ParentClassAction[];
};

export type ParentClassAlert = Omit<ParentUpcomingClass, "actions"> & ParentClassAction;

export type ClassSummary = {
  id: string;
  course_id: string;
  name: string;
  location: string | null;
  schedule_note: string | null;
  start_time: string | null;
  end_time: string | null;
  teacher_names: string[];
};

export type ClassDashboardResponse = {
  class_id: string;
  status: string;
  skill_averages: Partial<Record<ScoreResponse["skill"], number | null>>;
  alerted_students: number;
  total_students: number;
};

export type TeachingScheduleClassItem = {
  class_id: string;
  class_name: string;
  schedule_note: string | null;
  location: string | null;
  student_count: number;
  assessment_count: number;
  actions: Array<{
    id: string;
    action_type: "unexpected_absence_notice" | "teacher_reminder" | "assessment_result_notice";
    content: string;
    scheduled_for: string | null;
    status: string;
    sent_at: string | null;
  }>;
};

export type TeachingScheduleDay = {
  date: string;
  weekday_label: string;
  classes: TeachingScheduleClassItem[];
};

export type TeacherStudentAlert = {
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  reason: "absence_streak" | "average_score_low" | "latest_score_low" | "latest_assessment_low";
  reason_label: string;
  metric_value: number | null;
  metric_label: string;
  occurred_on: string | null;
};

export type TeacherPendingAssessmentReview = {
  assessment_id: string;
  class_id: string;
  class_name?: string;
  title: string;
  submitted_count: number;
  latest_submitted_at: string;
};

export type TeacherDashboardOverviewResponse = {
  start: string;
  days: number;
  schedule_days: TeachingScheduleDay[];
  alerts: TeacherStudentAlert[];
  pending_assessment_reviews: TeacherPendingAssessmentReview[];
};

export type TeacherClassActionDraft = {
  id: string;
  class_id: string;
  teacher_user_id: string;
  action_type: "unexpected_absence_notice" | "teacher_reminder" | "assessment_result_notice";
  content: string;
  scheduled_for: string | null;
  status?: string;
  sent_at?: string | null;
  sent_by_user_id?: string | null;
  created_at: string;
};

export type TeacherClassActionSendResponse = {
  draft_id: string;
  class_id: string;
  status: string;
  students_targeted: number;
  notifications_created: number;
  zalo_sent: number;
  zalo_not_linked: number;
  zalo_failed: number;
};

export type ParentNotificationResponse = {
  id: string;
  parent_user_id: string;
  student_id: string;
  type: string;
  title: string;
  content: string;
  source_type: string;
  source_id: string;
  created_by_user_id: string | null;
  read_at: string | null;
  sent_zalo_at: string | null;
  zalo_status: string;
  zalo_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CourseSummary = {
  id: string;
  name: string;
  level: string;
  description: string | null;
};

export type DocumentType = "center_policy" | "parent_handbook" | "faq" | "course_description" | "announcement";

export type DocumentResponse = {
  id: string;
  title: string;
  document_type: DocumentType;
  locale: string;
  content: string;
  source_uri: string | null;
};

export type DocumentIngestResponse = {
  document_id: string;
  chunks_created: number;
};

export type RagFolderIngestResponse = {
  documents_dir: string;
  documents_processed: number;
  chunks_created: number;
  skipped_files: string[];
};

export type AttendanceStudentStatus = {
  student_id: string;
  full_name: string;
  level: string;
  status: "present" | "absent";
  note: string | null;
};

export type AttendanceSessionResponse = {
  class_id: string;
  class_date: string;
  students: AttendanceStudentStatus[];
};

export type AdminCreateAccountRequest = {
  email: string;
  password: string;
  full_name: string;
};

export type AdminCreateTeacherResponse = {
  user: UserSummary;
  teacher: {
    id: string;
    user_id: string;
    display_name: string;
    email: string;
  };
};

export type AdminCreateParentResponse = {
  user: UserSummary;
  parent: {
    id: string;
    user_id: string;
    display_name: string;
    email: string;
    preferred_language: string;
  };
};

export type AuthLoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: UserSummary;
};

export type ScoreResponse = {
  id: string;
  student_id: string;
  class_id: string | null;
  skill: "reading" | "listening" | "speaking" | "writing" | "grammar" | "vocabulary";
  score: number;
  scale: string;
  assessed_on: string;
  source: string | null;
  teacher_id: string | null;
  teacher_comment: string | null;
  trend_summary: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type ScoreRequest = {
  skill?: ScoreResponse["skill"];
  score?: number;
  class_id?: string;
  assessed_on?: string;
  teacher_comment?: string;
};

export type AssessmentResponse = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  assessment_date: string | null;
  duration_minutes: number | null;
  lockdown_enabled: boolean;
  max_violation_count: number | null;
  created_by_teacher_id: string | null;
  created_at: string;
  submission_stats?: {
    total_students: number;
    submitted_students: number;
    graded_students: number;
    insight_students: number;
  } | null;
};

export type PublicAssessmentResponse = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  assessment_date: string | null;
  duration_minutes: number | null;
  lockdown_enabled: boolean;
  max_violation_count: number | null;
};

export type AssessmentQuestionResponse = {
  id: string;
  assessment_id: string;
  question_text: string;
  question_type: "multiple_choice" | "essay";
  choices: string[];
  expected_answer: string | null;
  skill_tag: ScoreResponse["skill"];
  max_score: number;
  position: number;
  rubric_criteria: Record<string, string>;
  score_range: string;
  created_at: string;
};

export type PublicAssessmentQuestionResponse = {
  id: string;
  assessment_id: string;
  question_text: string;
  question_type: "multiple_choice" | "essay";
  choices: string[];
  skill_tag: ScoreResponse["skill"];
  max_score: number;
  position: number;
};

export type AssessmentPrintViewResponse = {
  assessment: PublicAssessmentResponse;
  questions: PublicAssessmentQuestionResponse[];
};

export type AssessmentImportQuestionDraft = {
  question_text: string;
  question_type: "multiple_choice" | "essay";
  choices: string[];
  expected_answer: string | null;
  skill_tag: ScoreResponse["skill"];
  max_score: number;
  position?: number | null;
  rubric_criteria: Record<string, string>;
  score_range: string;
};

export type AssessmentImportDraftResponse = {
  class_id: string;
  filename: string;
  extraction_method?: string | null;
  title: string;
  description: string | null;
  assessment_date: string | null;
  questions: AssessmentImportQuestionDraft[];
  warnings: string[];
};

export type AssessmentImportResponse = {
  assessment: AssessmentResponse;
  questions: AssessmentQuestionResponse[];
};

export type StudentAssessmentListItem = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  assessment_date: string | null;
  duration_minutes: number | null;
  lockdown_enabled: boolean;
  max_violation_count: number | null;
  question_count: number;
  submitted: boolean;
};

export type StudentAssessmentAttemptResponse = {
  id: string;
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
  status: "not_started" | "in_progress" | "submitted" | "expired" | "locked" | string;
  violation_count: number;
};

export type StudentAssessmentDetailResponse = {
  assessment: PublicAssessmentResponse;
  student: StudentSummary;
  questions: PublicAssessmentQuestionResponse[];
  submitted: boolean;
  submitted_answers: Array<{ question_id: string; answer_text: string; submitted_at: string }>;
  attempt: StudentAssessmentAttemptResponse | null;
  server_now: string;
};

export type OcrDraftResponse = {
  assessment_id: string;
  student_id: string;
  filename: string;
  extraction_method?: string | null;
  extracted_text: string;
  answers: Array<{ question_id: string; answer_text: string }>;
  warning: string | null;
  warnings?: string[];
};

export type AiInsightResponse = {
  id: string;
  user_id: string | null;
  student_id: string | null;
  assessment_id: string | null;
  insight_type: string;
  content: string;
  retrieved_context: Array<Record<string, unknown>>;
  safety_notes: string[];
  is_stale: boolean;
  stale_reason: string | null;
};

export type AiInsightDraft = {
  student_id: string;
  assessment_id?: string | null;
  insight_type: string;
  content: string;
  retrieved_context: Array<Record<string, unknown>>;
  safety_notes: string[];
};

export type StudentAssessmentSubmissionResponse = {
  assessment_id: string;
  student_id: string;
  answers_saved: number;
  total_score: number | null;
  max_score: number;
  ai_insight_status?: string | null;
  ai_insight?: AiInsightResponse | null;
  ai_insight_draft?: AiInsightDraft | null;
  alert_status?: {
    alerts_checked: number;
    notifications_created: number;
  } | null;
};

export type StudentAnswerResponse = {
  id: string;
  student_id: string;
  assessment_question_id: string;
  assessment_id: string;
  question_text: string;
  question_type: "multiple_choice" | "essay";
  choices: string[];
  expected_answer: string | null;
  skill_tag: ScoreResponse["skill"];
  answer_text: string;
  score_awarded: number | null;
  teacher_feedback: string | null;
  submitted_at: string;
};

export type StudentAssessmentSummaryResponse = {
  student_id: string;
  assessment_id: string | null;
  assessments: Array<{
    id: string;
    title: string;
    class_id: string;
    assessment_date: string | null;
    is_finalized?: boolean;
    total_score: number | null;
    max_score: number;
    questions: Array<{
      question_id: string;
      question_type: "multiple_choice" | "essay";
      skill: ScoreResponse["skill"];
      question_text: string;
      student_answer: string;
      score_awarded: number | null;
      max_score: number;
      teacher_feedback: string | null;
      rubric_criteria: Record<string, string>;
    }>;
  }>;
  skill_summary: Record<string, { score: number; max_score: number; percent: number | null; answered: number }>;
  strengths: string[];
  weaknesses: string[];
};
export type ZaloLinkSessionResponse = {
  id: string;
  student_id: string;
  channel: "zalo";
  status: string;
  session_token: string;
  qr_code_url: string | null;
  deep_link_url: string | null;
  linking_message: string | null;
  bot_display_name: string | null;
  otp_code: string | null;
  otp_expires_at: string | null;
  sender_id: string | null;
  zalo_display_name: string | null;
  expires_at: string;
  error_message: string | null;
};

export type StudentZaloQrResponse = {
  student_id: string;
  status: string;
  connected: boolean;
  qr_code_url: string | null;
  deep_link_url: string | null;
  linking_message: string | null;
  bot_display_name: string | null;
  session_token: string | null;
  otp_code: string | null;
  otp_expires_at: string | null;
  expires_at: string | null;
  sender_id: string | null;
  zalo_display_name: string | null;
  error_message: string | null;
};

export type ZaloChannelLinkResponse = {
  id: string;
  student_id: string;
  channel: "zalo";
  sender_id: string;
  zalo_display_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type ZaloChatThreadResponse = {
  student_id: string | null;
  student_name: string | null;
  student_level: string | null;
  sender_id: string;
  zalo_display_name: string | null;
  channel_link_id: string | null;
  link_status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  message_count: number;
};

export type ZaloMessageResponse = {
  id: string;
  student_id: string | null;
  channel_link_id: string | null;
  sender_id: string;
  zalo_display_name: string | null;
  direction: string;
  content: string;
  raw_message_id: string | null;
  sent_at: string;
  created_at: string;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function parseError(response: Response, fallback: string) {
  await response.json().catch(() => null);
  return fallback;
}

export async function getMe(accessToken: string): Promise<UserSummary> {
  const response = await fetch(`${backendUrl}/api/me`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể xác định người dùng hiện tại");
  }
  return response.json();
}


export async function login(email: string, password: string): Promise<AuthLoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
  }
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.");
  }
  return response.json();
}

export async function getAdminUsers(accessToken: string): Promise<UserSummary[]> {
  const response = await fetch(`${backendUrl}/api/admin/users`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải danh sách người dùng");
  }
  return response.json();
}

export async function deleteAdminUser(userId: string, accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể xoá người dùng");
  }
  return response.json();
}

export async function getAdminStudents(accessToken: string): Promise<StudentSummary[]> {
  const response = await fetch(`${backendUrl}/api/admin/students`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải danh sách học viên");
  }
  return response.json();
}

export async function deleteAdminStudent(studentId: string, accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/admin/students/${studentId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể xoá học viên");
  }
  return response.json();
}

export async function getAdminClasses(accessToken: string): Promise<ClassSummary[]> {
  const response = await fetch(`${backendUrl}/api/admin/classes`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải danh sách lớp học");
  }
  return response.json();
}

export async function getAdminCourses(accessToken: string): Promise<CourseSummary[]> {
  const response = await fetch(`${backendUrl}/api/admin/courses`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải danh sách khóa học");
  }
  return response.json();
}

export async function createAdminClass(
  classRecord: {
    course_id: string;
    location?: string;
    starts_on?: string;
    ends_on?: string;
    schedule_note: string;
    start_time: string;
    end_time: string;
  },
  accessToken: string,
): Promise<ClassSummary> {
  const response = await fetch(`${backendUrl}/api/admin/classes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(classRecord),
  });
  if (!response.ok) {
    throw new Error("Không thể tạo lớp học");
  }
  return response.json();
}

export async function deleteAdminClass(classId: string, accessToken: string): Promise<{ status: string; class_id: string }> {
  const response = await fetch(`${backendUrl}/api/admin/classes/${classId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể xoá lớp học");
  }
  return response.json();
}

export async function createDocument(
  document: { title: string; document_type: DocumentType; content: string; locale: string; source_uri?: string },
  accessToken: string,
): Promise<DocumentResponse> {
  const response = await fetch(`${backendUrl}/api/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(document),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tạo tài liệu"));
  }
  return response.json();
}

export async function ingestDocument(documentId: string, accessToken: string): Promise<DocumentIngestResponse> {
  const response = await fetch(`${backendUrl}/api/documents/${documentId}/ingest`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể ingest tài liệu"));
  }
  return response.json();
}

export async function ingestDocumentsFolder(accessToken: string): Promise<RagFolderIngestResponse> {
  const response = await fetch(`${backendUrl}/api/documents/ingest-folder`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể ingest thư mục tài liệu"));
  }
  return response.json();
}

export async function getTeacherClasses(accessToken: string): Promise<ClassSummary[]> {
  const response = await fetch(`${backendUrl}/api/teacher/classes`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải lớp được phân công");
  }
  return response.json();
}

export async function getClassDashboard(classId: string, accessToken: string): Promise<ClassDashboardResponse> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/dashboard`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải xu hướng lớp học"));
  }
  return response.json();
}

export async function getTeacherDashboardOverview(
  start: string,
  days: number,
  accessToken: string,
): Promise<TeacherDashboardOverviewResponse> {
  const params = new URLSearchParams({ start, days: String(days) });
  const response = await fetch(`${backendUrl}/api/teacher/dashboard-overview?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải tổng quan lịch dạy");
  }
  return response.json();
}

export async function createTeacherClassActionDraft(
  classId: string,
  actionType: TeacherClassActionDraft["action_type"],
  content: string,
  scheduledFor: string,
  accessToken: string,
): Promise<TeacherClassActionDraft> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/action-drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ action_type: actionType, content, scheduled_for: scheduledFor }),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể gửi thông báo lớp");
  }
  return response.json();
}

export async function sendTeacherClassActionDraft(
  classId: string,
  draftId: string,
  accessToken: string,
): Promise<TeacherClassActionSendResponse> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/action-drafts/${draftId}/send`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể gửi thông báo tới phụ huynh"));
  }
  return response.json();
}

export async function getParentNotifications(accessToken: string, limit = 20): Promise<ParentNotificationResponse[]> {
  const response = await fetch(`${backendUrl}/api/parent/notifications?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải thông báo phụ huynh"));
  }
  return response.json();
}

export async function markParentNotificationRead(notificationId: string, accessToken: string): Promise<ParentNotificationResponse> {
  const response = await fetch(`${backendUrl}/api/parent/notifications/${notificationId}/read`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể đánh dấu thông báo đã đọc"));
  }
  return response.json();
}

export async function getClassStudents(classId: string, accessToken: string): Promise<StudentSummary[]> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/students`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải học viên trong lớp");
  }
  return response.json();
}

export async function getClassAttendanceDates(classId: string, accessToken: string): Promise<string[]> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/attendance-dates`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải ngày điểm danh");
  }
  return response.json();
}

export async function getClassAttendanceSession(classId: string, classDate: string, accessToken: string): Promise<AttendanceSessionResponse> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/attendance/${classDate}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải điểm danh");
  }
  return response.json();
}

export async function saveClassAttendance(
  classId: string,
  classDate: string,
  records: Array<{ student_id: string; status: "present" | "absent"; note?: string | null }>,
  accessToken: string,
): Promise<AttendanceSessionResponse> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/attendance/${classDate}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ class_date: classDate, records }),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể lưu điểm danh");
  }
  return response.json();
}

export async function createTeacher(
  account: AdminCreateAccountRequest,
  accessToken: string,
): Promise<AdminCreateTeacherResponse> {
  const response = await fetch(`${backendUrl}/api/admin/teachers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(account),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tạo giáo viên"));
  }
  return response.json();
}

export async function createParent(
  account: AdminCreateAccountRequest & { preferred_language?: string },
  accessToken: string,
): Promise<AdminCreateParentResponse> {
  const response = await fetch(`${backendUrl}/api/admin/parents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(account),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tạo phụ huynh"));
  }
  return response.json();
}

export async function createStudent(
  student: { full_name: string; level: string; class_id?: string; parent_user_id: string; student_email?: string; student_password?: string },
  accessToken: string,
): Promise<StudentSummary> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/admin/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(accessToken),
      },
      body: JSON.stringify(student),
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
  }
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể tạo học viên");
  }
  return response.json();
}

export async function linkParentStudent(
  link: { parent_user_id: string; student_id: string },
  accessToken: string,
): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/admin/parent-student-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(link),
  });
  if (!response.ok) {
    throw new Error("Không thể liên kết phụ huynh và học viên");
  }
  return response.json();
}

export async function assignTeacherClass(
  link: { teacher_user_id: string; class_id: string },
  accessToken: string,
): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/admin/teacher-class-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(link),
  });
  if (!response.ok) {
    throw new Error("Không thể phân công giáo viên vào lớp");
  }
  return response.json();
}

export async function createZaloLinkSession(
  studentId: string,
  accessToken: string,
): Promise<ZaloLinkSessionResponse> {
  const response = await fetch(`${backendUrl}/api/integrations/zalo/link-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ student_id: studentId }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tạo phiên liên kết Zalo"));
  }
  return response.json();
}

export async function getZaloLinkSession(
  sessionToken: string,
  accessToken: string,
): Promise<ZaloLinkSessionResponse> {
  const response = await fetch(`${backendUrl}/api/integrations/zalo/link-sessions/${sessionToken}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải trạng thái liên kết Zalo"));
  }
  return response.json();
}

export async function getStudentChannelLinks(
  studentId: string,
  accessToken: string,
): Promise<ZaloChannelLinkResponse[]> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/channel-links`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải liên kết Zalo của học viên"));
  }
  return response.json();
}

export async function getStudentZaloQr(
  studentId: string,
  accessToken: string,
): Promise<StudentZaloQrResponse> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/zalo-qr`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải mã QR Zalo"));
  }
  return response.json();
}

export async function getMyChildren(accessToken: string): Promise<StudentSummary[]> {
  const response = await fetch(`${backendUrl}/api/students/my-children`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải danh sách học viên được liên kết");
  }
  return response.json();
}

export async function getStudent(studentId: string, accessToken: string): Promise<StudentSummary> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải thông tin học viên");
  }
  return response.json();
}

export async function getStudentDashboard(studentId: string, accessToken: string): Promise<StudentDashboardResponse> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/dashboard`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải tổng quan học viên");
  }
  return response.json();
}

export async function sendChat(message: string, studentId: string, accessToken: string): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(accessToken),
      },
      body: JSON.stringify({ message, student_id: studentId, locale: "vi" }),
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
  }
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể lấy phản hồi từ trợ lý"));
  }
  return response.json();
}

export async function clearChatSession(accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/ai/chat/session`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể xoá session chat");
  }
  return response.json();
}

export async function getStudentScores(studentId: string, accessToken: string): Promise<ScoreResponse[]> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/scores`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải điểm của học viên");
  }
  return response.json();
}

export async function createStudentScore(
  studentId: string,
  score: Required<Pick<ScoreRequest, "skill" | "score">> & ScoreRequest,
  accessToken: string,
): Promise<ScoreResponse> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/scores`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(score),
  });
  if (!response.ok) {
    throw new Error("Không thể tạo điểm");
  }
  return response.json();
}

export async function updateScore(scoreId: string, score: ScoreRequest, accessToken: string): Promise<ScoreResponse> {
  const response = await fetch(`${backendUrl}/api/scores/${scoreId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(score),
  });
  if (!response.ok) {
    throw new Error("Không thể cập nhật điểm");
  }
  return response.json();
}

export async function createAssessment(
  assessment: {
    class_id: string;
    title: string;
    description?: string;
    assessment_date?: string;
    duration_minutes?: number | null;
    lockdown_enabled?: boolean;
    max_violation_count?: number | null;
  },
  accessToken: string,
): Promise<AssessmentResponse> {
  const response = await fetch(`${backendUrl}/api/assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(assessment),
  });
  if (!response.ok) {
    throw new Error("Không thể tạo bài đánh giá");
  }
  return response.json();
}

export async function createAssessmentImportDraft(
  classId: string,
  files: File | File[],
  accessToken: string,
): Promise<AssessmentImportDraftResponse> {
  const form = new FormData();
  appendUploadFiles(form, files);
  const response = await fetch(`${backendUrl}/api/classes/${classId}/assessments/import-draft`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: form,
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể đọc file bài kiểm tra");
  }
  return response.json();
}

export async function createAssessmentQuestionImportDraft(
  assessmentId: string,
  files: File | File[],
  accessToken: string,
): Promise<AssessmentImportDraftResponse> {
  const form = new FormData();
  appendUploadFiles(form, files);
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/questions/import-draft`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: form,
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể đọc file bài kiểm tra");
  }
  return response.json();
}

export async function importAssessmentFromDraft(
  classId: string,
  draft: {
    title: string;
    description?: string | null;
    assessment_date?: string | null;
    duration_minutes?: number | null;
    lockdown_enabled?: boolean;
    max_violation_count?: number | null;
    questions: AssessmentImportQuestionDraft[];
  },
  accessToken: string,
): Promise<AssessmentImportResponse> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/assessments/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể tạo bài kiểm tra từ draft");
  }
  return response.json();
}

export async function getClassAssessments(classId: string, accessToken: string): Promise<AssessmentResponse[]> {
  const response = await fetch(`${backendUrl}/api/classes/${classId}/assessments`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải bài đánh giá");
  }
  return response.json();
}

export async function getAssessment(assessmentId: string, accessToken: string): Promise<AssessmentResponse> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải bài kiểm tra");
  }
  return response.json();
}

export async function getAssessmentPrintView(assessmentId: string, accessToken: string): Promise<AssessmentPrintViewResponse> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/print-view`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải bản in bài kiểm tra");
  }
  return response.json();
}

export async function deleteAssessment(assessmentId: string, accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể xoá bài kiểm tra");
  }
  return response.json();
}

export async function getStudentAssessments(accessToken: string): Promise<StudentAssessmentListItem[]> {
  const response = await fetch(`${backendUrl}/api/student/assessments`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải bài kiểm tra của học viên");
  }
  return response.json();
}

export async function getStudentAssessmentDetail(assessmentId: string, accessToken: string): Promise<StudentAssessmentDetailResponse> {
  const response = await fetch(`${backendUrl}/api/student/assessments/${assessmentId}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải bài kiểm tra");
  }
  return response.json();
}

export async function startStudentAssessmentAttempt(assessmentId: string, accessToken: string): Promise<StudentAssessmentAttemptResponse> {
  const response = await fetch(`${backendUrl}/api/student/assessments/${assessmentId}/attempts/start`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể bắt đầu bài kiểm tra");
  }
  return response.json();
}

export async function logStudentAssessmentAttemptEvent(
  assessmentId: string,
  event: {
    event_type: "started" | "fullscreen_exit" | "tab_hidden" | "window_blur" | "copy_attempt" | "paste_attempt" | "context_menu_attempt" | "expired" | "submitted";
    occurred_at?: string;
    metadata?: Record<string, unknown>;
  },
  accessToken: string,
): Promise<StudentAssessmentAttemptResponse> {
  const response = await fetch(`${backendUrl}/api/student/assessments/${assessmentId}/attempts/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể ghi nhận sự kiện làm bài");
  }
  return response.json();
}

export async function submitOwnStudentAssessment(
  assessmentId: string,
  submission: {
    student_id: string;
    submitted_at?: string;
    attempt_id?: string | null;
    answers: Array<{
      question_id: string;
      answer_text: string;
    }>;
  },
  accessToken: string,
): Promise<{ assessment_id: string; student_id: string; answers_saved: number; total_score: number | null; max_score: number }> {
  const response = await fetch(`${backendUrl}/api/student/assessments/${assessmentId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(submission),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể nộp bài kiểm tra");
  }
  return response.json();
}

export async function createOcrDraft(
  assessmentId: string,
  studentId: string,
  files: File | File[],
  accessToken: string,
): Promise<OcrDraftResponse> {
  const form = new FormData();
  form.append("student_id", studentId);
  appendUploadFiles(form, files);
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/ocr-drafts`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: form,
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể OCR bài làm");
  }
  return response.json();
}

function appendUploadFiles(form: FormData, files: File | File[]) {
  const uploadFiles = Array.isArray(files) ? files : [files];
  if (uploadFiles.length === 1) {
    form.append("file", uploadFiles[0]);
    return;
  }
  for (const file of uploadFiles) {
    form.append("files", file);
  }
}

export async function getAssessmentQuestions(
  assessmentId: string,
  accessToken: string,
): Promise<AssessmentQuestionResponse[]> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/questions`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải câu hỏi");
  }
  return response.json();
}

export async function createAssessmentQuestion(
  assessmentId: string,
  question: {
    question_text: string;
    question_type?: "multiple_choice" | "essay";
    choices?: string[];
    expected_answer?: string;
    skill_tag: ScoreResponse["skill"];
    max_score: number;
    rubric_criteria: Record<string, string>;
    score_range: string;
  },
  accessToken: string,
): Promise<AssessmentQuestionResponse> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(question),
  });
  if (!response.ok) {
    throw new Error("Không thể tạo câu hỏi đánh giá");
  }
  return response.json();
}

export async function updateAssessmentQuestion(
  questionId: string,
  question: {
    question_text: string;
    question_type: "multiple_choice" | "essay";
    choices: string[];
    expected_answer?: string;
    skill_tag: ScoreResponse["skill"];
    max_score: number;
    rubric_criteria: Record<string, string>;
    score_range: string;
  },
  accessToken: string,
): Promise<AssessmentQuestionResponse> {
  const response = await fetch(`${backendUrl}/api/questions/${questionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(question),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể cập nhật câu hỏi"));
  }
  return response.json();
}

export async function deleteAssessmentQuestion(questionId: string, accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/api/questions/${questionId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể xoá câu hỏi");
  }
  return response.json();
}

export async function deleteAllAssessmentQuestions(
  assessmentId: string,
  accessToken: string,
): Promise<{ status: string; assessment_id: string; questions_deleted: number }> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/questions`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể xoá toàn bộ câu hỏi"));
  }
  return response.json();
}

export async function createStudentAnswer(
  questionId: string,
  answer: {
    student_id: string;
    answer_text: string;
    submitted_at?: string;
  },
  accessToken: string,
): Promise<StudentAnswerResponse> {
  const response = await fetch(`${backendUrl}/api/questions/${questionId}/student-answers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(answer),
  });
  if (!response.ok) {
    throw new Error("Không thể tạo câu trả lời của học viên");
  }
  return response.json();
}

export async function submitStudentAssessment(
  assessmentId: string,
  submission: {
    student_id: string;
    submitted_at?: string;
    answers: Array<{
      question_id: string;
      answer_text: string;
      score_awarded?: number;
      teacher_feedback?: string;
    }>;
  },
  accessToken: string,
): Promise<StudentAssessmentSubmissionResponse> {
  const response = await fetch(`${backendUrl}/api/assessments/${assessmentId}/student-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(submission),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể lưu bài làm của học viên");
  }
  return response.json();
}

export async function getStudentAiInsights(
  studentId: string,
  accessToken: string,
  insightType = "assessment_progress",
): Promise<AiInsightResponse[]> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/ai-insights?type=${encodeURIComponent(insightType)}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải AI insight");
  }
  return response.json();
}

export async function approveStudentAiInsight(
  studentId: string,
  draft: AiInsightDraft,
  accessToken: string,
  contentOverride?: string,
): Promise<AiInsightResponse> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/ai-insights/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({
      assessment_id: draft.assessment_id,
      content: contentOverride ?? draft.content,
      retrieved_context: draft.retrieved_context,
      safety_notes: draft.safety_notes,
    }),
  });
  if (!response.ok) {
    await response.json().catch(() => null);
    throw new Error("Không thể duyệt AI Insight");
  }
  return response.json();
}

export async function getStudentAssessmentSummary(
  studentId: string,
  accessToken: string,
  assessmentId?: string,
): Promise<StudentAssessmentSummaryResponse> {
  const query = assessmentId ? `?assessment_id=${encodeURIComponent(assessmentId)}` : "";
  const response = await fetch(`${backendUrl}/api/students/${studentId}/assessment-summary${query}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải phân tích bài kiểm tra");
  }
  return response.json();
}

export async function getStudentAnswers(studentId: string, accessToken: string): Promise<StudentAnswerResponse[]> {
  const response = await fetch(`${backendUrl}/api/students/${studentId}/answers`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error("Không thể tải câu trả lời của học viên");
  }
  return response.json();
}

export async function listZaloChatThreads(accessToken: string): Promise<ZaloChatThreadResponse[]> {
  const response = await fetch(`${backendUrl}/api/admin/zalo/threads`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải danh sách hội thoại Zalo"));
  }
  return response.json();
}

export async function listZaloThreadMessages(
  senderId: string,
  studentId: string | null,
  accessToken: string,
): Promise<ZaloMessageResponse[]> {
  const params = new URLSearchParams({ sender_id: senderId });
  if (studentId) {
    params.set("student_id", studentId);
  }
  const response = await fetch(`${backendUrl}/api/admin/zalo/messages?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Không thể tải tin nhắn của hội thoại Zalo"));
  }
  return response.json();
}
