const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'super-secret-construction-key';
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('RAAI Infratech Backend API is running successfully with MongoDB! 🚀');
});

// Connect to MongoDB
if (!MONGO_URI) {
  console.log("WAITING FOR MONGODB: Set the MONGO_URI environment variable to start database connection.");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('Connected to MongoDB');
      seedDatabase();
    })
    .catch(err => console.error('MongoDB connection error:', err));
}

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  role: { type: String },
  fullName: { type: String }
});
const User = mongoose.model('User', userSchema);

const workSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  description: { type: String },
  allocManpower: { type: Number, default: 0 },
  allocCost: { type: Number, default: 0 },
  allocMaterial: { type: Number, default: 0 },
  allocEquipment: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Work = mongoose.model('Work', workSchema);

const reportSchema = new mongoose.Schema({
  date: { type: String },
  supervisorName: { type: String },
  workName: { type: String },
  usedManpower: { type: Number, default: 0 },
  usedCost: { type: Number, default: 0 },
  usedMaterial: { type: Number, default: 0 },
  usedEquipment: { type: Number, default: 0 },
  remainingWorkNotes: { type: String },
  status: { type: String, default: 'PENDING' },
  createdAt: { type: Date, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

// Seed Initial Data
const seedDatabase = async () => {
  const count = await User.countDocuments();
  if (count === 0) {
    const hash = bcrypt.hashSync('password123', 10);
    await User.insertMany([
      { username: 'sudo', password: hash, role: 'SUPER_ADMIN', fullName: 'Super Admin' },
      { username: 'admin', password: hash, role: 'ADMIN', fullName: 'Admin' },
      { username: 'super1', password: hash, role: 'SUPERVISOR', fullName: 'Supervisor 1' }
    ]);
    await Work.create({
      name: 'Foundation Block A',
      allocManpower: 500,
      allocCost: 100000,
      allocMaterial: 50000,
      allocEquipment: 20000
    });
    console.log("Database seeded with initial users and works.");
  }
};

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/login', async (req, res) => {
  if (!MONGO_URI) return res.status(500).json({ error: 'MongoDB not configured' });
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user._id, role: user.role, username: user.username, fullName: user.fullName }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user._id, username: user.username, role: user.role, fullName: user.fullName } });
});

app.get('/api/users', authenticateToken, async (req, res) => {
  const users = await User.find({}, '-password');
  res.json({ users: users.map(u => ({ id: u._id, username: u.username, role: u.role, fullName: u.fullName })) });
});

app.get('/api/works', authenticateToken, async (req, res) => {
  const works = await Work.find();
  const worksData = await Promise.all(works.map(async w => {
    const reports = await Report.find({ workName: w.name, status: 'ACCEPTED' });
    const totalUsedManpower = reports.reduce((acc, r) => acc + r.usedManpower, 0);
    const totalUsedCost = reports.reduce((acc, r) => acc + r.usedCost, 0);
    return {
      id: w._id, name: w.name, description: w.description,
      allocManpower: w.allocManpower, allocCost: w.allocCost,
      totalUsedManpower, totalUsedCost
    };
  }));
  res.json({ works: worksData });
});

app.post('/api/works', authenticateToken, async (req, res) => {
  if (req.user.role === 'SUPERVISOR') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const work = await Work.create(req.body);
    res.status(201).json({ message: 'Work created', id: work._id });
  } catch (err) {
    res.status(500).json({ error: 'Work already exists or server error' });
  }
});

app.get('/api/reports', authenticateToken, async (req, res) => {
  const filter = {};
  if (req.query.workName) filter.workName = req.query.workName;
  if (req.user.role === 'SUPERVISOR') filter.supervisorName = req.user.username;
  const reports = await Report.find(filter).sort({ createdAt: -1 });
  res.json({ reports: reports.map(r => ({ ...r.toObject(), id: r._id })) });
});

app.post('/api/reports', authenticateToken, async (req, res) => {
  const { date, workName, usedManpower, usedCost, usedMaterial, usedEquipment, remainingWorkNotes, proxySupervisor } = req.body;
  const supervisorName = req.user.role === 'SUPERVISOR' ? req.user.username : proxySupervisor || req.user.username;
  
  const report = await Report.create({
    date, workName, supervisorName, remainingWorkNotes,
    usedManpower: Number(usedManpower), usedCost: Number(usedCost),
    usedMaterial: Number(usedMaterial), usedEquipment: Number(usedEquipment),
    status: 'PENDING'
  });
  res.status(201).json({ message: 'Report submitted', id: report._id });
});

app.put('/api/reports/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role === 'SUPERVISOR') return res.status(403).json({ error: 'Unauthorized' });
  await Report.findByIdAndUpdate(req.params.id, { status: req.body.status });
  res.json({ message: 'Status updated' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
