import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
} from "react-router-dom";
import "./App.css";

// ================== Teacher Dashboard ==================
function TeacherDashboard({ onLogout, teacherId }) {
  const [timetable, setTimetable] = useState([]);
  const [formTimetable, setFormTimetable] = useState(
    Array(6)
      .fill(null)
      .map(() => Array(8).fill(""))
  );
  const [msg, setMsg] = useState("");
  const [substitutions, setSubstitutions] = useState([]);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    fetchTimetable();
  }, []);

  // Fetches the timetable for the logged-in teacher
  const fetchTimetable = async () => {
    const res = await fetch("http://localhost:5000/teacher/timetable", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTimetable(data.timetable);
    } else {
      setMsg("No timetable found. Please add one.");
    }
  };

  // Fetches substitutions assigned to the logged-in teacher
  const fetchSubstitutions = async () => {
    const res = await fetch("http://localhost:5000/substitutions");
    if (res.ok) {
      const data = await res.json();
      // Filter substitutions for the current teacher
      const mySubstitutions = data.filter(s => s.sub_teacher_id === teacherId);
      setSubstitutions(mySubstitutions);
    }
  };

  const handleInputChange = (dayIndex, periodIndex, value) => {
    const newFormTimetable = [...formTimetable];
    newFormTimetable[dayIndex][periodIndex] = value;
    setFormTimetable(newFormTimetable);
  };

  // Handles the form submission for adding/updating a timetable
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    const payload = {
      timetable: formTimetable,
    };
    const res = await fetch("http://localhost:5000/teacher/timetable", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMsg(data.msg);
    if (res.ok) {
      fetchTimetable(); // Refresh the displayed timetable
    }
  };

  // Handles the request to mark a teacher as absent for a specific period
  const handleAbsenceRequest = async (dayIndex, periodIndex, className) => {
    if (!className || className.toLowerCase() === 'free') {
      setMsg("Cannot mark absence for a free period.");
      return;
    }
    if (!window.confirm(`Mark yourself absent for ${className} on ${days[dayIndex]}, Period ${periodIndex + 1}?`)) {
      return;
    }

    const res = await fetch("http://localhost:5000/absences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ day: dayIndex, period: periodIndex, class_name: className }),
    });

    const data = await res.json();
    if (res.ok) {
      const subMessage = data.substitute_teacher_id ? ` Substitute: ${data.substitute_teacher_id}` : ' No substitute was available.';
      setMsg(data.msg + subMessage);
    } else {
      setMsg(data.msg || "An error occurred.");
    }
  };

  return (
    <div>
      <h2>Teacher Dashboard ({teacherId})</h2>
      <button onClick={onLogout}>Logout</button>
      <nav style={{ margin: "16px 0" }}>
        <Link to="/timetable" style={{ marginRight: 12 }}>
          My Timetable
        </Link>
        <Link to="/update-timetable" style={{ marginRight: 12 }}>
          Update Timetable
        </Link>
        <Link to="/substitutions">My Substitutions</Link>
      </nav>

      {msg && <p>{msg}</p>}

      <Routes>
        <Route
          path="/timetable"
          element={
            <TimetableDisplay
              timetable={timetable}
              days={days}
              handleAbsenceRequest={handleAbsenceRequest}
              msg={msg}
            />
          }
        />
        <Route
          path="/update-timetable"
          element={
            <UpdateTimetableForm
              formTimetable={formTimetable}
              days={days}
              handleInputChange={handleInputChange}
              handleFormSubmit={handleFormSubmit}
            />
          }
        />
        <Route
          path="/substitutions"
          element={
            <MySubstitutions
              teacherId={teacherId}
              fetchSubstitutions={fetchSubstitutions}
              substitutions={substitutions}
              days={days}
            />
          }
        />
        <Route path="*" element={<Navigate to="/timetable" />} />
      </Routes>
    </div>
  );
}

// ================== Teacher Timetable Display ==================
function TimetableDisplay({ timetable, days, handleAbsenceRequest, msg }) {
  return (
    <div>
      <h3>Your Timetable</h3>
      <p>Click on a class to mark yourself absent for that period.</p>
      {timetable.length > 0 ? (
        <table border="1" style={{ width: "100%", tableLayout: "fixed" }}>
          <thead style={{ backgroundColor: "#f2f2f2" }}>
            <tr>
              <th>Day</th>
              {[...Array(8).keys()].map(p => <th key={p}>Period {p + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {timetable.map((day, dayIndex) => (
              <tr key={dayIndex} style={{ textAlign: "center" }}>
                <td>{days[dayIndex]}</td>
                {day.map((period, periodIndex) => (
                  <td key={periodIndex}>
                    <button
                      onClick={() => handleAbsenceRequest(dayIndex, periodIndex, period)}
                      style={{
                        width: '100%',
                        height: '40px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title={`Mark absent for ${period || 'Free'}`}
                    >
                      {period || 'Free'}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{msg || "Loading..."}</p>
      )}
    </div>
  );
}

// ================== Update Timetable Form ==================
function UpdateTimetableForm({ formTimetable, days, handleInputChange, handleFormSubmit }) {
  return (
    <div>
      <h3>Add/Update Timetable</h3>
      <form onSubmit={handleFormSubmit}>
        {days.map((day, dayIndex) => (
          <div key={dayIndex} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
            <strong style={{ width: '100px' }}>{day}:</strong>
            {[...Array(8).keys()].map(p => (
              <input
                key={p}
                type="text"
                placeholder={`P${p + 1}`}
                value={formTimetable[dayIndex][p]}
                onChange={e => handleInputChange(dayIndex, p, e.target.value)}
                style={{ width: '60px', marginLeft: '5px', padding: '5px' }}
              />
            ))}
          </div>
        ))}
        <button type="submit" style={{ marginTop: '10px' }}>Save Timetable</button>
      </form>
    </div>
  );
}

// ================== My Substitutions Page ==================
function MySubstitutions({ teacherId, fetchSubstitutions, substitutions, days }) {
  useEffect(() => {
    fetchSubstitutions();
  }, [teacherId]); // Re-fetch if teacherId changes (though it shouldn't in a session)

  return (
    <div>
      <h3>My Assigned Substitutions</h3>
      {substitutions.length > 0 ? (
        <table border="1">
          <thead>
            <tr>
              <th>Day</th>
              <th>Period</th>
              <th>Class to Cover</th>
              <th>Absent Teacher</th>
            </tr>
          </thead>
          <tbody>
            {substitutions.map(s => (
              <tr key={s.id}>
                <td>{days[parseInt(s.day)]}</td>
                <td>{parseInt(s.period) + 1}</td>
                <td>{s.class}</td>
                <td>{s.absent_teacher_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No substitutions assigned to you.</p>
      )}
    </div>
  );
}


// ================== Add Teacher ==================
function AddTeacherPage({ onTeacherAdded }) {
  const [newTeacher, setNewTeacher] = useState({ username: "", password: "" });
  const [msg, setMsg] = useState("");

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    setMsg("");
    const res = await fetch("http://localhost:5000/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTeacher),
    });
    const data = await res.json();
    setMsg(data.msg);
    if (res.ok) {
      setNewTeacher({ username: "", password: "" });
      if (onTeacherAdded) onTeacherAdded();
    }
  };

  return (
    <div>
      <h3>Add Teacher</h3>
      <form onSubmit={handleAddTeacher} className="login-form">
        <label>
          Username:
          <input
            type="text"
            value={newTeacher.username}
            onChange={(e) =>
              setNewTeacher({ ...newTeacher, username: e.target.value })
            }
            required
          />
        </label>
        <label>
          Password:
          <input
            type="password"
            value={newTeacher.password}
            onChange={(e) =>
              setNewTeacher({ ...newTeacher, password: e.target.value })
            }
            required
          />
        </label>
        <button type="submit">Add Teacher</button>
      </form>
      {msg && <p>{msg}</p>}
    </div>
  );
}

// ================== Remove Teacher ==================
function RemoveTeacherPage({ teachers, onTeacherRemoved }) {
  const [msg, setMsg] = useState("");

  const handleDeleteTeacher = async (id) => {
    if (!window.confirm("Delete this teacher?")) return;
    const res = await fetch(`http://localhost:5000/teachers/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setMsg(data.msg);
    if (onTeacherRemoved) onTeacherRemoved();
  };

  return (
    <div>
      <h3>Remove Teacher</h3>
      <ul>
        {teachers.map((t) => (
          <li key={t.id || t.teacher_id}>
            {t.username}
            <button
              onClick={() => handleDeleteTeacher(t.id)}
              style={{ marginLeft: 8 }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {msg && <p>{msg}</p>}
    </div>
  );
}

// ================== Timetables ==================
function TimetablesPage({ teachers }) {
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [timetable, setTimetable] = useState([]);
  const [msg, setMsg] = useState("");

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const handleSelect = (id) => {
    setSelectedTeacher(id);
    fetchTimetable(id);
  };

  const fetchTimetable = async (id) => {
    setMsg("");
    const res = await fetch(`http://localhost:5000/teachers/${id}/timetable`);
    if (res.ok) {
      const data = await res.json();
      setTimetable(data.timetable);
    } else {
      setTimetable([]);
      setMsg("No timetable found");
    }
  };

  return (
    <div>
      <h3>Show Timetables</h3>
      <ul>
        {teachers.map((t) => (
          <li key={t.id}>
            <button onClick={() => handleSelect(t.id)}>{t.username}</button>
          </li>
        ))}
      </ul>
      {selectedTeacher && (
        <div>
          <h4>Timetable for Teacher ID {selectedTeacher}</h4>
          {timetable.length > 0 ? (
            <table border="1">
             <thead>
               <tr>
                 <th>Day</th>
                 {[...Array(8).keys()].map(p => <th key={p}>Period {p + 1}</th>)}
               </tr>
             </thead>
             <tbody>
               {timetable.map((day, dayIndex) => (
                 <tr key={dayIndex}>
                   <td>{days[dayIndex]}</td>
                   {Array.isArray(day) ? (
                     day.map((period, periodIndex) => (
                       <td key={periodIndex}>{period || 'Free'}</td>
                     ))
                   ) : (
                     <td colSpan="8">Invalid timetable format for this day</td>
                   )}
                 </tr>
               ))}
             </tbody>
            </table>
          ) : (
            <p>No timetable found</p>
          )}
        </div>
      )}
      {msg && <p>{msg}</p>}
    </div>
  );
}

// ================== Substitutions Page ==================
function SubstitutionsPage() {
  const [substitutions, setSubstitutions] = useState([]);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    fetchSubstitutions();
  }, []);

  const fetchSubstitutions = async () => {
    const res = await fetch("http://localhost:5000/substitutions");
    if (res.ok) {
      const data = await res.json();
      setSubstitutions(data);
    }
  };

  return (
    <div>
      <h3>All Substitutions</h3>
      <table border="1">
        <thead>
          <tr>
            <th>Absent Teacher</th>
            <th>Substitute Teacher</th>
            <th>Class</th>
            <th>Day</th>
            <th>Period</th>
          </tr>
        </thead>
        <tbody>
          {substitutions.map(s => (
            <tr key={s.id}>
              <td>{s.absent_teacher_id}</td>
              <td>{s.sub_teacher_id || 'None Assigned'}</td>
              <td>{s.class}</td>
              <td>{days[parseInt(s.day)]}</td>
              <td>{parseInt(s.period) + 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================== Admin Dashboard ==================
function AdminDashboard({ onLogout }) {
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    const res = await fetch("http://localhost:5000/teachers");
    const data = await res.json(); // This will now receive [{'id': ..., 'username': ...}]
    setTeachers(data);
  };

  const refresh = () => fetchTeachers();

  return (
    <div>
      <h2>Admin Dashboard</h2>
      <button onClick={onLogout}>Logout</button>
      <nav style={{ margin: "16px 0" }}>
        <Link to="/add-teacher" style={{ marginRight: 12 }}>
          Add Teacher
        </Link>
        <Link to="/remove-teacher" style={{ marginRight: 12 }}>
          Remove Teacher
        </Link>
        <Link to="/timetables">Show Timetables</Link>
        <Link to="/substitutions" style={{ marginLeft: 12 }}>
          Show Substitutions
        </Link>
      </nav>
      <Routes>
        <Route
          path="/add-teacher"
          element={<AddTeacherPage onTeacherAdded={refresh} />}
        />
        <Route
          path="/remove-teacher"
          element={
            <RemoveTeacherPage
              teachers={teachers}
              onTeacherRemoved={refresh}
            />
          }
        />
        <Route
          path="/timetables"
          element={<TimetablesPage teachers={teachers} />}
        />
        <Route
          path="/substitutions"
          element={<SubstitutionsPage />}
        />
        <Route path="*" element={<Navigate to="/add-teacher" />} />
      </Routes>
    </div>
  );
}

// ================== Main App ==================
function App() {
  const [role, setRole] = useState("admin");
  const [loggedInRole, setLoggedInRole] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");

    // Payload based on role
    let payload = { role, password };
    if (role === "admin") {
      payload.username = username;
    } else if (role === "teacher") {
      payload.teacher_id = username; // using input field for teacher_id
    }

    try {
      const res = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Handle non-2xx responses
        const errorData = await res.json().catch(() => ({ msg: "An unknown error occurred" }));
        setMessage(errorData.msg || `Error: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      setMessage(`Login successful as ${role}`);
      setLoggedInRole(role);
      localStorage.setItem("token", data.access_token);
    } catch (err) {
      console.error("Login fetch error:", err);
      setMessage("Server error");
    }
  };

  const handleLogout = () => {
    setLoggedInRole(null);
    setUsername("");
    setPassword("");
    setMessage("");
    localStorage.removeItem("token");
  };

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
        {loggedInRole === "admin" ? (
          <AdminDashboard onLogout={handleLogout} />
        ) : loggedInRole === "teacher" ? (
          <TeacherDashboard onLogout={handleLogout} teacherId={username} />
        ) : (
          <>
            <h2>Login</h2>
            <form onSubmit={handleLogin} className="login-form">
              <label>
                Role:
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                </select>
              </label>
              <label>
                {role === "admin" ? "Username:" : "Teacher ID:"}
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
              <label>
                Password:
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit">Login</button>
            </form>
            {message && <p>{message}</p>}
          </>
        )}
      </div>
    </Router>
  );
}

export default App;
