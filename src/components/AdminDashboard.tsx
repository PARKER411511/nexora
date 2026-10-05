import type { AdminOverview } from "@/lib/types";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminDashboard({ overview }: { overview: AdminOverview }) {
  return (
    <div className="workspace-main admin-main">
      <div className="workspace-heading">
        <div>
          <div className="section-kicker">Nexora / administration</div>
          <h1>Account overview</h1>
          <p>Private operational summaries for the Nexora team.</p>
        </div>
        <span className="admin-badge">Verified admin</span>
      </div>
      <div className="overview-stats">
        <div className="overview-stat">
          <span className="overview-stat-label">Customers</span>
          <strong>{overview.customerCount}</strong>
          <span>Accounts with Nexora access</span>
        </div>
        <div className="overview-stat">
          <span className="overview-stat-label">Projects</span>
          <strong>{overview.projectCount}</strong>
          <span>Saved private workspace projects</span>
        </div>
      </div>
      <div className="admin-grid">
        <section className="overview-card">
          <div className="overview-card-header">
            <div>
              <div className="section-kicker">Customers</div>
              <h2>Recent accounts</h2>
            </div>
            <span className="overview-helper">Email and profile details · latest 100.</span>
          </div>
          {overview.customers.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Company</th><th>Projects</th><th>Joined</th></tr></thead>
                <tbody>
                  {overview.customers.map((customer) => (
                    <tr key={customer.id}>
                      <td><strong>{customer.name}</strong><span>{customer.email}</span></td>
                      <td>{customer.company || "—"}</td>
                      <td>{customer.projectCount}</td>
                      <td>{formatDate(customer.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="admin-empty">No customer accounts yet.</p>}
        </section>
        <section className="overview-card">
          <div className="overview-card-header">
            <div>
              <div className="section-kicker">Projects</div>
              <h2>Recent projects</h2>
            </div>
            <span className="overview-helper">Names, status, and dates · latest 100.</span>
          </div>
          {overview.projects.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Project</th><th>Customer</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {overview.projects.map((project) => (
                    <tr key={project.id}>
                      <td><strong>{project.name}</strong><span>{project.id}</span></td>
                      <td><strong>{project.customer.name}</strong><span>{project.customer.email}</span></td>
                      <td><span className={`status status-${project.status}`}>{project.status.replaceAll("_", " ")}</span></td>
                      <td>{formatDate(project.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="admin-empty">No projects yet.</p>}
        </section>
      </div>
    </div>
  );
}

export function AdminDenied() {
  return (
    <div className="workspace-main">
      <div className="access-denied">
        <div className="section-kicker">403 / restricted area</div>
        <h1>Admin access required</h1>
        <p>This account is signed in, but it is not on the Nexora admin allowlist.</p>
        <a className="button-secondary" href="/workspace">Return to workspace</a>
      </div>
    </div>
  );
}
