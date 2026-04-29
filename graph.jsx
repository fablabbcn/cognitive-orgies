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

  // Grouping pull — clusters projects toward "anchor" points based on chosen mode
  if (params.groupAnchors) {
    nodes.forEach(n => {
      if (n.pinned) return;
      if (n.type !== 'project') return;
      const anchor = params.groupAnchors(n.ref);
      if (!anchor) return;
      const pull = params.groupPull ?? 0.018;
      n.vx += (anchor.x - n.x) * pull;
      n.vy += (anchor.y - n.y) * pull;
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

    const fn = (proj) => {
      let k = projKey(proj);
      if (groupMode === 'area' && !anchors.has(k)) k = 'Other';
      return anchors.get(k);
    };
    fn.anchors = anchors;
    fn.keys = keys;
    return fn;
  }, [groupMode, projects]);

  // Animation loop — runs at ~30 fps when active, pauses when sim settles
  uE(() => {
    let running = true;
    let lastTick = 0;
    let settledFrames = 0;
    const loop = (ts) => {
      if (!running) return;
      const sim = simRef.current;
      if (sim) {
        const focusId = selectedProject ? 'proj:' + selectedProject.id : null;
        sim.nodes.forEach(n => {
          if (focusId !== n.id) n.pinned = false;
        });
        const ke = stepSimulation(sim, {
          focusId,
          linkDistance: focusId ? 120 : 95,
          groupAnchors: groupAnchorsFn,
          groupPull: focusId ? 0.005 : 0.022,
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
    return { visibleProjectIds };
  }, [projects, people, filters, searchQuery]);

  // Compute highlight from hover/pinned person or selected project
  const highlight = uM(() => {
    const sim = simRef.current;
    if (!sim) return { nodeIds: null, edgeKeys: null };
    const focusNodeId = selectedProject ? 'proj:' + selectedProject.id : null;
    const personId = hoverPersonId || activePersonId;
    const personNodeId = personId ? 'pers:' + personId : null;
    const sourceId = personNodeId || focusNodeId;
    if (!sourceId) return { nodeIds: null, edgeKeys: null };
    const nb = sim.neighbors.get(sourceId) || new Set();
    const nodeIds = new Set([sourceId, ...nb]);
    // include 2-hop for project focus
    if (focusNodeId && !personNodeId) {
      const twoHop = new Set(nodeIds);
      nb.forEach(nid => {
        const secondHop = sim.neighbors.get(nid) || new Set();
        secondHop.forEach(x => twoHop.add(x));
      });
      return { nodeIds: twoHop, edgeKeys: null };
    }
    return { nodeIds, edgeKeys: null };
  }, [selectedProject, hoverPersonId, activePersonId, tick === 0]);

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

          {/* Project-to-project edges (shared author) */}
          {connectionMode === 'project-project' && (() => {
            const lines = [];
            const projNodes = sim.nodes.filter(n => n.type === 'project' && visibility.visibleProjectIds.has(n.ref.id));
            const byId = new Map(projNodes.map(n => [n.ref.id, n]));
            const seen = new Set();
            for (const a of projNodes) {
              for (const b of projNodes) {
                if (a.ref.id >= b.ref.id) continue;
                const shared = a.ref.authors.filter(x => b.ref.authors.includes(x));
                if (!shared.length) continue;
                const key = a.ref.id + '|' + b.ref.id;
                if (seen.has(key)) continue;
                seen.add(key);
                const hl = highlight.nodeIds;
                const aId = 'proj:' + a.ref.id, bId = 'proj:' + b.ref.id;
                const isActive = hl && hl.has(aId) && hl.has(bId);
                const anyHl = !!hl;
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
                    strokeWidth={isActive ? 1.4 : 0.6}
                    strokeOpacity={isActive ? 0.9 : (anyHl ? 0.06 : 0.4)}
                    style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
                  />
                );
              }
            }
            return lines;
          })()}

          {/* Student ↔ Student edges (co-authors of a project) */}
          {connectionMode === 'student-student' && (() => {
            const lines = [];
            const personNodes = sim.nodes.filter(n => n.type === 'person');
            const byId = new Map(personNodes.map(n => [n.ref.id, n]));
            const seen = new Set();
            for (const proj of projects) {
              if (!visibility.visibleProjectIds.has(proj.id)) continue;
              const auths = proj.authors || [];
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
            if (n.type === 'person' && !showStudents) return null;

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
