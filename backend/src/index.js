const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'super-secret-construction-key';

app.use(cors());
app.use(express.json());

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error(err.message);
  else {
    console.log('Connected to DB');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, fullName TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS works (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, description TEXT,
        allocManpower INTEGER DEFAULT 0, allocCost REAL DEFAULT 0, allocMaterial REAL DEFAULT 0, allocEquipment REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, supervisorName TEXT, workName TEXT,
        usedManpower INTEGER DEFAULT 0, usedCost REAL DEFAULT 0, usedMaterial REAL DEFAULT 0, usedEquipment REAL DEFAULT 0,
        remainingWorkNotes TEXT, status TEXT DEFAULT 'PENDING', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.get("SELECT COUNT(*) as c FROM users", (e, r) => {
        if (r && r.c === 0) {
          const hash = bcrypt.hashSync('password123', 10);
          db.run("INSERT INTO users (username,password,role,fullName) VALUES ('sudo',?,'SUPER_ADMIN','Super Admin'), ('admin',?,'ADMIN','Admin'), ('super1',?,'SUPERVISOR','Supervisor 1')", [hash,hash,hash]);
        }
      });
      db.get("SELECT COUNT(*) as c FROM works", (e, r) => {
        if (r && r.c === 0) {
          db.run("INSERT INTO works (name, allocManpower, allocCost, allocMaterial, allocEquipment) VALUES ('Foundation Block A', 500, 100000, 50000, 20000)");
        }
      });
    });
  }
});

const auth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({error: 'Access denied'});
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({error: 'Invalid token'});
    req.user = user; next();
  });
};

app.post('/api/login', (req, res) => {
  db.get("SELECT * FROM users WHERE username = ?", [req.body.username], (err, user) => {
    if (!user || !bcrypt.compareSync(req.body.password, user.password)) return res.status(400).json({error: 'Invalid credentials'});
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, fullName: user.fullName }, JWT_SECRET, {expiresIn: '24h'});
    res.json({ token, user: {id: user.id, username: user.username, role: user.role, fullName: user.fullName} });
  });
});

app.get('/api/users', auth, (req, res) => {
  db.all("SELECT id, username, role, fullName FROM users", [], (err, rows) => res.json({users: rows}));
});

app.post('/api/users', auth, (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({error: 'Forbidden'});
  db.run("INSERT INTO users (username, password, role, fullName) VALUES (?,?,?,?)", 
    [req.body.username, bcrypt.hashSync(req.body.password, 10), req.body.role, req.body.fullName], 
    err => err ? res.status(400).json({error: err.message}) : res.json({message: 'User created'}));
});

app.get('/api/works', auth, (req, res) => {
  // Return works with calculated usage
  db.all(`
    SELECT w.*, 
      IFNULL(SUM(r.usedManpower), 0) as totalUsedManpower,
      IFNULL(SUM(r.usedCost), 0) as totalUsedCost,
      IFNULL(SUM(r.usedMaterial), 0) as totalUsedMaterial,
      IFNULL(SUM(r.usedEquipment), 0) as totalUsedEquipment
    FROM works w
    LEFT JOIN reports r ON w.name = r.workName AND r.status != 'REJECTED'
    GROUP BY w.id
    ORDER BY w.createdAt DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json({works: rows});
  });
});

app.post('/api/works', auth, (req, res) => {
  if (req.user.role === 'SUPERVISOR') return res.status(403).json({error: 'Forbidden'});
  const { name, description, allocManpower, allocCost, allocMaterial, allocEquipment } = req.body;
  db.run("INSERT INTO works (name,description,allocManpower,allocCost,allocMaterial,allocEquipment) VALUES (?,?,?,?,?,?)",
    [name, description, allocManpower, allocCost, allocMaterial, allocEquipment],
    err => err ? res.status(400).json({error: err.message}) : res.json({message: 'Work created'}));
});

app.post('/api/reports', auth, (req, res) => {
  const { date, workName, usedManpower, usedCost, usedMaterial, usedEquipment, remainingWorkNotes, proxySupervisor } = req.body;
  
  // Proxy feature: Admin/Sudo can submit on behalf of supervisor
  let supervisor = req.user.username;
  if ((req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') && proxySupervisor) {
    supervisor = proxySupervisor;
  } else if (req.user.role !== 'SUPERVISOR' && !proxySupervisor) {
    return res.status(400).json({error: 'Admin must select a supervisor to proxy'});
  }

  db.run("INSERT INTO reports (date,supervisorName,workName,usedManpower,usedCost,usedMaterial,usedEquipment,remainingWorkNotes) VALUES (?,?,?,?,?,?,?,?)",
    [date, supervisor, workName, usedManpower, usedCost, usedMaterial, usedEquipment, remainingWorkNotes],
    err => err ? res.status(500).json({error:err.message}) : res.json({message: 'Report saved'}));
});

app.get('/api/reports', auth, (req, res) => {
  let sql = `SELECT * FROM reports WHERE 1=1`;
  let params = [];
  if (req.user.role === 'SUPERVISOR') { sql += ` AND supervisorName=?`; params.push(req.user.username); }
  if (req.query.workName) { sql += ` AND workName=?`; params.push(req.query.workName); }
  sql += ` ORDER BY date DESC`;
  db.all(sql, params, (err, rows) => res.json({reports: rows}));
});

app.put('/api/reports/:id/status', auth, (req, res) => {
  if (req.user.role === 'SUPERVISOR') return res.status(403).json({error: 'Forbidden'});
  db.run(`UPDATE reports SET status=? WHERE id=?`, [req.body.status, req.params.id], err => res.json({message: 'Updated'}));
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
