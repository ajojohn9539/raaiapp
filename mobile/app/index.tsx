import React, { useState, useEffect, createContext, useContext } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const API_URL = 'https://raaiapp.onrender.com/api';
const AuthContext = createContext(null);

export default function AppContainer() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const login = (u, t) => { setUser(u); setToken(t); };
  const logout = () => { setUser(null); setToken(null); };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {user ? <MainApp /> : <LoginScreen />}
    </AuthContext.Provider>
  );
}

function LoginScreen() {
  const { login } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return Alert.alert('Error', 'Please enter username and password');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) login(data.user, data.token);
      else Alert.alert('Login Failed', data.error || 'Invalid credentials');
    } catch (error) {
      Alert.alert('Network Error', 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image 
          source={require('../assets/images/icon.png')} 
          style={{ width: 100, height: 100, alignSelf: 'center', marginBottom: 15, borderRadius: 20 }}
          resizeMode="contain"
        />
        <Text style={styles.title}>RAAI Infratech</Text>
        <Text style={styles.subtitle}>Secure Access</Text>
        <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#888" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MainApp() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState(user.role === 'SUPERVISOR' ? 'submit' : 'dashboard');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{user.fullName}</Text>
        <TouchableOpacity onPress={logout}><Text style={styles.logoutText}>Logout</Text></TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, width: '100%' }}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'submit' && <SubmitReport />}
        {activeTab === 'admin' && <AdminPanel />}
      </ScrollView>

      <View style={styles.tabBar}>
        {user.role !== 'SUPERVISOR' && (
          <TouchableOpacity style={[styles.tab, activeTab === 'dashboard' && styles.activeTab]} onPress={() => setActiveTab('dashboard')}>
            <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>Dashboard</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={[styles.tab, activeTab === 'submit' && styles.activeTab]} onPress={() => setActiveTab('submit')}>
          <Text style={[styles.tabText, activeTab === 'submit' && styles.activeTabText]}>Submit</Text>
        </TouchableOpacity>

        {user.role === 'SUPER_ADMIN' && (
          <TouchableOpacity style={[styles.tab, activeTab === 'admin' && styles.activeTab]} onPress={() => setActiveTab('admin')}>
            <Text style={[styles.tabText, activeTab === 'admin' && styles.activeTabText]}>Admin</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Dashboard() {
  const { token, user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [works, setWorks] = useState([]);
  const [workFilter, setWorkFilter] = useState('');

  const loadData = () => {
    fetch(`${API_URL}/works`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.works && setWorks(d.works));
    fetch(`${API_URL}/reports${workFilter ? `?workName=${workFilter}` : ''}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r=>r.json()).then(d => d.reports && setReports(d.reports));
  };

  useEffect(() => { loadData(); }, [workFilter]);

  const handleStatusChange = async (id, status) => {
    await fetch(`${API_URL}/reports/${id}/status`, { method: 'PUT', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify({status})});
    loadData();
  };

  const selectedWorkObj = works.find(w => w.name === workFilter);

  return (
    <View style={{ padding: 15 }}>
      <Text style={styles.sectionTitle}>Dashboard</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Filter by Work:</Text>
        <Picker selectedValue={workFilter} style={styles.picker} onValueChange={setWorkFilter}>
          <Picker.Item label="All Works" value="" />
          {works.map(w => <Picker.Item key={w.id} label={w.name} value={w.name} />)}
        </Picker>
      </View>

      {selectedWorkObj && (
        <View style={styles.card}>
          <Text style={styles.label}>Budget: ${selectedWorkObj.allocCost - selectedWorkObj.totalUsedCost} remaining</Text>
          <Text style={styles.label}>Manpower: {selectedWorkObj.allocManpower - selectedWorkObj.totalUsedManpower} days remaining</Text>
        </View>
      )}

      {reports.map(r => (
        <View key={r.id} style={styles.reportCard}>
          <Text style={styles.reportTitle}>{r.date} - {r.workName}</Text>
          <Text style={styles.reportText}>Supervisor: {r.supervisorName}</Text>
          <Text style={styles.reportText}>Cost: ${r.usedCost} | Manpower: {r.usedManpower}</Text>
          <Text style={styles.reportText}>Status: {r.status}</Text>
          
          {r.status === 'PENDING' && user.role !== 'SUPERVISOR' && (
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
              <TouchableOpacity style={[styles.button, {flex: 1, backgroundColor: 'green'}]} onPress={() => handleStatusChange(r.id, 'ACCEPTED')}>
                <Text style={styles.buttonText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, {flex: 1, backgroundColor: 'red'}]} onPress={() => handleStatusChange(r.id, 'REJECTED')}>
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function SubmitReport() {
  const { token, user } = useContext(AuthContext);
  const [works, setWorks] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [proxySupervisor, setProxySupervisor] = useState('');
  const [workName, setWorkName] = useState('');
  const [usedManpower, setUsedManpower] = useState('');
  const [usedCost, setUsedCost] = useState('');
  const [usedMaterial, setUsedMaterial] = useState('');
  const [usedEquipment, setUsedEquipment] = useState('');
  const [remainingWorkNotes, setRemainingWorkNotes] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/works`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.works && setWorks(d.works));
    if (user.role !== 'SUPERVISOR') {
      fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r=>r.json()).then(d => d.users && setUsers(d.users.filter(u=>u.role==='SUPERVISOR')));
    }
  }, []);

  const handleSubmit = async () => {
    if (!workName || !usedManpower || !usedCost || !remainingWorkNotes) return Alert.alert('Error', 'Please fill all required fields');
    
    const payload = {
      date: new Date().toISOString().split('T')[0],
      workName, usedManpower, usedCost, usedMaterial: usedMaterial||'0', usedEquipment: usedEquipment||'0', remainingWorkNotes, proxySupervisor
    };

    const res = await fetch(`${API_URL}/reports`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify(payload)});
    if(res.ok) {
      Alert.alert('Success', 'Report Submitted!');
      setUsedManpower(''); setUsedCost(''); setUsedMaterial(''); setUsedEquipment(''); setRemainingWorkNotes('');
    } else {
      Alert.alert('Error', (await res.json()).error);
    }
  };

  return (
    <View style={{ padding: 15 }}>
      <Text style={styles.sectionTitle}>Submit Daily Report</Text>
      <View style={styles.card}>
        {user.role !== 'SUPERVISOR' && (
          <>
            <Text style={styles.label}>Proxy As (Supervisor)</Text>
            <Picker selectedValue={proxySupervisor} style={styles.picker} onValueChange={setProxySupervisor}>
              <Picker.Item label="-- Choose Supervisor --" value="" />
              {users.map(u => <Picker.Item key={u.id} label={u.fullName} value={u.username} />)}
            </Picker>
          </>
        )}

        <Text style={styles.label}>Select Work</Text>
        <Picker selectedValue={workName} style={styles.picker} onValueChange={setWorkName}>
          <Picker.Item label="-- Select Work --" value="" />
          {works.map(w => <Picker.Item key={w.id} label={w.name} value={w.name} />)}
        </Picker>

        <TextInput style={styles.input} placeholder="Used Manpower" placeholderTextColor="#888" keyboardType="numeric" value={usedManpower} onChangeText={setUsedManpower} />
        <TextInput style={styles.input} placeholder="Used Cost ($)" placeholderTextColor="#888" keyboardType="numeric" value={usedCost} onChangeText={setUsedCost} />
        <TextInput style={styles.input} placeholder="Used Materials" placeholderTextColor="#888" keyboardType="numeric" value={usedMaterial} onChangeText={setUsedMaterial} />
        <TextInput style={styles.input} placeholder="Used Equipment" placeholderTextColor="#888" keyboardType="numeric" value={usedEquipment} onChangeText={setUsedEquipment} />
        <TextInput style={[styles.input, {height: 80}]} placeholder="Notes / Remaining Work" placeholderTextColor="#888" multiline value={remainingWorkNotes} onChangeText={setRemainingWorkNotes} />

        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>Submit Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AdminPanel() {
  const { token } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allocManpower, setAllocManpower] = useState('');
  const [allocCost, setAllocCost] = useState('');
  const [allocMaterial, setAllocMaterial] = useState('');
  const [allocEquipment, setAllocEquipment] = useState('');

  const createWork = async () => {
    if (!name || !allocManpower || !allocCost) return Alert.alert('Error', 'Missing fields');
    const payload = { name, description, allocManpower, allocCost, allocMaterial: allocMaterial||'0', allocEquipment: allocEquipment||'0' };
    const res = await fetch(`${API_URL}/works`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify(payload)});
    if(res.ok) {
      Alert.alert('Success', 'Work Created!');
      setName(''); setDescription(''); setAllocManpower(''); setAllocCost(''); setAllocMaterial(''); setAllocEquipment('');
    } else {
      Alert.alert('Error', (await res.json()).error);
    }
  };

  return (
    <View style={{ padding: 15 }}>
      <Text style={styles.sectionTitle}>Sudo Settings</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Work Name" placeholderTextColor="#888" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Description" placeholderTextColor="#888" value={description} onChangeText={setDescription} />
        <TextInput style={styles.input} placeholder="Allocated Manpower" placeholderTextColor="#888" keyboardType="numeric" value={allocManpower} onChangeText={setAllocManpower} />
        <TextInput style={styles.input} placeholder="Allocated Cost ($)" placeholderTextColor="#888" keyboardType="numeric" value={allocCost} onChangeText={setAllocCost} />
        <TextInput style={styles.input} placeholder="Allocated Material" placeholderTextColor="#888" keyboardType="numeric" value={allocMaterial} onChangeText={setAllocMaterial} />
        <TextInput style={styles.input} placeholder="Allocated Equipment" placeholderTextColor="#888" keyboardType="numeric" value={allocEquipment} onChangeText={setAllocEquipment} />
        <TouchableOpacity style={styles.button} onPress={createWork}>
          <Text style={styles.buttonText}>Create Budgeted Work</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', width: '100%' },
  header: { paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: '#1e293b', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutText: { color: '#ef4444', fontSize: 16 },
  card: { width: '100%', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 15, alignSelf: 'center' },
  reportCard: { backgroundColor: '#1e293b', padding: 15, borderRadius: 8, marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3b82f6', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 30 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  label: { color: '#94a3b8', marginBottom: 5, fontSize: 14 },
  input: { backgroundColor: '#0f172a', color: '#fff', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16 },
  picker: { backgroundColor: '#0f172a', color: '#fff', marginBottom: 15, height: 50 },
  button: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  reportTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  reportText: { color: '#94a3b8', fontSize: 14, marginBottom: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155', paddingBottom: 20, paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontSize: 14 },
  activeTabText: { color: '#3b82f6', fontWeight: 'bold' },
});
