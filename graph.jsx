// Force-directed graph for MDEF archive.
// Two kinds of nodes: projects (larger) and people (smaller).
// Edges: person ↔ project (authorship).
// Click a project → it becomes the focus; the simulation pulls its neighborhood closer.

const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM, useCallback: uC } = React;

// --- Simulation ----------------------------------------------------------

function makeSimulation({ projects, people, clusters }) {
  // Build nodes
  const nodes = [];
  const idMap = new Map();

  projects.forEach(p => {
    const n = {
      id: 'proj:' + p.id,
      type: 'project',
      ref: p,
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 1400,
      vx: 0, vy: 0,
      r: 26,
      pinned: false,
    };
    nodes.push(n);
    idMap.set(n.id, n);
  });

  people.forEach(pr => {
    const n = {
      id: 'pers:' + pr.id,
      type: 'person',
      ref: pr,
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 1400,
      vx: 0, vy: 0,
      r: 8,
      pinned: false,
    };
    nodes.push(n);
    idMap.set(n.id, n);
  });

  // Build edges
  const edges = [];
  projects.forEach(p => {
    p.authors.forEach(aid => {
      const a = idMap.get('pers:' + aid);
      const b = idMap.get('proj:' + p.id);
      if (a && b) edges.push({ source: a, target: b });
    });
  });

  // Precompute neighbor map for quick lookups
  const neighbors = new Map();
  edges.forEach(e => {
    if (!neighbors.has(e.source.id)) neighbors.set(e.source.id, new Set());
    if (!neighbors.has(e.target.id)) neighbors.set(e.target.id, new Set());
    neighbors.get(e.source.id).add(e.target.id);
    neighbors.get(e.target.id).add(e.source.id);
  });

  return { nodes, edges, idMap, neighbors };
}

function stepSimulation(sim, params) {
  const { nodes, edges } = sim;
  const {
    repulsion = 1800,     // node-node
    linkStrength = 0.02,
    linkDistance = 90,
    centerStrength = 0.004,
    focusId = null,
    focusStrength = 0.06,
    damping = 0.82,
    clusterYearPull = 0.0015, // gentle pull by year so cohorts cluster vertically
  } = params;

  const N = nodes.length;

  // Repulsion (O(n^2) — fine for ~230 nodes)
  for (let i = 0; i < N; i++) {
    const a = nodes[i];
    if (a.pinned) continue;
    for (let j = i + 1; j < N; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      const d = Math.sqrt(d2);
      // softer for projects vs person-to-person
      const rep = repulsion / d2;
      const fx = (dx / d) * rep;
      const fy = (dy / d) * rep;
      a.vx -= fx;
      a.vy -= fy;
      if (!b.pinned) { b.vx += fx; b.vy += fy; }
    }
  }

  // Link spring
  edges.forEach(e => {
    const a = e.source, b = e.target;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const diff = (d - linkDistance) * linkStrength;
    const fx = (dx / d) * diff;
    const fy = (dy / d) * diff;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  });

  // Center pull
  nodes.forEach(n => {
    if (n.pinned) return;
    n.vx -= n.x * centerStrength;
    n.vy -= n.y * centerStrength;
  });

  // Grouping pull — clusters projects AND people toward "anchor" points based on chosen mode
  if (params.groupAnchors) {
    nodes.forEach(n => {
      if (n.pinned) return;
      // groupAnchors accepts both project ref and person ref via .personKey
      const anchor = params.groupAnchors(n.ref, n.type);
      if (!anchor) return;
      const pull = params.groupPull ?? 0.018;
      // people get a softer pull so they don't crowd anchor centers
      const k = n.type === 'person' ? pull * 0.6 : pull;
      n.vx += (anchor.x - n.x) * k;
      n.vy += (anchor.y - n.y) * k;
    });
  }

  // Focus attractor
  if (focusId) {
    const f = sim.idMap.get(focusId);
    if (f) {
      f.x = 0; f.y = 0; f.vx = 0; f.vy = 0; f.pinned = true;
      // pull 1-hop neighbors closer to focus
      const nbs = sim.neighbors.get(focusId);
      if (nbs) {
        nbs.forEach(nid => {
          const n = sim.idMap.get(nid);
          if (!n || n.pinned) return;
          // pull toward a ring ~140 around focus
          const dx = n.x - f.x, dy = n.y - f.y;
          const d = Math.sqrt(dx*dx + dy*dy) || 0.01;
          const target = 130;
          const diff = (d - target);
          n.vx -= (dx / d) * diff * focusStrength;
          n.vy -= (dy / d) * diff * focusStrength;
        });
      }
    }
  }

  // Integrate
  let kinetic = 0;
  nodes.forEach(n => {
    if (n.pinned) { n.vx = 0; n.vy = 0; return; }
    n.vx *= damping;
    n.vy *= damping;
    // clamp velocity
    const vmax = 30;
    if (n.vx > vmax) n.vx = vmax; else if (n.vx < -vmax) n.vx = -vmax;
    if (n.vy > vmax) n.vy = vmax; else if (n.vy < -vmax) n.vy = -vmax;
    n.x += n.vx;
    n.y += n.vy;
    kinetic += n.vx * n.vx + n.vy * n.vy;
  });
  return kinetic / Math.max(1, nodes.length);
}

// --- Render --------------------------------------------------------------

function Graph({
  projects, people, clusters,
  filters, searchQuery,
  selectedProject, setSelectedProject,
  hoverPersonId, setHoverPersonId,
  activePersonId, setActivePersonId,
  groupMode = 'year',
  setSelectedPerson = () => {},
  nodeScale = 1,
  viewMode = 'both',
  connectionMode = 'project-author',
  connectBy = 'author',
}) {
  // Derived booleans from view/connection modes
  const showStudents = viewMode !== 'projects';
  const showProjects = viewMode !== 'students';
  const showConnections = connectionMode !== 'none';
  const personConnections = connectionMode === 'project-project';
  const studentConnections = connectionMode === 'student-student';
  const containerRef = uR(null);
  const simRef = uR(null);
  const rafRef = uR(null);
  const [tick, setTick] = uS(0);
  const [transform, setTransform] = uS({ x: 0, y: 0, k: 1 });
  const [viewSize, setViewSize] = uS({ w: 1200, h: 800 });
  const panRef = uR({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const dragRef = uR({ node: null, offsetX: 0, offsetY: 0 });

  // Init simulation once
  uE(() => {
    simRef.current = makeSimulation({ projects, people, clusters });
  }, [projects, people]);

  // Resize
  uE(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setViewSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // Compute group anchors (positions for each group key based on groupMode)
  const groupAnchorsFn = uM(() => {
    if (groupMode === 'free') return null;

    // GRID mode: each project gets its own slot in a regular reticule.
    if (groupMode === 'grid') {
      const sorted = [...projects].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return (a.cluster || '').localeCompare(b.cluster || '') || a.title.localeCompare(b.title);
      });
      const N = sorted.length;
      const cols = Math.max(8, Math.ceil(Math.sqrt(N * 1.6)));
      // Cell size must accommodate the widest project node + a gap, so images
      // never overlap regardless of nodeScale (collab images render at 64*scale).
      const maxW = 64 * nodeScale;
      const GAP = 22;
      const CELL = Math.max(84, Math.ceil(maxW + GAP));
      const slots = new Map();
      sorted.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        slots.set(p.id, {
          x: (col - (cols - 1) / 2) * CELL,
          y: (row - (Math.ceil(N / cols) - 1) / 2) * CELL,
          label: '',
        });
      });
      // Person → centroid of their projects
      const personMap = new Map();
      projects.forEach(p => (p.authors || []).forEach(aid => {
        if (!personMap.has(aid)) personMap.set(aid, []);
        personMap.get(aid).push(p.id);
      }));
      const fn = (ref, type) => {
        if (type === 'person') {
          const ids = personMap.get(ref.id) || [];
          if (!ids.length) return null;
          let sx = 0, sy = 0, n = 0;
          ids.forEach(id => { const s = slots.get(id); if (s) { sx += s.x; sy += s.y; n++; } });
          return n ? { x: sx / n, y: sy / n + 40 } : null;
        }
        return slots.get(ref.id);
      };
      fn.anchors = new Map();
      fn.keys = [];
      return fn;
    }

    // Determine groups + their canonical key per project
    const projKey = (p) => {
      if (groupMode === 'year') return String(p.year);
      if (groupMode === 'mc') return p.cluster;
      if (groupMode === 'area') {
        if (!p.tags || !p.tags.length) return 'Other';
        return p.tags[0]; // first tag as primary
      }
      if (groupMode === 'photo') return p.photo ? 'with-photo' : 'no-photo';
      return null;
    };

    // Collect unique keys
    const keyCounts = new Map();
    projects.forEach(p => {
      const k = projKey(p);
      if (!k) return;
      keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    });

    // Sort keys: by year ascending, MC numeric, others by count desc
    let keys = [...keyCounts.keys()];
    if (groupMode === 'year') keys.sort((a, b) => parseInt(b) - parseInt(a));
    else if (groupMode === 'mc') keys.sort();
    else keys.sort((a, b) => keyCounts.get(b) - keyCounts.get(a));

    // For 'area', keep only top-12, lump rest into 'Other'
    if (groupMode === 'area' && keys.length > 12) {
      const top = keys.slice(0, 11);
      keys = [...top, 'Other'];
    }

    // Place anchors in a circle (or line for year)
    const anchors = new Map();
    if (groupMode === 'year') {
      // vertical bands
      const SPACING = 260;
      keys.forEach((k, i) => {
        anchors.set(k, { x: 0, y: (i - (keys.length - 1) / 2) * SPACING, label: k });
      });
    } else {
      const N = keys.length;
      const R = Math.max(280, N * 65);
      keys.forEach((k, i) => {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
        anchors.set(k, { x: Math.cos(angle) * R, y: Math.sin(angle) * R, label: k });
      });
    }

    // Pre-compute person→projects for grouping
    const personProjMap = new Map();
    projects.forEach(p => {
      (p.authors || []).forEach(aid => {
        if (!personProjMap.has(aid)) personProjMap.set(aid, []);
        personProjMap.get(aid).push(p);
      });
    });

    const fn = (ref, type) => {
      if (type === 'person') {
        // Person: derive key from majority of their projects
        const myProj = personProjMap.get(ref.id) || [];
        if (myProj.length === 0) return null;
        const counts = new Map();
        myProj.forEach(p => {
          const k = projKey(p);
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        });
        let bestK = null, bestC = -1;
        counts.forEach((c, k) => { if (c > bestC) { bestK = k; bestC = c; } });
        if (groupMode === 'area' && !anchors.has(bestK)) bestK = 'Other';
        const a = anchors.get(bestK);
        if (!a) return null;
        return a;
      }
      // project
      let k = projKey(ref);
      if (groupMode === 'area' && !anchors.has(k)) k = 'Other';
      return anchors.get(k);
    };
    fn.anchors = anchors;
    fn.keys = keys;
    return fn;
  }, [groupMode, projects, nodeScale]);

  // Animation loop — runs at ~30 fps when active, pauses when sim settles
  uE(() => {
    let running = true;
    let lastTick = 0;
    let settledFrames = 0;
    const loop = (ts) => {
      if (!running) return;
      const sim = simRef.current;
      if (sim) {
        // No focusId in simulation: selecting a project/person should NOT
        // pull it to the center or rearrange the graph — selection is purely
        // visual + the side panel. The user keeps their spatial context.
        sim.nodes.forEach(n => {
          if (!dragRef.current.node || dragRef.current.node !== n) n.pinned = false;
        });
        // Chess-board grid: snap project nodes to their exact slot every frame
        // and pin them so repulsion / link springs can't push them around.
        // Person nodes stay free so they can drift toward their author centroid.
        if (groupMode === 'grid' && groupAnchorsFn) {
          sim.nodes.forEach(n => {
            if (n.type !== 'project') return;
            if (dragRef.current.node === n) return;
            const a = groupAnchorsFn(n.ref, 'project');
            if (!a) return;
            n.x = a.x; n.y = a.y; n.vx = 0; n.vy = 0;
            n.pinned = true;
          });
        }
        const ke = stepSimulation(sim, {
          focusId: null,
          linkDistance: 95,
          groupAnchors: groupAnchorsFn,
          groupPull: groupMode === 'grid' ? 0.14 : 0.022,
          repulsion: groupMode === 'grid' ? 200 : undefined,
          centerStrength: groupMode === 'grid' ? 0 : undefined,
        });
        // Render at most every 33 ms (≈30 fps)
        if (ts - lastTick > 33) {
          lastTick = ts;
          setTick(t => (t + 1) % 1000000);
        }
        // Stop sim entirely once it's been calm for a while
        if (ke < 0.05) settledFrames++; else settledFrames = 0;
        if (settledFrames > 60) {
          // wait a beat then resume on next change (interaction restarts via deps)
          rafRef.current = setTimeout(() => loop(performance.now()), 200);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); clearTimeout(rafRef.current); };
  }, [selectedProject, groupAnchorsFn]);

  // Compute what's visible per filters+search
  const visibility = uM(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    const visibleProjectIds = new Set();
    projects.forEach(p => {
      if (filters.years.size > 0 && !filters.years.has(p.year)) return;
      if (filters.clusters.size > 0 && !filters.clusters.has(p.cluster)) return;
      if (filters.areas && filters.areas.size > 0) {
        const has = (p.areas || []).some(a => filters.areas.has(a));
        if (!has) return;
      }
      if (filters.weakSignals && filters.weakSignals.size > 0) {
        const has = (p.weakSignals || []).some(a => filters.weakSignals.has(a));
        if (!has) return;
      }
      if (q) {
        const authors = p.authors.map(aid => people.find(pp => pp.id === aid)?.name.toLowerCase() || '').join(' ');
        const hay = `${p.title} ${p.summary} ${(p.tags||[]).join(' ')} ${authors}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      visibleProjectIds.add(p.id);
    });
    // Build person→projects map from project authors
    const personProjects = new Map();
    projects.forEach(p => {
      (p.authors || []).forEach(aid => {
        if (!personProjects.has(aid)) personProjects.set(aid, []);
        personProjects.get(aid).push(p.id);
      });
    });
    // Person visible if at least one of their projects is visible (or name matches search)
    const visiblePersonIds = new Set();
    people.forEach(pe => {
      const myProjs = personProjects.get(pe.id) || [];
      const hasVisible = myProjs.some(pid => visibleProjectIds.has(pid));
      if (hasVisible) visiblePersonIds.add(pe.id);
      else if (q && pe.name.toLowerCase().includes(q)) visiblePersonIds.add(pe.id);
    });
    return { visibleProjectIds, visiblePersonIds };
  }, [projects, people, filters, searchQuery]);

  // Compute highlight from hover/pinned person or selected project
  const highlight = uM(() => {
    const sim = simRef.current;
    if (!sim) return { nodeIds: null, edgeKeys: null };
    const focusNodeId = selectedProject ? 'proj:' + selectedProject.id : null;
    const personId = hoverPersonId || activePersonId;
    const personNodeId = personId ? 'pers:' + personId : null;

    // Special case: project view + project selected → highlight by current "connect by" dimension
    if (connectionMode === 'project-project' && focusNodeId && !personNodeId) {
      const fieldKey = connectBy === 'area' ? 'areas'
                     : connectBy === 'weakSignal' ? 'weakSignals'
                     : 'authors';
      const mine = selectedProject[fieldKey] || [];
      const set = new Set([focusNodeId]);
      if (mine.length) {
        for (const p of projects) {
          if (p.id === selectedProject.id) continue;
          const theirs = p[fieldKey] || [];
          if (theirs.some(x => mine.includes(x))) set.add('proj:' + p.id);
        }
      }
      return { nodeIds: set, edgeKeys: null };
    }

    const sourceId = personNodeId || focusNodeId;
    if (!sourceId) {
      // No focus: in project-project mode, dim projects that have NO connection in current dimension
      if (connectionMode === 'project-project') {
        const fieldKey = connectBy === 'area' ? 'areas'
                       : connectBy === 'weakSignal' ? 'weakSignals'
                       : 'authors';
        const connected = new Set();
        for (let i = 0; i < projects.length; i++) {
          for (let j = i + 1; j < projects.length; j++) {
            const a = projects[i], b = projects[j];
            const aS = a[fieldKey] || [], bS = b[fieldKey] || [];
            if (!aS.length || !bS.length) continue;
            if (aS.some(x => bS.includes(x))) {
              connected.add('proj:' + a.id);
              connected.add('proj:' + b.id);
            }
          }
        }
        // Only dim if there ARE orphans; if all are connected, no need to highlight
        if (connected.size && connected.size < projects.length) {
          return { nodeIds: connected, edgeKeys: null, soft: true };
        }
      }
      return { nodeIds: null, edgeKeys: null };
    }
    const nb = sim.neighbors.get(sourceId) || new Set();
    const nodeIds = new Set([sourceId, ...nb]);
    // include 2-hop for project focus → reach co-authors' other projects
    if (focusNodeId && !personNodeId) {
      const twoHop = new Set(nodeIds);
      nb.forEach(nid => {
        const secondHop = sim.neighbors.get(nid) || new Set();
        secondHop.forEach(x => twoHop.add(x));
      });
      return { nodeIds: twoHop, edgeKeys: null };
    }
    // For person focus → also include 2-hop co-students (students who share a project)
    if (personNodeId) {
      const twoHop = new Set(nodeIds);
      nb.forEach(nid => {
        const secondHop = sim.neighbors.get(nid) || new Set();
        secondHop.forEach(x => twoHop.add(x));
      });
      return { nodeIds: twoHop, edgeKeys: null };
    }
    return { nodeIds, edgeKeys: null };
  }, [selectedProject, hoverPersonId, activePersonId, tick === 0, connectionMode, connectBy, projects]);

  // Interaction: pan via canvas drag
  const onMouseDown = (e) => {
    if (e.target.closest('.node')) return;
    panRef.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      origX: transform.x, origY: transform.y,
    };
  };
  const onMouseMove = (e) => {
    if (dragRef.current.node) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left - viewSize.w / 2 - transform.x) / transform.k;
      const cy = (e.clientY - rect.top - viewSize.h / 2 - transform.y) / transform.k;
      const n = dragRef.current.node;
      n.x = cx - dragRef.current.offsetX;
      n.y = cy - dragRef.current.offsetY;
      n.vx = 0; n.vy = 0;
      return;
    }
    if (!panRef.current.active) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setTransform(t => ({ ...t, x: panRef.current.origX + dx, y: panRef.current.origY + dy }));
  };
  const onMouseUp = () => {
    if (dragRef.current.node) {
      dragRef.current.node.pinned = false;
      dragRef.current.node = null;
    }
    panRef.current.active = false;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left - viewSize.w / 2;
    const my = e.clientY - rect.top - viewSize.h / 2;
    setTransform(t => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nk = Math.max(0.25, Math.min(2.5, t.k * factor));
      const f = nk / t.k;
      return {
        k: nk,
        x: mx - (mx - t.x) * f,
        y: my - (my - t.y) * f,
      };
    });
  };
  uE(() => {
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [viewSize, transform]);

  // Touch: single-finger pan + two-finger pinch zoom
  const touchRef = uR({ mode: null, startX: 0, startY: 0, origX: 0, origY: 0, origK: 1, startDist: 0, startMidX: 0, startMidY: 0 });
  uE(() => {
    const node = containerRef.current;
    if (!node) return;
    const onTouchStart = (e) => {
      if (e.target.closest('.node')) return;
      const rect = node.getBoundingClientRect();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, origX: transform.x, origY: transform.y };
      } else if (e.touches.length === 2) {
        const [a, b] = e.touches;
        const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
        const dist = Math.hypot(dx, dy);
        const mx = (a.clientX + b.clientX) / 2 - rect.left - viewSize.w / 2;
        const my = (a.clientY + b.clientY) / 2 - rect.top - viewSize.h / 2;
        touchRef.current = { mode: 'pinch', startDist: dist, origK: transform.k, origX: transform.x, origY: transform.y, startMidX: mx, startMidY: my };
        e.preventDefault();
      }
    };
    const onTouchMove = (e) => {
      const tr = touchRef.current;
      if (tr.mode === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - tr.startX;
        const dy = t.clientY - tr.startY;
        setTransform(curr => ({ ...curr, x: tr.origX + dx, y: tr.origY + dy }));
        e.preventDefault();
      } else if (tr.mode === 'pinch' && e.touches.length === 2) {
        const [a, b] = e.touches;
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const factor = dist / tr.startDist;
        const nk = Math.max(0.18, Math.min(2.5, tr.origK * factor));
        const f = nk / tr.origK;
        setTransform({
          k: nk,
          x: tr.startMidX - (tr.startMidX - tr.origX) * f,
          y: tr.startMidY - (tr.startMidY - tr.origY) * f,
        });
        e.preventDefault();
      }
    };
    const onTouchEnd = () => { touchRef.current.mode = null; };
    node.addEventListener('touchstart', onTouchStart, { passive: false });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [viewSize, transform]);

  // Expose zoom controls
  uE(() => {
    window.__resetView = () => setTransform({ x: 0, y: 0, k: 1 });
    window.__zoomIn = () => setTransform(t => ({ ...t, k: Math.min(2.5, t.k * 1.2) }));
    window.__zoomOut = () => setTransform(t => ({ ...t, k: Math.max(0.25, t.k / 1.2) }));
  }, []);

  const sim = simRef.current;
  if (!sim) return <div ref={containerRef} className="canvas-wrap" />;

  // Drag handler for nodes
  const startNodeDrag = (e, node) => {
    e.stopPropagation();
    node.pinned = true;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left - viewSize.w / 2 - transform.x) / transform.k;
    const cy = (e.clientY - rect.top - viewSize.h / 2 - transform.y) / transform.k;
    dragRef.current = {
      node,
      offsetX: cx - node.x,
      offsetY: cy - node.y,
    };
  };

  // Render SVG with transform
  return (
    <div
      ref={containerRef}
      className="canvas-wrap"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <svg width={viewSize.w} height={viewSize.h} style={{ position: 'absolute', inset: 0, cursor: 'grab', display: 'block' }}>
        <g transform={`translate(${viewSize.w/2 + transform.x}, ${viewSize.h/2 + transform.y}) scale(${transform.k})`}>
          {/* Group anchor labels */}
          {groupAnchorsFn && groupAnchorsFn.keys.map(k => {
            const a = groupAnchorsFn.anchors.get(k);
            if (!a) return null;
            return (
              <text key={'anc-'+k} x={a.x} y={a.y - 130}
                textAnchor="middle"
                fontFamily="'Fraunces', serif"
                fontSize={22}
                fontStyle="italic"
                fill="rgba(26,20,9,0.5)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >{k}</text>
            );
          })}
          {/* Project ↔ Author edges (default) */}
          {connectionMode === 'project-author' && sim.edges.map((e, i) => {
            const a = e.source, b = e.target;
            if (a.type === 'project' && !visibility.visibleProjectIds.has(a.ref.id)) return null;
            if (b.type === 'project' && !visibility.visibleProjectIds.has(b.ref.id)) return null;
            // Hide person-incident edges when students are hidden
            if (!showStudents && (a.type === 'person' || b.type === 'person')) return null;
            const hl = highlight.nodeIds;
            const isActive = hl && hl.has(a.id) && hl.has(b.id);
            const anyHl = !!hl;
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isActive ? '#b84a1f' : '#6b6459'}
                strokeWidth={isActive ? 1.2 : 0.5}
                strokeOpacity={isActive ? 0.9 : (anyHl ? 0.08 : 0.35)}
                style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
              />
            );
          })}

          {/* Project-to-project edges (shared author / area / weak signal) */}
          {connectionMode === 'project-project' && (() => {
            const lines = [];
            const projNodes = sim.nodes.filter(n => n.type === 'project' && visibility.visibleProjectIds.has(n.ref.id));
            const byId = new Map(projNodes.map(n => [n.ref.id, n]));
            const seen = new Set();
            // Choose which field counts as a "connection"
            const fieldKey = connectBy === 'area' ? 'areas'
                           : connectBy === 'weakSignal' ? 'weakSignals'
                           : 'authors';
            for (const a of projNodes) {
              for (const b of projNodes) {
                if (a.ref.id >= b.ref.id) continue;
                const aSet = a.ref[fieldKey] || [];
                const bSet = b.ref[fieldKey] || [];
                if (!aSet.length || !bSet.length) continue;
                const shared = aSet.filter(x => bSet.includes(x));
                if (!shared.length) continue;
                const key = a.ref.id + '|' + b.ref.id;
                if (seen.has(key)) continue;
                seen.add(key);
                const hl = highlight.nodeIds;
                const aId = 'proj:' + a.ref.id, bId = 'proj:' + b.ref.id;
                const isActive = hl && !highlight.soft && hl.has(aId) && hl.has(bId);
                const anyHl = !!hl && !highlight.soft;
                // Thickness scales with number of shared items (capped)
                const weight = Math.min(shared.length, 5);
                const baseWidth = 0.45 + (weight - 1) * 0.45; // 0.45 .. 2.25
                const baseOpacity = 0.25 + Math.min(weight, 4) * 0.07; // 0.32 .. 0.53
                // Curved path (gentle arc)
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const off = Math.min(60, len * 0.12);
                const cx = mx + (-dy / len) * off;
                const cy = my + (dx / len) * off;
                lines.push(
                  <path key={key}
                    d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={isActive ? '#b84a1f' : '#6b6459'}
                    strokeWidth={isActive ? baseWidth + 0.8 : baseWidth}
                    strokeOpacity={isActive ? 0.9 : (anyHl ? 0.06 : baseOpacity)}
                    style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
                  >
                    <title>{shared.length} shared {connectBy === 'area' ? 'area' : connectBy === 'weakSignal' ? 'weak signal' : 'author'}{shared.length !== 1 ? 's' : ''}: {shared.join(', ')}</title>
                  </path>
                );
              }
            }
            return lines;
          })()}

          {/* Student ↔ Student edges (co-authors of a project) */}
          {connectionMode === 'student-student' && (() => {
            const lines = [];
            const personNodes = sim.nodes.filter(n => n.type === 'person' && visibility.visiblePersonIds.has(n.ref.id));
            const byId = new Map(personNodes.map(n => [n.ref.id, n]));
            const seen = new Set();
            for (const proj of projects) {
              if (!visibility.visibleProjectIds.has(proj.id)) continue;
              const auths = (proj.authors || []).filter(aid => visibility.visiblePersonIds.has(aid));
              for (let i = 0; i < auths.length; i++) {
                for (let j = i + 1; j < auths.length; j++) {
                  const a = byId.get(auths[i]);
                  const b = byId.get(auths[j]);
                  if (!a || !b) continue;
                  const key = a.ref.id < b.ref.id ? a.ref.id + '|' + b.ref.id : b.ref.id + '|' + a.ref.id;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  const hl = highlight.nodeIds;
                  const isActive = hl && hl.has(a.id) && hl.has(b.id);
                  const anyHl = !!hl;
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2;
                  const dx = b.x - a.x, dy = b.y - a.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const off = Math.min(60, len * 0.12);
                  const cx = mx + (-dy / len) * off;
                  const cy = my + (dx / len) * off;
                  lines.push(
                    <path key={key}
                      d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={isActive ? '#b84a1f' : '#6b6459'}
                      strokeWidth={isActive ? 1.4 : 0.6}
                      strokeOpacity={isActive ? 0.9 : (anyHl ? 0.06 : 0.4)}
                      style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
                    />
                  );
                }
              }
            }
            return lines;
          })()}

          {/* Nodes */}
          {sim.nodes.map(n => {
            if (n.type === 'project' && (!showProjects || !visibility.visibleProjectIds.has(n.ref.id))) return null;
            if (n.type === 'person' && (!showStudents || !visibility.visiblePersonIds.has(n.ref.id))) return null;

            const hl = highlight.nodeIds;
            const inHl = !hl || hl.has(n.id);
            const anyHl = !!hl;
            const isFocus = selectedProject && n.id === 'proj:' + selectedProject.id;
            const isActivePerson = activePersonId && n.id === 'pers:' + activePersonId;

            if (n.type === 'project') {
              const cluster = clusters[n.ref.cluster];
              const isCollab = n.ref.authors && n.ref.authors.length > 1;
              const W = (isFocus ? 96 : (isCollab ? 64 : 54)) * nodeScale;
              const H = Math.round(W * 0.7);
              const hasPhoto = !!n.ref.photo;
              // Cull: only render image if node is on screen
              const screenX = viewSize.w/2 + transform.x + n.x * transform.k;
              const screenY = viewSize.h/2 + transform.y + n.y * transform.k;
              const margin = 200;
              const onScreen =
                screenX > -margin && screenX < viewSize.w + margin &&
                screenY > -margin && screenY < viewSize.h + margin;
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}
                   className="node"
                   style={{
                     cursor: 'pointer',
                     opacity: inHl ? 1 : 0.28,
                     transition: 'opacity 0.2s',
                   }}
                   onMouseDown={(e) => startNodeDrag(e, n)}
                   onClick={(e) => { e.stopPropagation(); setSelectedProject(n.ref); }}
                >
                  {hasPhoto && onScreen ? (
                    <image
                      href={n.ref.photo}
                      x={-W/2} y={-H/2}
                      width={W} height={H}
                      preserveAspectRatio="xMidYMid meet"
                      style={{ pointerEvents: 'auto' }}
                    />
                  ) : (
                    <>
                      <rect x={-W/2} y={-H/2} width={W} height={H} fill="#f5efe1" />
                      <text
                        x="0" y="5"
                        textAnchor="middle"
                        fontFamily="'Fraunces', serif"
                        fontSize={isFocus ? 22 : 16}
                        fontStyle="italic"
                        fill={cluster?.color || '#444'}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {n.ref.title.split(' ').filter(w => /^[A-Z]/.test(w)).slice(0,2).map(w => w[0]).join('') || n.ref.title.slice(0,2).toUpperCase()}
                      </text>
                    </>
                  )}
                  {isFocus && (
                    <rect x={-W/2} y={-H/2} width={W} height={H}
                      fill="none" stroke="#1a1409" strokeWidth={2} />
                  )}
                </g>
              );
            }

            // Person node
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}
                 className="node"
                 style={{
                   cursor: 'pointer',
                   opacity: inHl ? 1 : 0.18,
                   transition: 'opacity 0.2s',
                 }}
                 onMouseDown={(e) => startNodeDrag(e, n)}
                 onMouseEnter={() => setHoverPersonId(n.ref.id)}
                 onMouseLeave={() => setHoverPersonId(null)}
                 onClick={(e) => {
                   e.stopPropagation();
                   setSelectedPerson(n.ref);
                 }}
              >
                <circle
                  r={isActivePerson ? 10 : 5}
                  fill={isActivePerson ? '#b84a1f' : '#1a1409'}
                  stroke="#f6f2e8"
                  strokeWidth={1.5}
                />
                {(isActivePerson || (hoverPersonId === n.ref.id) || transform.k > 1.3 || (anyHl && inHl && transform.k > 0.7)) && (
                  <text
                    x="0" y={isActivePerson ? 22 : 16}
                    textAnchor="middle"
                    fontFamily="'Fraunces', serif"
                    fontStyle="italic"
                    fontSize={isActivePerson ? 13 : 10}
                    fontWeight={isActivePerson ? 500 : 400}
                    fill="#1a1409"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {n.ref.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

Object.assign(window, { Graph });
