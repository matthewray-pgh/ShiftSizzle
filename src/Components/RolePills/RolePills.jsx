import './RolePills.scss';

// A wrapping row of role pills — every role visible at once, one selected.
// Replaces a role <select> so the whole staffing picture is on screen.
// `totalFor` (optional) puts each role's weekly headcount on its pill as a
// glanceable sanity check; `reviewed` (optional Set) adds a check mark and
// is how the setup wizard tracks which roles have been looked at.
export const RolePills = ({ roles, active, onSelect, totalFor, reviewed, ariaLabel = 'Role' }) => (
  <div className="role-pills" role="tablist" aria-label={ariaLabel}>
    {roles.map((role) => {
      const total = totalFor ? totalFor(role) : null;
      const isReviewed = Boolean(reviewed && reviewed.has(role));

      return (
        <button
          key={role}
          type="button"
          role="tab"
          aria-selected={active === role}
          className={`role-pills__pill ${active === role ? 'is-active' : ''} ${isReviewed ? 'is-reviewed' : ''}`.trim()}
          onClick={() => onSelect(role)}
        >
          {reviewed && (
            <i
              className={`fas ${isReviewed ? 'fa-circle-check' : 'fa-circle'} role-pills__check`}
              aria-hidden="true"
            />
          )}
          <span className="role-pills__name">{role}</span>
          {total != null && <span className="role-pills__total">{total}/wk</span>}
        </button>
      );
    })}
  </div>
);
