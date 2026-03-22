import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchGovernanceDashboardOverview,
  GovernanceDashboardOverview,
} from "../api/governanceHierarchyApi";
import NavbarSSG from "../components/NavbarSSG";
import "../css/SsgWorkspace.css";
import { useSsgWorkspace } from "../hooks/useSsgWorkspace";
import { formatDateLabel, toStatusToneClass } from "../utils/ssgWorkspaceHelpers";

const SSGDashboard = () => {
  const {
    accessLoading,
    campusName,
    hasPermission,
    ssgAccessUnit,
    ssgUnit,
    workspaceError,
    workspaceLoading,
  } = useSsgWorkspace();
  const [overview, setOverview] = useState<GovernanceDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading || !ssgAccessUnit) {
      if (!accessLoading) {
        setOverview(null);
        setLoading(false);
      }
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchGovernanceDashboardOverview(ssgAccessUnit.governance_unit_id)
      .then((dashboardOverview) => {
        if (!isMounted) return;
        setOverview(dashboardOverview);
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setError(
          requestError instanceof Error ? requestError.message : "Failed to load the SSG dashboard"
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [accessLoading, ssgAccessUnit?.governance_unit_id]);

  const canViewStudents = hasPermission("view_students") || hasPermission("manage_students");
  const publishedCount = overview?.published_announcement_count ?? 0;
  const recentAnnouncements = overview?.recent_announcements ?? [];
  const sgUnits = overview?.child_units ?? [];
  const totalStudents = overview?.total_students ?? 0;
  const canManageSg =
    hasPermission("create_sg") || hasPermission("manage_members") || hasPermission("assign_permissions");

  return (
    <div className="ssg-workspace-page">
      <NavbarSSG />

      <main className="container py-4 ssg-workspace-main">
        <section className="ssg-page-header">
          <div className="ssg-page-header__copy">
            <p className="ssg-page-eyebrow">SSG Dashboard</p>
            <h1>Supreme Students Government workspace</h1>
            <p>
              Track your campus-wide governance activity, keep announcements visible, and jump
              straight into department SG management from one place.
            </p>
          </div>
          <div className="ssg-page-actions">
            {hasPermission("manage_announcements") && (
              <Link to="/ssg_announcements" className="btn btn-light">
                Open Announcements
              </Link>
            )}
            {canManageSg && (
              <Link to="/ssg_manage_sg" className="btn btn-outline-light">
                Manage SG
              </Link>
            )}
          </div>
        </section>

        {workspaceError && <div className="alert alert-danger mb-0">{workspaceError}</div>}
        {error && <div className="alert alert-danger mb-0">{error}</div>}

        <section className="ssg-stat-grid">
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">SSG Members</span>
            <strong className="ssg-stat-card__value">{ssgUnit?.members.length ?? 0}</strong>
            <span className="ssg-stat-card__hint">Active officers in the campus SSG</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">SG Units</span>
            <strong className="ssg-stat-card__value">{sgUnits.length}</strong>
            <span className="ssg-stat-card__hint">Department governments under {campusName}</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Published Announcements</span>
            <strong className="ssg-stat-card__value">{publishedCount}</strong>
            <span className="ssg-stat-card__hint">Campus notices currently visible to students</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Total Students</span>
            <strong className="ssg-stat-card__value">{totalStudents}</strong>
            <span className="ssg-stat-card__hint">
              {canViewStudents
                ? "Imported student accounts in your current governance scope"
                : "Student totals appear when view or manage students access is granted"}
            </span>
          </article>
        </section>

        <section className="ssg-overview-grid">
          <article className="ssg-panel-card">
            <div className="ssg-panel-card__header">
              <div>
                <h2 className="ssg-panel-card__title">Recent announcements</h2>
                <p className="ssg-panel-card__subtitle">
                  Drafts and published campus updates managed by the SSG.
                </p>
              </div>
              {hasPermission("manage_announcements") && (
                <Link to="/ssg_announcements" className="ssg-link-button">
                  Manage announcements
                </Link>
              )}
            </div>

            {loading || workspaceLoading ? (
              <div className="ssg-empty-state">Loading dashboard overview...</div>
            ) : recentAnnouncements.length === 0 ? (
              <div className="ssg-empty-state">
                No announcements yet. Create the first campus update when you are ready.
              </div>
            ) : (
              <div className="ssg-simple-list">
                {recentAnnouncements.map((announcement) => (
                  <div key={announcement.id} className="ssg-simple-list__item">
                    <div>
                      <strong>{announcement.title}</strong>
                      <span>{announcement.author_name || "Unknown author"}</span>
                      <small>{formatDateLabel(announcement.updated_at)}</small>
                    </div>
                    <span className={`ssg-badge ${toStatusToneClass(announcement.status)}`}>
                      {announcement.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="ssg-panel-card">
            <div className="ssg-panel-card__header">
              <div>
                <h2 className="ssg-panel-card__title">SG unit list</h2>
                <p className="ssg-panel-card__subtitle">
                  One department-wide SG per department under the campus SSG.
                </p>
              </div>
              {canManageSg && (
                <Link to="/ssg_manage_sg" className="ssg-link-button">
                  Manage SG &#8594;
                </Link>
              )}
            </div>

            {loading || workspaceLoading ? (
              <div className="ssg-empty-state">Loading SG units...</div>
            ) : sgUnits.length === 0 ? (
              <div className="ssg-empty-state">
                No department SG units exist yet. Create the first one from Manage SG.
              </div>
            ) : (
              <div className="ssg-simple-list">
                {sgUnits.map((unit) => (
                  <div key={unit.id} className="ssg-simple-list__item">
                    <div>
                      <strong>
                        {unit.unit_code} - {unit.unit_name}
                      </strong>
                      <span>{unit.description || "Department-wide SG unit"}</span>
                      <small>{unit.member_count} member(s)</small>
                    </div>
                    <span className="ssg-badge ssg-badge--member">{unit.member_count}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
};

export default SSGDashboard;
