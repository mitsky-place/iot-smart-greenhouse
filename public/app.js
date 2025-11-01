const API_BASE = '/api';

async function fetchLatest() {
  try {
    const res = await fetch(`${API_BASE}/readings/latest`);
    const json = await res.json();
    if (json && json.created_at) {
      document.getElementById('temp').textContent = json.temp.toFixed(1);
      document.getElementById('humidity').textContent = json.humidity.toFixed(1);
      document.getElementById('soil').textContent = json.soil;
      document.getElementById('ts').textContent = json.created_at;
    }
  } catch(e) {
    console.error('Error fetching latest', e);
  }
}

async function fetchHistory() {
  try {
    const res = await fetch(`${API_BASE}/readings?limit=20`);
    const rows = await res.json();
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.created_at}</td><td>${r.temp.toFixed(1)}</td><td>${r.humidity.toFixed(1)}</td><td>${r.soil}</td>`;
      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error('Error fetching history', e);
  }
}

async function fetchActuators() {
  try {
    const res = await fetch(`${API_BASE}/actuators`);
    const json = await res.json();
    if (json.pump) {
      document.getElementById('state-pump').textContent = 'State: ' + json.pump.state;
      document.getElementById('btn-pump').dataset.state = json.pump.state;
    }
    if (json.fan) {
      document.getElementById('state-fan').textContent = 'State: ' + json.fan.state;
      document.getElementById('btn-fan').dataset.state = json.fan.state;
    }
  } catch(e) {
    console.error('Error fetching actuators', e);
  }
}

async function toggleActuator(name) {
  const btn = document.getElementById(`btn-${name}`);
  const current = parseInt(btn.dataset.state || '0');
  const next = current === 1 ? 0 : 1;
  try {
    const res = await fetch(`${API_BASE}/actuator`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, state: next })
    });
    const json = await res.json();
    if (json.ok) {
      await fetchActuators();
    } else {
      console.warn('Failed to update actuator', json);
    }
  } catch(e) {
    console.error('Error toggling actuator', e);
  }
}

document.getElementById('btn-pump').addEventListener('click', () => toggleActuator('pump'));
document.getElementById('btn-fan').addEventListener('click', () => toggleActuator('fan'));

function refreshAll() {
  fetchLatest();
  fetchHistory();
  fetchActuators();
}

// initial
refreshAll();
// poll periodically
setInterval(fetchLatest, 3000);
setInterval(fetchActuators, 3000);
setInterval(fetchHistory, 10000);
