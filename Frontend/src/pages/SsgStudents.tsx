import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";

import {
  fetchAccessibleGovernanceStudents,
  fetchGovernanceDashboardOverview,
  fetchGovernanceStudentNote,
  GovernanceAccessibleStudent,
  saveGovernanceStudentNote,
} from "../api/governanceHierarchyApi";
import NavbarSSG from "../components/NavbarSSG";
import "../css/SsgWorkspace.css";
import { useSsgWorkspace } from "../hooks/useSsgWorkspace";
import {
  formatUserDisplayName,
  getAvatarToneClass,
  getInitials,
} from "../utils/ssgWorkspaceHelpers";

interface StudentNotesState {
  tags: string[];
  notes: string;
}

const STUDENTS_PAGE_SIZE = 25;

const SsgStudents = () => {
  const { campusName, hasPermission, ssgAccessUnit } = useSsgWorkspace();
  const canManageStudents = hasPermission("manage_students");
  const [students, setStudents] = useState<GovernanceAccessibleStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<GovernanceAccessibleStudent | null>(null);
  const [detailState, setDetailState] = useState<StudentNotesState>({ tags: [], notes: "" });
  const [tagInput, setTagInput] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ssgAccessUnit) {
      setTotalStudents(0);
      return;
    }

    let isMounted = true;

    fetchGovernanceDashboardOverview(ssgAccessUnit.governance_unit_id)
      .then((overview) => {
        if (!isMounted) return;
        setTotalStudents(overview.total_students);
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setError(
          requestError instanceof Error ? requestError.message : "Failed to load the student directory overview"
        );
      });

    return () => {
      isMounted = false;
    };
  }, [ssgAccessUnit?.governance_unit_id]);

  const loadStudentsPage = async (pageIndex: number) => {
    const safePageIndex = Math.max(pageIndex, 0);
    setRequestedPage(safePageIndex);
    if (!loading) {
      setIsRefreshing(true);
    }

    try {
      setError(null);
      const users = await fetchAccessibleGovernanceStudents({
        skip: safePageIndex * STUDENTS_PAGE_SIZE,
        limit: STUDENTS_PAGE_SIZE,
      });
      const pagedStudents = users.filter((user) => Boolean(user.student_profile));

      if (safePageIndex > 0 && pagedStudents.length === 0) {
        await loadStudentsPage(safePageIndex - 1);
        return;
      }

      setStudents(pagedStudents);
      setCurrentPage(safePageIndex);
      setHasNextPage(pagedStudents.length === STUDENTS_PAGE_SIZE);
      setLoading(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to load campus students"
      );
      setLoading(false);
    } finally {
      setRequestedPage(null);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStudentsPage(0);
  }, []);

  useEffect(() => {
    if (!selectedStudent || !ssgAccessUnit) {
      setDetailState({ tags: [], notes: "" });
      return;
    }

    void (async () => {
      try {
        const stored = await fetchGovernanceStudentNote(
          ssgAccessUnit.governance_unit_id,
          selectedStudent.student_profile.id
        );
        setDetailState({
          tags: stored.tags,
          notes: stored.notes,
        });
        setTagInput("");
        setSaveMessage(null);
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Failed to load governance notes"
        );
      }
    })();
  }, [selectedStudent, ssgAccessUnit]);

  const departments = useMemo(
    () =>
      Array.from(
        new Map(
          students
            .map((student) => {
              const profile = student.student_profile;
              if (!profile?.department_id || !profile.department_name) return null;
              return { id: profile.department_id, name: profile.department_name };
            })
            .filter(
              (department): department is { id: number; name: string } =>
                Boolean(department?.id && department?.name)
            )
            .map((department) => [department.id, department] as const)
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
    [students]
  );

  const yearLevels = useMemo(
    () =>
      Array.from(
        new Set(
          students
            .map((student) => student.student_profile?.year_level)
            .filter((yearLevel): yearLevel is number => typeof yearLevel === "number")
        )
      ).sort((left, right) => left - right),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return students.filter((student) => {
      const name = formatUserDisplayName(student.user).toLowerCase();
      const studentId = student.student_profile?.student_id?.toLowerCase() ?? "";
      const departmentName = student.student_profile?.department_name ?? "";
      const yearLevel = student.student_profile?.year_level?.toString() ?? "";

      const matchesSearch =
        !searchValue || name.includes(searchValue) || studentId.includes(searchValue);
      const matchesDepartment =
        !departmentFilter || String(student.student_profile?.department_id ?? "") === departmentFilter;
      const matchesYear = !yearFilter || yearLevel === yearFilter;

      return matchesSearch && matchesDepartment && matchesYear && Boolean(departmentName);
    });
  }, [departmentFilter, search, students, yearFilter]);

  const totalDepartments = departments.length;
  const hasActiveFilters = Boolean(search.trim() || departmentFilter || yearFilter);
  const visibleTotalStudents = totalStudents > 0 ? totalStudents : students.length;
  const pageStart = students.length === 0 ? 0 : currentPage * STUDENTS_PAGE_SIZE + 1;
  const pageEnd = currentPage * STUDENTS_PAGE_SIZE + students.length;
  const displayedPageNumber = (requestedPage ?? currentPage) + 1;

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!canManageStudents) return;

    const nextTag = tagInput.trim();
    if (!nextTag) return;
    if (detailState.tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      setTagInput("");
      return;
    }

    setDetailState((current) => ({
      ...current,
      tags: [...current.tags, nextTag],
    }));
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    if (!canManageStudents) return;
    setDetailState((current) => ({
      ...current,
      tags: current.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const saveNotes = () => {
    if (!canManageStudents || !selectedStudent || !ssgAccessUnit) return;
    void (async () => {
      try {
        await saveGovernanceStudentNote(
          ssgAccessUnit.governance_unit_id,
          selectedStudent.student_profile.id,
          {
            tags: detailState.tags,
            notes: detailState.notes,
          }
        );
        setSaveMessage("Governance notes saved for this student.");
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Failed to save governance notes"
        );
      }
    })();
  };

  return (
    <div className="ssg-workspace-page">
      <NavbarSSG />

      <main className="container py-4 ssg-workspace-main">
        <section className="ssg-page-header">
          <div className="ssg-page-header__copy">
            <p className="ssg-page-eyebrow">SSG Students</p>
            <h1>Campus student directory</h1>
            <p>
              View imported students across {campusName}. Governance notes and tags stay scoped to
              this SSG workspace and never change the student's base role.
            </p>
          </div>
        </section>

        <section className="ssg-stat-grid">
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Total Students</span>
            <strong className="ssg-stat-card__value">{visibleTotalStudents}</strong>
            <span className="ssg-stat-card__hint">Imported student accounts in campus scope</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Departments on Page</span>
            <strong className="ssg-stat-card__value">{totalDepartments}</strong>
            <span className="ssg-stat-card__hint">Department groups represented in the loaded backend page</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Filtered Page Results</span>
            <strong className="ssg-stat-card__value">{filteredStudents.length}</strong>
            <span className="ssg-stat-card__hint">Search and filters apply to the current backend page only</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Access Level</span>
            <strong className="ssg-stat-card__value">{canManageStudents ? "Edit" : "View"}</strong>
            <span className="ssg-stat-card__hint">
              {canManageStudents
                ? "Governance notes and tags are editable"
                : "Student records are visible but governance notes stay read-only"}
            </span>
          </article>
        </section>

        {error && <div className="alert alert-danger mb-0">{error}</div>}

        <section className="ssg-surface-card">
          <div className="ssg-filter-bar">
            <div className="ssg-filter-field">
              <label htmlFor="studentSearch">Search students</label>
              <input
                id="studentSearch"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by student ID or name"
              />
            </div>
            <div className="ssg-filter-field">
              <label htmlFor="studentDepartment">Department</label>
              <select
                id="studentDepartment"
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ssg-filter-field">
              <label htmlFor="studentYear">Year level</label>
              <select id="studentYear" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="">All year levels</option>
                {yearLevels.map((yearLevel) => (
                  <option key={yearLevel} value={yearLevel}>
                    Year {yearLevel}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="ssg-pagination-note">
            Search and filters stay on the current backend page so the campus directory loads faster.
          </p>
        </section>

        {loading ? (
          <div className="ssg-empty-state">Loading imported students...</div>
        ) : selectedStudent ? (
          <section className="ssg-surface-card ssg-student-detail">
            <div className="ssg-detail-header">
              <div>
                <button
                  type="button"
                  className="btn btn-outline-secondary mb-3"
                  onClick={() => setSelectedStudent(null)}
                >
                  <FaArrowLeft className="me-2" />
                  Back
                </button>
                <h2 className="mb-1">{formatUserDisplayName(selectedStudent.user)}</h2>
                <div className="ssg-detail-meta">
                  <span className="ssg-badge ssg-badge--member">
                    {selectedStudent.student_profile?.student_id || "No student ID"}
                  </span>
                  {selectedStudent.student_profile?.department_name && (
                    <span className="ssg-badge ssg-badge--active">
                      {selectedStudent.student_profile.department_name}
                    </span>
                  )}
                  <span className="ssg-badge ssg-badge--draft">
                    {selectedStudent.student_profile?.program_name || "No program"}
                  </span>
                  <span className="ssg-badge ssg-badge--archived">
                    {selectedStudent.student_profile?.year_level
                      ? `Year ${selectedStudent.student_profile.year_level}`
                      : "No year"}
                  </span>
                </div>
              </div>
            </div>

            <div className="ssg-inline-detail mt-4">
              <section className="ssg-detail-section">
                <label htmlFor="studentTags">Governance tags</label>
                <div className="ssg-tag-list">
                  {detailState.tags.length === 0 ? (
                    <span className="ssg-muted-note">No governance tags yet.</span>
                  ) : (
                    detailState.tags.map((tag) => (
                      <span key={tag} className="ssg-tag">
                        {tag}
                        {canManageStudents && (
                          <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
                            &times;
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
                <div className="ssg-tag-input">
                  <input
                    id="studentTags"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={
                      canManageStudents ? "Type a tag and press Enter" : "Read-only without manage_students"
                    }
                    disabled={!canManageStudents}
                  />
                </div>
              </section>

              <section className="ssg-detail-section">
                <label htmlFor="studentNotes">Governance notes</label>
                <textarea
                  id="studentNotes"
                  rows={6}
                  value={detailState.notes}
                  onChange={(event) =>
                    setDetailState((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder={
                    canManageStudents
                      ? "Add governance notes for this student"
                      : "Notes are read-only without manage_students"
                  }
                  disabled={!canManageStudents}
                />
                <div className="ssg-inline-actions">
                  {canManageStudents ? (
                    <button type="button" className="btn btn-primary" onClick={saveNotes}>
                      Save
                    </button>
                  ) : (
                    <div className="ssg-muted-note">
                      Your SSG access allows viewing students only. Governance notes and tags need the
                      manage_students permission.
                    </div>
                  )}
                  {saveMessage && <div className="alert alert-success mb-0">{saveMessage}</div>}
                </div>
              </section>
            </div>
          </section>
        ) : error && students.length === 0 ? (
          <div className="ssg-empty-state">The campus student directory could not be loaded right now.</div>
        ) : students.length === 0 ? (
          <div className="ssg-empty-state">No imported students are available in the campus scope yet.</div>
        ) : filteredStudents.length === 0 ? (
          <div className="ssg-empty-state">
            {hasActiveFilters
              ? "No students matched the current filters on this page."
              : "This backend page has no students to display."}
          </div>
        ) : (
          <div className="ssg-table-wrap">
            <table className="ssg-data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Program</th>
                  <th>Year</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const name = formatUserDisplayName(student.user);
                  return (
                    <tr key={student.user.id}>
                      <td data-label="Student">
                        <div className="ssg-table-student">
                          <div className={`ssg-avatar ${getAvatarToneClass(student.user.id)}`}>
                            {getInitials(name)}
                          </div>
                          <div>
                            <strong>{name}</strong>
                            <span>{student.student_profile?.student_id || "No student ID"}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Department">
                        <span className="ssg-badge ssg-badge--active">
                          {student.student_profile?.department_name || "No department"}
                        </span>
                      </td>
                      <td data-label="Program">{student.student_profile?.program_name || "No program"}</td>
                      <td data-label="Year">
                        {student.student_profile?.year_level
                          ? `Year ${student.student_profile.year_level}`
                          : "No year"}
                      </td>
                      <td data-label="Action">
                        <button type="button" className="btn btn-outline-primary" onClick={() => setSelectedStudent(student)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!selectedStudent && (students.length > 0 || currentPage > 0) && (
          <section className="ssg-pagination">
            <div className="ssg-pagination__summary">
              {isRefreshing
                ? `Loading page ${displayedPageNumber}...`
                : students.length === 0
                  ? `Page ${currentPage + 1} has no students.`
                  : totalStudents > 0
                    ? `Showing ${pageStart}-${pageEnd} of ${totalStudents} students on page ${currentPage + 1}`
                    : `Showing ${pageStart}-${pageEnd} students on page ${currentPage + 1}`}
            </div>
            <div className="ssg-pagination__controls">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => void loadStudentsPage(currentPage - 1)}
                disabled={currentPage === 0 || isRefreshing}
              >
                Previous
              </button>
              <span className="ssg-pagination__page-indicator">
                {isRefreshing ? `Page ${displayedPageNumber}` : `Page ${currentPage + 1}`}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void loadStudentsPage(currentPage + 1)}
                disabled={!hasNextPage || isRefreshing}
              >
                Next
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default SsgStudents;
