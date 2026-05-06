import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { HardHat, LayoutDashboard, ClipboardList, Settings, User, LogOut } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const login = (u, t) => { setUser(u); setToken(t); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('token', t); };
  const logout = () => { setUser(null); setToken(null); localStorage.removeItem('user'); localStorage.removeItem('token'); };
  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>;
};

const Login = () => {
  const { login } = useContext(AuthContext);
  const handleLogin = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/login`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: e.target.username.value, password: e.target.password.value})});
    const data = await res.json();
    if(res.ok) login(data.user, data.token); else alert(data.error);
  };
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--primary-color)' }}>RAAI Infratech Login</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group"><input type="text" name="username" className="form-control" placeholder="Username" required /></div>
          <div className="form-group"><input type="password" name="password" className="form-control" placeholder="Password" required /></div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Login</button>
        </form>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { token, user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [works, setWorks] = useState([]);
  const [workFilter, setWorkFilter] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/works`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.works && setWorks(d.works));
  }, [token]);

  useEffect(() => {
    fetch(`${API_URL}/reports${workFilter ? `?workName=${workFilter}` : ''}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r=>r.json()).then(d => d.reports && setReports(d.reports));
  }, [token, workFilter]);

  if (user.role === 'SUPERVISOR') return <Navigate to="/update" />;

  const handleStatusChange = async (id, status) => {
    await fetch(`${API_URL}/reports/${id}/status`, { method: 'PUT', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify({status})});
    setReports(reports.map(r => r.id === id ? { ...r, status } : r));
    // refresh works to update used counters
    fetch(`${API_URL}/works`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.works && setWorks(d.works));
  };

  const selectedWorkObj = works.find(w => w.name === workFilter);

  return (
    <div className="main-content">
      <header><h1>Dashboard</h1><div className="user-profile"><span>{user.fullName} ({user.role})</span><div className="avatar">A</div></div></header>
      
      <div className="card" style={{ marginBottom: '1rem' }}>
        <select className="form-control" onChange={e => setWorkFilter(e.target.value)}>
          <option value="">All Works</option>
          {works.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
        </select>
      </div>

      {selectedWorkObj && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-title">Remaining Budget ($)</div>
            <div className="stat-value" style={{ color: (selectedWorkObj.allocCost - selectedWorkObj.totalUsedCost) < 0 ? 'var(--danger)' : 'var(--success)' }}>
              ${selectedWorkObj.allocCost - selectedWorkObj.totalUsedCost} / ${selectedWorkObj.allocCost}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Remaining Manpower (Days)</div>
            <div className="stat-value">{selectedWorkObj.allocManpower - selectedWorkObj.totalUsedManpower} / {selectedWorkObj.allocManpower}</div>
          </div>
        </div>
      )}

      <div className="card">
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border-color)' }}>
            <th>Date</th><th>Supervisor</th><th>Work</th><th>Cost ($)</th><th>Manpower</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem 0' }}>{r.date}</td><td>{r.supervisorName}</td><td>{r.workName}</td><td>${r.usedCost}</td><td>{r.usedManpower}</td>
                <td><span style={{ padding: '0.25rem', borderRadius: '4px', background: r.status==='ACCEPTED'?'green':r.status==='REJECTED'?'red':'gray' }}>{r.status}</span></td>
                <td>
                  {r.status === 'PENDING' && (
                    <><button onClick={()=>handleStatusChange(r.id, 'ACCEPTED')}>Accept</button> <button onClick={()=>handleStatusChange(r.id, 'REJECTED')}>Reject</button></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SubmitReport = () => {
  const { token, user } = useContext(AuthContext);
  const [works, setWorks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedWork, setSelectedWork] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/works`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.works && setWorks(d.works));
    if (user.role !== 'SUPERVISOR') {
      fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.users && setUsers(d.users.filter(u=>u.role==='SUPERVISOR')));
    }
  }, [token, user.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const res = await fetch(`${API_URL}/reports`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify(data)});
    if(res.ok) { alert("Report Submitted!"); e.target.reset(); setSelectedWork(''); }
    else alert((await res.json()).error);
  };

  const workInfo = works.find(w => w.name === selectedWork);

  return (
    <div className="main-content">
      <header><h1>{user.role !== 'SUPERVISOR' ? 'Proxy Report Submission' : 'Submit Daily Report'}</h1></header>
      <div className="card">
        <form onSubmit={handleSubmit}>
          {user.role !== 'SUPERVISOR' && (
            <div className="form-group">
              <label>Proxy As (Select Supervisor)</label>
              <select name="proxySupervisor" className="form-control" required>
                <option value="">-- Choose Supervisor --</option>
                {users.map(u => <option key={u.id} value={u.username}>{u.fullName} ({u.username})</option>)}
              </select>
            </div>
          )}
          <div className="form-group"><label>Date</label><input type="date" name="date" className="form-control" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
          <div className="form-group">
            <label>Work / Project</label>
            <select name="workName" className="form-control" required onChange={e => setSelectedWork(e.target.value)}>
              <option value="">-- Select Work --</option>
              {works.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
          </div>
          
          {workInfo && (
            <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p><strong>Allocated Budgets for {workInfo.name}</strong></p>
              <p>Manpower: {workInfo.allocManpower - workInfo.totalUsedManpower} remaining / {workInfo.allocManpower} total</p>
              <p>Cost ($): {workInfo.allocCost - workInfo.totalUsedCost} remaining / {workInfo.allocCost} total</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Used Manpower</label><input type="number" name="usedManpower" className="form-control" required /></div>
            <div className="form-group"><label>Used Cost ($)</label><input type="number" step="0.01" name="usedCost" className="form-control" required /></div>
            <div className="form-group"><label>Used Material Units</label><input type="number" step="0.01" name="usedMaterial" className="form-control" required /></div>
            <div className="form-group"><label>Used Equipment Units</label><input type="number" step="0.01" name="usedEquipment" className="form-control" required /></div>
          </div>
          <div className="form-group"><label>Notes / Remaining Work</label><textarea name="remainingWorkNotes" className="form-control" required></textarea></div>
          <button type="submit" className="btn btn-primary">Submit Report</button>
        </form>
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const { token, user } = useContext(AuthContext);
  if (user.role !== 'SUPER_ADMIN') return <Navigate to="/" />;

  const createWork = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const res = await fetch(`${API_URL}/works`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify(data)});
    if(res.ok) { alert("Work Created with Budget!"); e.target.reset(); }
  };

  return (
    <div className="main-content">
      <header><h1>Sudo Settings</h1></header>
      <div className="card">
        <h2 className="card-title">Allocate New Work & Budget</h2>
        <form onSubmit={createWork}>
          <div className="form-group"><input type="text" name="name" className="form-control" placeholder="Work Name" required /></div>
          <div className="form-group"><textarea name="description" className="form-control" placeholder="Description"></textarea></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Allocated Manpower (Days)</label><input type="number" name="allocManpower" className="form-control" required /></div>
            <div className="form-group"><label>Allocated Total Cost ($)</label><input type="number" step="0.01" name="allocCost" className="form-control" required /></div>
            <div className="form-group"><label>Allocated Material Units</label><input type="number" step="0.01" name="allocMaterial" className="form-control" required /></div>
            <div className="form-group"><label>Allocated Equipment Units</label><input type="number" step="0.01" name="allocEquipment" className="form-control" required /></div>
          </div>
          <button className="btn btn-primary">Create Budgeted Work</button>
        </form>
      </div>
    </div>
  );
};

const AppLayout = () => {
  const { user, logout } = useContext(AuthContext);
  if (!user) return <Login />;
  return (
    <Router>
      <div className="app-container">
        <aside className="sidebar">
          <div className="brand"><HardHat size={28} /> RAAI Infratech</div>
          <nav className="nav-links">
            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end><LayoutDashboard size={20} /> Dashboard</NavLink>}
            <NavLink to="/update" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><ClipboardList size={20} /> Submit Report</NavLink>
            {user.role === 'SUPER_ADMIN' && <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Settings size={20} /> Sudo Settings</NavLink>}
            <button onClick={logout} className="btn" style={{ background: 'transparent', color: 'var(--danger)', marginTop: 'auto', border: '1px solid var(--danger)' }}><LogOut size={20} /> Logout</button>
          </nav>
        </aside>
        <Routes><Route path="/" element={<Dashboard />} /><Route path="/update" element={<SubmitReport />} /><Route path="/admin" element={<AdminPanel />} /></Routes>
      </div>
    </Router>
  );
};

export default function App() { return <AuthProvider><AppLayout /></AuthProvider>; }
