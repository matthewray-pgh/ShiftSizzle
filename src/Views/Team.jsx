import { useState } from "react";
import { Button, ContentPanel, InputField } from "../Components";

import "./Team.scss";

const TEAM_ROLES = Object.freeze({
  MANAGER : "Manager",
  SERVER : "Server",
  HOST : "Host",
  BARTENDER : "Bartender",
  COOK : "Cook",
});

export const Team = () => {
  const [employees, setEmployees] = useState([
    { id: 1, name: "Jen Ray", title: "General Manager", role: TEAM_ROLES.MANAGER, contact: "", email: "" },
    { id: 2, name: "Ryan Something", title: "Assistant General Manager", role: TEAM_ROLES.MANAGER, contact: "", email: "" },
    { id: 3, name: "Kayla Someone", title: "Bar Manager", role: TEAM_ROLES.MANAGER, contact: "", email: "" },
    { id: 4, name: "Kirk Brady", title: "Director", role: TEAM_ROLES.MANAGER, contact: "", email: "" },
    { id: 5, name: "Jackie CateringPerson", title: "Catering Manager", role: TEAM_ROLES.MANAGER, contact: "", email: "" },
  ]);

  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState(null);

  const handleAddEmployee = (e) => {
    e.preventDefault();
    if (!newName || !newRole) return;
    if (editId) {
      setEmployees(employees.map(emp =>
        emp.id === editId
          ? { ...emp, name: newName, title: newTitle, role: newRole, contact: newContact, email: newEmail }
          : emp
      ));
    } else {
      setEmployees([
        ...employees,
        { id: Date.now(), name: newName, title: newTitle, role: newRole, contact: newContact, email: newEmail }
      ]);
    }
    setNewName("");
    setNewTitle("");
    setNewRole("");
    setNewContact("");
    setNewEmail("");
    setEditId(null);
  };

  return (
    <div className="team">
      <section className="team__control-panel">
        <Button
          onClick={() => {
            setShowModal(true);
            setEditId(null);
            setNewName("");
            setNewTitle("");
            setNewRole("");
            setNewContact("");
            setNewEmail("");
          }}
          style={{ display: "inline-flex", alignItems: "center", marginRight: "1em" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", marginRight: "0.5em" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </span>
          Add Employee
        </Button>

        <Button
          onClick={() => { console.log("filter list")}}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", marginRight: "0.5em" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="7" rx="2"/><line x1="8" y1="11" x2="8" y2="7"/><line x1="16" y1="11" x2="16" y2="7"/></svg>
          </span>
          Filter List
        </Button>
      </section>

      <section className="team__list-panel">
        {employees.map(emp => (
          <ContentPanel key={emp.id} className="team__member-panel">
            <div className="team__member-info">
              <div className="team__member-avatar">
                <span className="team__avatar-icon" aria-label="avatar">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="20" fill="#e0e0e0" />
                    <circle cx="20" cy="15" r="7" fill="#bdbdbd" />
                    <ellipse cx="20" cy="29" rx="10" ry="7" fill="#bdbdbd" />
                  </svg>
                </span>
              </div>
              <div className="team__member-details">
                <div className="team__member-header">
                  <div className="team__member-name"><strong>{emp.name}</strong></div>
                  <button
                    className="team__edit-btn"
                    title="Edit"
                    onClick={e => {
                      e.stopPropagation();
                      setShowModal(true);
                      setEditId(emp.id);
                      setNewName(emp.name);
                      setNewTitle(emp.title || "");
                      setNewRole(emp.role || "");
                      setNewContact(emp.contact || "");
                      setNewEmail(emp.email || "");
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "0.5em" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                    </svg>
                  </button>
                </div>
                <div className="team__member-title">{emp.title}</div>
                <div className="team__member-role">{emp.role}</div>
                <div className="team__member-contact">📞 {emp.contact || "N/A"}</div>
                <div className="team__member-email">✉️ {emp.email || "N/A"}</div>
              </div>
            </div>
          </ContentPanel>
        ))}
      </section>

      {showModal && (
        <div className="team__modal-overlay">
          <div className="team__modal">
            <h2>{editId ? "Edit Employee" : "Add New Employee"}</h2>
            <form onSubmit={e => { handleAddEmployee(e); setShowModal(false); }} style={{ marginTop: "1em" }}>
              <InputField
                label="Name"
                name="name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <InputField
                label="Title"
                name="title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />
              <InputField
                label="Role"
                name="role"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                type="select"
                options={Object.values(TEAM_ROLES)}
              />
              <InputField
                label="Contact"
                name="contact"
                value={newContact}
                onChange={e => setNewContact(e.target.value)}
              />
              <InputField
                label="Email"
                name="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
              />
              <Button type="submit">{editId ? "Update" : "Add"}</Button>
              <Button type="button" className="button-outline" onClick={() => setShowModal(false)} style={{ marginLeft: "1em" }}>
                Cancel
              </Button>
            </form>
          </div>
          <div className="team__modal-backdrop" onClick={() => setShowModal(false)}></div>
        </div>
      )}
    </div>
  );
}
