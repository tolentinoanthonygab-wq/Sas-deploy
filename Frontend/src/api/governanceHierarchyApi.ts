import { buildApiUrl } from "./apiUrl";

const getAuthToken = () =>
  localStorage.getItem("authToken") ||
  localStorage.getItem("token") ||
  localStorage.getItem("access_token");

const withAuthHeaders = () => {
  const token = getAuthToken();
  if (!token) throw new Error("No authentication token found");
  return { Authorization: `Bearer ${token}` };
};

const parseError = async (response: Response, fallback: string): Promise<string> => {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return fallback;

  let body:
    | {
        detail?: unknown;
        message?: unknown;
      }
    | null = null;

  try {
    body = JSON.parse(raw) as {
      detail?: unknown;
      message?: unknown;
    };
  } catch {
    return raw.trim() || fallback;
  }

  if (!body || typeof body !== "object") return raw.trim() || fallback;

  if (typeof body.detail === "string" && body.detail.trim()) return body.detail;

  if (body.detail && typeof body.detail === "object") {
    const nestedMessage = (body.detail as { message?: unknown; reason?: unknown }).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage;

    const nestedReason = (body.detail as { reason?: unknown }).reason;
    if (typeof nestedReason === "string" && nestedReason.trim()) return nestedReason;

    return JSON.stringify(body.detail);
  }

  if (typeof body.message === "string" && body.message.trim()) return body.message;

  return raw.trim() || fallback;
};

const toQuery = (params: Record<string, string | number | boolean | null | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
};

export type GovernanceUnitType = "SSG" | "SG" | "ORG";

export type GovernancePermissionCode =
  | "create_sg"
  | "create_org"
  | "manage_students"
  | "view_students"
  | "manage_members"
  | "manage_events"
  | "manage_attendance"
  | "manage_announcements"
  | "assign_permissions";

export interface GovernanceUnitSummary {
  id: number;
  unit_code: string;
  unit_name: string;
  description?: string | null;
  unit_type: GovernanceUnitType;
  parent_unit_id?: number | null;
  school_id: number;
  department_id?: number | null;
  program_id?: number | null;
  created_by_user_id?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GovernanceUserSummary {
  id: number;
  email: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  school_id?: number | null;
  is_active: boolean;
  student_profile?: GovernanceStudentProfileSummary | null;
}

export interface GovernanceStudentProfileSummary {
  id: number;
  student_id?: string | null;
  department_id?: number | null;
  program_id?: number | null;
  department_name?: string | null;
  program_name?: string | null;
  year_level?: number | null;
}

export interface GovernancePermissionItem {
  id: number;
  permission_code: GovernancePermissionCode;
  permission_name: string;
  description?: string | null;
}

export interface GovernanceUnitPermissionItem {
  id: number;
  governance_unit_id: number;
  permission_id: number;
  granted_by_user_id?: number | null;
  created_at: string;
  permission: GovernancePermissionItem;
}

export interface GovernanceMemberItem {
  id: number;
  governance_unit_id: number;
  user_id: number;
  position_title?: string | null;
  assigned_by_user_id?: number | null;
  assigned_at: string;
  is_active: boolean;
  user: GovernanceUserSummary;
  member_permissions: GovernanceMemberPermissionItem[];
}

export interface GovernanceUnitDetail extends GovernanceUnitSummary {
  members: GovernanceMemberItem[];
  unit_permissions: GovernanceUnitPermissionItem[];
}

export interface GovernanceMemberPermissionItem {
  id: number;
  permission_id: number;
  granted_by_user_id?: number | null;
  created_at: string;
  permission: GovernancePermissionItem;
}

export interface GovernanceAccessUnitItem {
  governance_unit_id: number;
  unit_code: string;
  unit_name: string;
  unit_type: GovernanceUnitType;
  permission_codes: GovernancePermissionCode[];
}

export interface GovernanceAccessResponse {
  user_id: number;
  school_id: number;
  permission_codes: GovernancePermissionCode[];
  units: GovernanceAccessUnitItem[];
}

export interface GovernanceSsgSetupResponse {
  unit: GovernanceUnitDetail;
  total_imported_students: number;
}

export interface CreateGovernanceUnitPayload {
  unit_code: string;
  unit_name: string;
  description?: string | null;
  unit_type: GovernanceUnitType;
  parent_unit_id?: number | null;
  department_id?: number | null;
  program_id?: number | null;
}

export interface UpdateGovernanceUnitPayload {
  unit_code?: string;
  unit_name?: string;
  description?: string | null;
}

export interface AssignGovernanceMemberPayload {
  user_id: number;
  position_title?: string | null;
  permission_codes?: GovernancePermissionCode[];
}

export interface UpdateGovernanceMemberPayload {
  user_id?: number;
  position_title?: string | null;
  permission_codes?: GovernancePermissionCode[];
}

export interface AssignGovernancePermissionPayload {
  permission_code: GovernancePermissionCode;
}

export interface GovernanceStudentCandidate {
  user: GovernanceUserSummary;
  student_profile: GovernanceStudentProfileSummary;
  is_current_governance_member: boolean;
}

export interface GovernanceAccessibleStudent {
  user: GovernanceUserSummary;
  student_profile: GovernanceStudentProfileSummary;
}

export interface GovernanceDashboardAnnouncementSummary {
  id: number;
  title: string;
  status: GovernanceAnnouncementStatus;
  author_name?: string | null;
  updated_at: string;
}

export interface GovernanceDashboardChildUnitSummary {
  id: number;
  unit_code: string;
  unit_name: string;
  description?: string | null;
  unit_type: GovernanceUnitType;
  member_count: number;
}

export interface GovernanceDashboardOverview {
  governance_unit_id: number;
  unit_type: GovernanceUnitType;
  published_announcement_count: number;
  total_students: number;
  recent_announcements: GovernanceDashboardAnnouncementSummary[];
  child_units: GovernanceDashboardChildUnitSummary[];
}

export interface GovernanceEventDefaults {
  governance_unit_id: number;
  school_id: number;
  unit_type: GovernanceUnitType;
  inherits_school_defaults: boolean;
  override_early_check_in_minutes?: number | null;
  override_late_threshold_minutes?: number | null;
  override_sign_out_grace_minutes?: number | null;
  effective_early_check_in_minutes: number;
  effective_late_threshold_minutes: number;
  effective_sign_out_grace_minutes: number;
}

export interface GovernanceEventDefaultsUpdatePayload {
  early_check_in_minutes?: number | null;
  late_threshold_minutes?: number | null;
  sign_out_grace_minutes?: number | null;
}

export type GovernanceAnnouncementStatus = "draft" | "published" | "archived";

export interface GovernanceAnnouncementItem {
  id: number;
  governance_unit_id: number;
  school_id: number;
  title: string;
  body: string;
  status: GovernanceAnnouncementStatus;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  author_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAnnouncementMonitorItem extends GovernanceAnnouncementItem {
  governance_unit_code: string;
  governance_unit_name: string;
  governance_unit_type: GovernanceUnitType;
  governance_unit_description?: string | null;
}

export interface GovernanceAnnouncementPayload {
  title: string;
  body: string;
  status: GovernanceAnnouncementStatus;
}

export interface GovernanceStudentNoteItem {
  id: number;
  governance_unit_id: number;
  student_profile_id: number;
  school_id: number;
  tags: string[];
  notes: string;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceStudentNotePayload {
  tags: string[];
  notes: string;
}

export const fetchGovernanceUnits = async (params: {
  unit_type?: GovernanceUnitType;
  parent_unit_id?: number;
  include_inactive?: boolean;
} = {}): Promise<GovernanceUnitSummary[]> => {
  const query = toQuery(params);
  const response = await fetch(buildApiUrl(`/api/governance/units${query ? `?${query}` : ""}`), {
    method: "GET",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance units"));
  return (await response.json()) as GovernanceUnitSummary[];
};

export const fetchGovernanceUnitDetails = async (
  governanceUnitId: number
): Promise<GovernanceUnitDetail> => {
  const response = await fetch(buildApiUrl(`/api/governance/units/${governanceUnitId}`), {
    method: "GET",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance unit details"));
  return (await response.json()) as GovernanceUnitDetail;
};

export const fetchGovernanceDashboardOverview = async (
  governanceUnitId: number
): Promise<GovernanceDashboardOverview> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/dashboard-overview`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance dashboard overview"));
  return (await response.json()) as GovernanceDashboardOverview;
};

export const fetchGovernanceEventDefaults = async (
  governanceUnitId: number
): Promise<GovernanceEventDefaults> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/event-defaults`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to fetch governance event defaults"));
  }
  return (await response.json()) as GovernanceEventDefaults;
};

export const updateGovernanceEventDefaults = async (
  governanceUnitId: number,
  payload: GovernanceEventDefaultsUpdatePayload
): Promise<GovernanceEventDefaults> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/event-defaults`),
    {
      method: "PUT",
      headers: {
        ...withAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(await parseError(response, "Failed to update governance event defaults"));
  }
  return (await response.json()) as GovernanceEventDefaults;
};

export const fetchMyGovernanceAccess = async (): Promise<GovernanceAccessResponse> => {
  const response = await fetch(buildApiUrl("/api/governance/access/me"), {
    method: "GET",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance access"));
  return (await response.json()) as GovernanceAccessResponse;
};

export const fetchCampusSsgSetup = async (): Promise<GovernanceSsgSetupResponse> => {
  const response = await fetch(buildApiUrl("/api/governance/ssg/setup"), {
    method: "GET",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch campus SSG setup"));
  return (await response.json()) as GovernanceSsgSetupResponse;
};

export const createGovernanceUnit = async (
  payload: CreateGovernanceUnitPayload
): Promise<GovernanceUnitDetail> => {
  const response = await fetch(buildApiUrl("/api/governance/units"), {
    method: "POST",
    headers: {
      ...withAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to create governance unit"));
  return (await response.json()) as GovernanceUnitDetail;
};

export const updateGovernanceUnit = async (
  governanceUnitId: number,
  payload: UpdateGovernanceUnitPayload
): Promise<GovernanceUnitDetail> => {
  const response = await fetch(buildApiUrl(`/api/governance/units/${governanceUnitId}`), {
    method: "PATCH",
    headers: {
      ...withAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to update governance unit"));
  return (await response.json()) as GovernanceUnitDetail;
};

export const deleteGovernanceUnit = async (governanceUnitId: number): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/governance/units/${governanceUnitId}`), {
    method: "DELETE",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to delete governance unit"));
};

export const searchGovernanceStudentCandidates = async (params: {
  q?: string;
  governance_unit_id?: number;
  limit?: number;
}): Promise<GovernanceStudentCandidate[]> => {
  const query = toQuery(params);
  const response = await fetch(
    buildApiUrl(`/api/governance/students/search${query ? `?${query}` : ""}`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to search student candidates"));
  return (await response.json()) as GovernanceStudentCandidate[];
};

export const fetchAccessibleGovernanceStudents = async (params: {
  governance_context?: GovernanceUnitType;
  skip?: number;
  limit?: number;
} = {}): Promise<GovernanceAccessibleStudent[]> => {
  const query = toQuery(params);
  const response = await fetch(buildApiUrl(`/api/governance/students${query ? `?${query}` : ""}`), {
    method: "GET",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance students"));
  return (await response.json()) as GovernanceAccessibleStudent[];
};

export const assignGovernanceMember = async (
  governanceUnitId: number,
  payload: AssignGovernanceMemberPayload
): Promise<GovernanceMemberItem> => {
  const response = await fetch(buildApiUrl(`/api/governance/units/${governanceUnitId}/members`), {
    method: "POST",
    headers: {
      ...withAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to assign governance member"));
  return (await response.json()) as GovernanceMemberItem;
};

export const updateGovernanceMember = async (
  governanceMemberId: number,
  payload: UpdateGovernanceMemberPayload
): Promise<GovernanceMemberItem> => {
  const response = await fetch(buildApiUrl(`/api/governance/members/${governanceMemberId}`), {
    method: "PATCH",
    headers: {
      ...withAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to update governance member"));
  return (await response.json()) as GovernanceMemberItem;
};

export const deleteGovernanceMember = async (governanceMemberId: number): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/governance/members/${governanceMemberId}`), {
    method: "DELETE",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to remove governance member"));
};

export const fetchGovernanceAnnouncements = async (
  governanceUnitId: number
): Promise<GovernanceAnnouncementItem[]> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/announcements`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance announcements"));
  return (await response.json()) as GovernanceAnnouncementItem[];
};

export const fetchSchoolGovernanceAnnouncements = async (params: {
  status?: GovernanceAnnouncementStatus;
  unit_type?: GovernanceUnitType;
  q?: string;
  limit?: number;
} = {}): Promise<GovernanceAnnouncementMonitorItem[]> => {
  const query = toQuery(params);
  const response = await fetch(
    buildApiUrl(`/api/governance/announcements/monitor${query ? `?${query}` : ""}`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch campus governance announcements"));
  return (await response.json()) as GovernanceAnnouncementMonitorItem[];
};

export const createGovernanceAnnouncement = async (
  governanceUnitId: number,
  payload: GovernanceAnnouncementPayload
): Promise<GovernanceAnnouncementItem> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/announcements`),
    {
      method: "POST",
      headers: {
        ...withAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to create governance announcement"));
  return (await response.json()) as GovernanceAnnouncementItem;
};

export const updateGovernanceAnnouncement = async (
  announcementId: number,
  payload: Partial<GovernanceAnnouncementPayload>
): Promise<GovernanceAnnouncementItem> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/announcements/${announcementId}`),
    {
      method: "PATCH",
      headers: {
        ...withAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to update governance announcement"));
  return (await response.json()) as GovernanceAnnouncementItem;
};

export const deleteGovernanceAnnouncement = async (announcementId: number): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/governance/announcements/${announcementId}`), {
    method: "DELETE",
    headers: withAuthHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to delete governance announcement"));
};

export const fetchGovernanceStudentNote = async (
  governanceUnitId: number,
  studentProfileId: number
): Promise<GovernanceStudentNoteItem> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/student-notes/${studentProfileId}`),
    {
      method: "GET",
      headers: withAuthHeaders(),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to fetch governance student notes"));
  return (await response.json()) as GovernanceStudentNoteItem;
};

export const saveGovernanceStudentNote = async (
  governanceUnitId: number,
  studentProfileId: number,
  payload: GovernanceStudentNotePayload
): Promise<GovernanceStudentNoteItem> => {
  const response = await fetch(
    buildApiUrl(`/api/governance/units/${governanceUnitId}/student-notes/${studentProfileId}`),
    {
      method: "PUT",
      headers: {
        ...withAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) throw new Error(await parseError(response, "Failed to save governance student notes"));
  return (await response.json()) as GovernanceStudentNoteItem;
};

export const assignGovernancePermission = async (
  governanceUnitId: number,
  payload: AssignGovernancePermissionPayload
): Promise<GovernanceUnitPermissionItem> => {
  const response = await fetch(buildApiUrl(`/api/governance/units/${governanceUnitId}/permissions`), {
    method: "POST",
    headers: {
      ...withAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(await parseError(response, "Failed to assign governance permission"));
  return (await response.json()) as GovernanceUnitPermissionItem;
};
