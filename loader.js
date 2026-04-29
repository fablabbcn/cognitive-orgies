// MDEF Archive — runtime data loader
// Reads data.csv (projects) + students.csv (bios/photos) and exposes window.MDEF_DATA
// Cache-busted with ?v=<timestamp> so edits to the CSV always show up immediately.

(function () {
  const VERSION = Date.now(); // bust cache on each load
  const FILES = {
    projects: 'data.csv?v=' + VERSION,
    students: 'students.csv?v=' + VERSION,
  };

  const CLUSTERS = {
    'MC1': { name: 'Microchallenge 1', desc: 'First challenge — probing & prototyping', color: 'oklch(0.58 0.17 35)' },
    'MC2': { name: 'Microchallenge 2', desc: 'Second challenge — situating & building', color: 'oklch(0.62 0.14 140)' },
    'MC3': { name: 'Microchallenge 3', desc: 'Third challenge — scaling intervention', color: 'oklch(0.55 0.15 300)' },
    'MC4': { name: 'Microchallenge 4', desc: 'Fourth challenge — integration', color: 'oklch(0.55 0.12 240)' },
  };

  function clusterKey(t) {
    if (!t) return 'MC1';
    if (/1/.test(t)) return 'MC1';
    if (/2/.test(t)) return 'MC2';
    if (/3/.test(t)) return 'MC3';
    if (/4/.test(t)) return 'MC4';
    return 'MC1';
  }

  function tokens(s) {
    if (!s) return [];
    return s.split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(x => x && x.length < 60);
  }

  function canonName(n) { return (n || '').replace(/\s+/g, ' ').trim(); }

  function setStatus(text) {
    const el = document.getElementById('mdef-status');
    if (el) el.textContent = text;
  }

  function showError(msg) {
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = `
      <div style="position:fixed;inset:0;display:grid;place-items:center;font-family:'Söhne',sans-serif;padding:40px;text-align:center;background:#fbf6e8;">
        <div>
          <h1 style="font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:32px;margin:0 0 12px;">Couldn't load the archive</h1>
          <p style="color:#7a7060;max-width:480px;line-height:1.5;">${msg}</p>
          <p style="color:#a89d80;font-size:12px;margin-top:24px;">Check the <code>data.csv</code> and <code>students.csv</code> files in the repo, or open the browser console for details.</p>
        </div>
      </div>`;
  }

  function fetchCSV(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error('Failed to fetch ' + url + ' (' + r.status + ')');
      return r.text();
    }).then(text => new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data),
        error: reject,
      });
    }));
  }

  async function load() {
    setStatus('Loading projects…');
    const [projRows, studentRows] = await Promise.all([
      fetchCSV(FILES.projects),
      fetchCSV(FILES.students).catch(() => []),
    ]);

    setStatus('Building network…');

    // Build people from project students + students.csv
    const peopleMap = new Map(); // key: lowercased name → {id, name, bio, photo, projects}
    const studentDir = new Map();
    studentRows.forEach(r => {
      const name = canonName(r.name);
      if (!name) return;
      studentDir.set(name.toLowerCase(), { bio: (r.bio || '').trim(), photo: (r.photo || '').trim() });
    });

    projRows.forEach(p => {
      const students = (p.students || '').split('|').map(canonName).filter(Boolean);
      students.forEach(s => {
        const key = s.toLowerCase();
        if (!peopleMap.has(key)) {
          const dir = studentDir.get(key) || {};
          peopleMap.set(key, {
            id: null, name: s,
            bio: dir.bio || '',
            photo: dir.photo || '',
          });
        }
      });
    });

    let pid = 1;
    peopleMap.forEach(p => { p.id = 'p' + String(pid++).padStart(3, '0'); });

    // Build projects
    const projects = projRows.map((p, i) => {
      const studentNames = (p.students || '').split('|').map(canonName).filter(Boolean);
      const authorIds = studentNames
        .map(n => peopleMap.get(n.toLowerCase())?.id)
        .filter(Boolean);
      const areas = tokens(p.areas);
      const weakSignals = tokens(p.weak_signals);
      const knowledge = tokens(p.knowledge);
      const allTags = [...new Set([...areas, ...weakSignals, ...knowledge])].slice(0, 10);
      return {
        id: p.id || ('proj' + String(i).padStart(3, '0')),
        title: (p.title || '').trim(),
        year: parseInt(p.year, 10) || 0,
        cluster: clusterKey(p.type),
        type: p.type || '',
        authors: authorIds,
        summary: p.description || '',
        tags: allTags,
        areas,
        weakSignals,
        knowledge,
        photo: (p.photo || '').trim(),
        link: (p.link || '').trim(),
      };
    }).filter(p => p.title);

    const people = [...peopleMap.values()].map(p => ({
      id: p.id, name: p.name, bio: p.bio, photo: p.photo,
    }));

    window.MDEF_DATA = { projects, people, clusters: CLUSTERS };
    window.dispatchEvent(new CustomEvent('mdef-data-ready'));
    setStatus('');
  }

  // Inject loading shell
  const loader = document.createElement('div');
  loader.id = 'mdef-loader';
  loader.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;font-family:\'Söhne\',sans-serif;background:#fbf6e8;z-index:9999;transition:opacity 0.3s;';
  loader.innerHTML = `
    <div style="text-align:center;">
      <div style="font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:24px;color:#1a1409;">MDEF Archive</div>
      <div id="mdef-status" style="font-size:12px;color:#7a7060;margin-top:8px;letter-spacing:0.08em;text-transform:uppercase;">Initializing…</div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(loader));

  window.addEventListener('mdef-data-ready', () => {
    setTimeout(() => {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 300);
    }, 200);
  });

  // Wait for Papa to be available, then load.
  function waitForPapaAndLoad() {
    if (typeof Papa === 'undefined') {
      setTimeout(waitForPapaAndLoad, 50);
      return;
    }
    load().catch(err => {
      console.error('[MDEF] load failed', err);
      showError(err.message || String(err));
    });
  }
  waitForPapaAndLoad();
})();
