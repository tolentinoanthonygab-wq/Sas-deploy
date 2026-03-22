import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchGovernanceDashboardOverview,
  GovernanceDashboardOverview,
  GovernanceUnitType,
} from "../api/governanceHierarchyApi";
import NavbarORG from "../components/NavbarORG";
import NavbarSG from "../components/NavbarSG";
import "../css/SsgWorkspace.css";
import { useGovernanceWorkspace } from "../hooks/useGovernanceWorkspace";
import { formatDateLabel, formatUserDisplayName, toStatusToneClass } from "../utils/ssgWorkspaceHelpers";

type DashboardUnitType = "SG" | "ORG";

interface GovernanceDashboardPageProps {
  unitType: DashboardUnitType;
}

const DASHBOARD_CONFIG: Record<
  DashboardUnitType,
  {
    eyebrow: string;
    title: string;
    description: string;
    manageLabel?: string;
    managePath?: string;
    childUnitType?: GovernanceUnitType;
    childUnitLabel?: string;
    memberLabel: string;
  }
> = {
  SG: {
    eyebrow: "SG Dashboard",
    title: "Department student government workspace",
    description:
      "Track department-wide governance activity, keep announcements updated, and manage program organizations from one place.",
    manageLabel: "Manage ORG",
    managePath: "/sg_manage_org",
    childUnitType: "ORG",
    childUnitLabel: "ORG Units",
    memberLabel: "SG Members",
  },
  ORG: {
    eyebrow: "ORG Dashboard",
    title: "Program organization workspace",
    description:
      "Monitor your organization members, student scope, and announcement activity inside the current program.",
    memberLabel: "ORG Members",
  },
};

const GovernanceDashboardPage = ({ unitType }: GovernanceDashboardPageProps) => {
  const {
    accessLoading,
    campusName,
    hasPermission,
    accessUnit,
    governanceUnit,
    workspaceError,
    workspaceLoading,
  } = useGovernanceWorkspace(unitType);
  const [overview, setOverview] = useState<GovernanceDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = DASHBOARD_CONFIG[unitType];
  const navbar = unitType === "SG" ? <NavbarSG /> : <NavbarORG />;

  useEffect(() => {
    if (accessLoading || !accessUnit) {
      if (!accessLoading) {
        setOverview(null);
        setLoading(false);
      }
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchGovernanceDashboardOverview(accessUnit.governance_unit_id)
      .then((dashboardOverview) => {
        if (!isMounted) return;
        setOverview(dashboardOverview);
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setError(
          requestError instanceof Error ? requestError.message : `Failed to load the ${unitType} dashboard`
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    accessLoading,
    accessUnit?.governance_unit_id,
    unitType,
  ]);

  const canViewStudents = hasPermission("view_students") || hasPermission("manage_students");
  const publishedCount = overview?.published_announcement_count ?? 0;
  const recentAnnouncements = overview?.recent_announcements ?? [];
  const childUnits = overview?.child_units ?? [];
  const totalStudents = overview?.total_students ?? 0;
  const canManageChildren =
    unitType === "SG" &&
    (hasPermission("create_org") || hasPermission("manage_members") || hasPermission("assign_permissions"));

  return (
    <div className="ssg-workspace-page">
      {navbar}

      <main className="container py-4 ssg-workspace-main">
        <section className="ssg-page-header">
          <div className="ssg-page-header__copy">
            <p className="ssg-page-eyebrow">{config.eyebrow}</p>
            <h1>{config.title}</h1>
            <p>{config.description}</p>
          </div>
          <div className="ssg-page-actions">
            {hasPermission("manage_announcements") && (
              <Link to={unitType === "SG" ? "/sg_announcements" : "/org_announcements"} className="btn btn-light">
                Open Announcements
              </Link>
            )}
            {config.managePath && canManageChildren && (
              <Link to={config.managePath} className="btn btn-outline-light">
                {config.manageLabel}
              </Link>
            )}
          </div>
        </section>

        {workspaceError && <div className="alert alert-danger mb-0">{workspaceError}</div>}
        {error && <div className="alert alert-danger mb-0">{error}</div>}

        <section className="ssg-stat-grid">
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">{config.memberLabel}</span>
            <strong className="ssg-stat-card__value">{governanceUnit?.members.length ?? 0}</strong>
            <span className="ssg-stat-card__hint">Active officers in the current {unitType}</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">{config.childUnitLabel || "Published Announcements"}</span>
            <strong className="ssg-stat-card__value">{config.childUnitType ? childUnits.length : publishedCount}</strong>
            <span className="ssg-stat-card__hint">
              {config.childUnitType
                ? `${config.childUnitType} units under ${campusName}`
                : "Visible updates for the current organization workspace"}
            </span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Published Announcements</span>
            <strong className="ssg-stat-card__value">{publishedCount}</strong>
            <span className="ssg-stat-card__hint">Updates currently published in this governance workspace</span>
          </article>
          <article className="ssg-stat-card">
            <span className="ssg-stat-card__label">Total Students</span>
            <strong className="ssg-stat-card__value">{totalStudents}</strong>
            <span className="ssg-stat-card__hint">
              {canViewStudents
                ? "Imported student accounts inside your governance scope"
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
                  Drafts and published updates managed inside this {unitType} workspace.
                </p>
              </div>
              {hasPermission("manage_announcements") && (
                <Link
                  to={unitType === "SG" ? "/sg_announcements" : "/org_announcements"}
                  className="ssg-link-button"
                >
                  Manage announcements
                </Link>
              )}
            </div>

            {loading || workspaceLoading ? (
              <div className="ssg-empty-state">Loading dashboard overview...</div>
            ) : recentAnnouncements.length === 0 ? (
              <div className="ssg-empty-state">No announcements yet for this governance workspace.</div>
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
                <h2 className="ssg-panel-card__title">
                  {config.childUnitType ? `${config.childUnitType} unit list` : `${unitType} officer list`}
                </h2>
                <p className="ssg-panel-card__subtitle">
                  {config.childUnitType
                    ? `One ${config.childUnitType} per available academic scope under the current ${unitType}.`
                    : `Officers currently assigned inside the ${unitType} workspace.`}
                </p>
              </div>
              {config.managePath && canManageChildren && (
                <Link to={config.managePath} className="ssg-link-button">
                  {config.manageLabel} &#8594;
                </Link>
              )}
            </div>

            {loading || workspaceLoading ? (
              <div className="ssg-empty-state">Loading workspace data...</div>
            ) : config.childUnitType ? (
              childUnits.length === 0 ? (
                <div className="ssg-empty-state">No {config.childUnitType} units exist yet.</div>
              ) : (
                <div className="ssg-simple-list">
                  {childUnits.map((unit) => (
                    <div key={unit.id} className="ssg-simple-list__item">
                      <div>
                        <strong>
                          {unit.unit_code} - {unit.unit_name}
                        </strong>
                        <span>{unit.description || `${config.childUnitType}-level governance unit`}</span>
                        <small>{unit.member_count} member(s)</small>
                      </div>
                      <span className="ssg-badge ssg-badge--member">{unit.member_count}</span>
                    </div>
                  ))}
                </div>
              )
            ) : governanceUnit?.members?.length ? (
              <div className="ssg-simple-list">
                {governanceUnit.members.map((member) => (
                  <div key={member.id} className="ssg-simple-list__item">
                    <div>
                      <strong>{formatUserDisplayName(member.user)}</strong>
                      <span>{member.position_title || `${unitType} Officer`}</span>
                      <small>{member.member_permissions.length} permission(s)</small>
                    </div>
                    <span className="ssg-badge ssg-badge--member">{member.member_permissions.length}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ssg-empty-state">No officers are assigned yet in this workspace.</div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
};

export default GovernanceDashboardPage;
