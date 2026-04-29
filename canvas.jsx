// Canvas con pan/zoom, tarjetas de proyecto y curvas de conexión
// Expone: window.Canvas, window.ProjectCard, window.ConnectionLayer

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Placeholder de imagen "rayada" — evitamos SVGs complicados
function ImagePlaceholder({ cluster, seed, clusters, photo }) {
  const color = clusters[cluster]?.color || '#ccc';
  const stripeId = `s${seed}`;
  const [photoFailed, setPhotoFailed] = React.useState(false);

  if (photo && !photoFailed) {
    return (
      <div style={{ position: 'relative', width: '100%', height: 110, overflow: 'hidden', background: '#ece7dd' }}>
        <img
          src={photo}
          alt=""
          onError={() => setPhotoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: color, opacity: 0.9 }} />
      </div>
    );
  }
  return (
    <svg viewBox="0 0 220 110" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: 110, display: 'block' }}>
      <defs>
        <pattern id={stripeId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ece7dd" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#d8d2c3" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="220" height="110" fill={`url(#${stripeId})`} />
      <rect x="0" y="0" width="4" height="110" fill={color} opacity="0.9" />
    </svg>
  );
}

function ProjectCard({ project, people, clusters, pos, onClick, onHoverPerson, hoverPersonId, dimmed, highlighted }) {
  const authors = project.authors.map(aid => people.find(p => p.id === aid)).filter(Boolean);
  const cluster = clusters[project.cluster];

  const style = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: pos.w,
    height: pos.h,
    opacity: dimmed ? 0.22 : 1,
    transition: 'opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
    transform: highlighted ? 'translateY(-3px)' : 'none',
    boxShadow: highlighted
      ? '0 10px 30px -12px rgba(24,18,10,0.35), 0 0 0 1px rgba(24,18,10,0.18)'
      : '0 1px 0 rgba(24,18,10,0.08), 0 0 0 1px rgba(24,18,10,0.08)',
  };

  return (
    <div
      className="proj-card"
      style={style}
      onClick={() => onClick(project)}
    >
      <ImagePlaceholder cluster={project.cluster} seed={project.id} clusters={clusters} photo={project.photo} />
      <div className="proj-card-body">
        <div className="proj-cluster-pill" style={{ color: cluster.color }}>
          <span className="dot" style={{ background: cluster.color }} />
          {cluster.name}
        </div>
        <div className="proj-title">{project.title}</div>
        <div className="proj-authors">
          {authors.map((a, i) => (
            <span
              key={a.id}
              className={'author-chip' + (hoverPersonId === a.id ? ' active' : '')}
              onMouseEnter={(e) => { e.stopPropagation(); onHoverPerson(a.id); }}
              onMouseLeave={(e) => { e.stopPropagation(); onHoverPerson(null); }}
              onClick={(e) => { e.stopPropagation(); onHoverPerson(a.id, true); }}
            >
              {a.name}
            </span>
          ))}
        </div>
        <div className="proj-year">{project.year}</div>
      </div>
    </div>
  );
}

function ConnectionLayer({ connections, positions, people, hoverPersonId, activePersonId, clusters, projects }) {
  // dibuja curvas Bézier entre el centro-borde de cada tarjeta
  if (!connections.length) return null;

  // agrupar conexiones por persona
  const paths = connections.map((c, i) => {
    const a = positions[c.from];
    const b = positions[c.to];
    if (!a || !b) return null;
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h;
    const bx = b.x + b.w / 2;
    const by = b.y;
    const midY = (ay + by) / 2;
    const person = people.find(p => p.id === c.person);
    const proj = projects.find(p => p.id === c.from);
    const clusterColor = clusters[proj.cluster]?.color || '#333';

    const active = hoverPersonId === c.person || activePersonId === c.person;
    const anyActive = hoverPersonId || activePersonId;

    // etiqueta en la mitad
    const labelX = (ax + bx) / 2;
    const labelY = midY;
    // ángulo del segmento para orientar el texto
    const dx = bx - ax, dy = by - ay;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const d = `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`;

    return (
      <g key={i} style={{
        opacity: active ? 1 : (anyActive ? 0.06 : 0.55),
        transition: 'opacity 0.2s ease',
      }}>
        <path
          d={d}
          fill="none"
          stroke={active ? clusterColor : '#6b6459'}
          strokeWidth={active ? 1.5 : 0.7}
          strokeLinecap="round"
        />
        <g transform={`translate(${labelX}, ${labelY}) rotate(${Math.abs(angle) < 90 ? 0 : 0})`}>
          <rect
            x={-Math.max(40, person.name.length * 3.2)}
            y={-7}
            width={Math.max(80, person.name.length * 6.4)}
            height={14}
            fill="#f6f2e8"
            opacity={active ? 0.98 : 0.85}
            rx="2"
          />
          <text
            x="0"
            y="3"
            textAnchor="middle"
            fontFamily="'Fraunces', serif"
            fontStyle="italic"
            fontSize={active ? 12 : 10}
            fontWeight={active ? 500 : 400}
            fill={active ? '#1a1409' : '#3b342a'}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {person.name}
          </text>
        </g>
      </g>
    );
  });

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {paths}
    </svg>
  );
}

function YearMarkers({ yearBands, mcBlocks, clusters, boundsW }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {yearBands.map((b) => (
        <React.Fragment key={b.year}>
          <div style={{
            position: 'absolute',
            left: -200,
            top: b.y + b.h / 2 - 50,
            fontFamily: "'Fraunces', serif",
            fontSize: 84,
            fontWeight: 300,
            color: '#1a1409',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}>
            {b.year}
            <div style={{
              fontFamily: "'Söhne', 'Helvetica Neue', sans-serif",
              fontSize: 11,
              letterSpacing: '0.14em',
              color: '#6b6459',
              marginTop: 6,
              textTransform: 'uppercase',
            }}>
              Cohort
            </div>
          </div>
          <div style={{
            position: 'absolute',
            left: 0,
            top: b.y - 40,
            width: boundsW,
            borderTop: '1px dashed rgba(26,20,9,0.18)',
          }} />
        </React.Fragment>
      ))}
      {mcBlocks.map((m) => {
        const c = clusters[m.mc];
        return (
          <div key={`${m.year}-${m.mc}`} style={{
            position: 'absolute',
            left: m.x,
            top: m.y - 30,
            fontFamily: "'Söhne', 'Helvetica Neue', sans-serif",
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: c?.color || '#6b6459',
            fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c?.color }}></span>
            {c?.name || m.mc} · {m.count}
          </div>
        );
      })}
    </div>
  );
}

function Canvas({ projects, people, clusters, layout, filters, onSelect, hoverPersonId, setHoverPersonId, activePersonId, setActivePersonId, searchQuery }) {
  const [transform, setTransform] = useState({ x: 200, y: 60, k: 0.4 });
  const containerRef = useRef(null);
  const panRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Filtrado: IDs visibles
  const visibleProjectIds = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    return new Set(projects.filter(p => {
      if (filters.years.size > 0 && !filters.years.has(p.year)) return false;
      if (filters.clusters.size > 0 && !filters.clusters.has(p.cluster)) return false;
      if (q) {
        const authors = p.authors.map(aid => people.find(pp => pp.id === aid)?.name.toLowerCase() || '').join(' ');
        const hay = `${p.title} ${p.summary} ${p.tags.join(' ')} ${authors}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).map(p => p.id));
  }, [projects, people, filters, searchQuery]);

  // Highlight de persona activa
  const activePerson = hoverPersonId || activePersonId;
  const highlightProjectIds = useMemo(() => {
    if (!activePerson) return null;
    return new Set(projects.filter(p => p.authors.includes(activePerson)).map(p => p.id));
  }, [projects, activePerson]);

  // Pan
  const onMouseDown = (e) => {
    if (e.target.closest('.proj-card') || e.target.closest('.author-chip')) return;
    panRef.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      origX: transform.x, origY: transform.y,
    };
  };
  const onMouseMove = (e) => {
    if (!panRef.current.active) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setTransform(t => ({ ...t, x: panRef.current.origX + dx, y: panRef.current.origY + dy }));
  };
  const onMouseUp = () => { panRef.current.active = false; };
  // Zoom con wheel
  const onWheel = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    setTransform(t => {
      const nk = Math.max(0.12, Math.min(1.8, t.k * (1 + delta)));
      const factor = nk / t.k;
      return {
        k: nk,
        x: mx - (mx - t.x) * factor,
        y: my - (my - t.y) * factor,
      };
    });
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handler = (e) => onWheel(e);
    node.addEventListener('wheel', handler, { passive: false });
    return () => node.removeEventListener('wheel', handler);
  }, [transform]);

  // center on load — fit entire canvas width
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padX = 260;
    const fitK = Math.min(0.55, (rect.width - padX) / layout.bounds.w);
    setTransform({ x: padX, y: 180, k: Math.max(0.15, fitK) });
  }, [layout.bounds.w]);

  const resetView = () => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padX = 260;
    const fitK = Math.min(0.55, (rect.width - padX) / layout.bounds.w);
    setTransform({ x: padX, y: 180, k: Math.max(0.15, fitK) });
  };

  // Exponer para botones externos
  useEffect(() => {
    window.__resetView = resetView;
    window.__zoomIn = () => setTransform(t => ({ ...t, k: Math.min(1.8, t.k * 1.2) }));
    window.__zoomOut = () => setTransform(t => ({ ...t, k: Math.max(0.12, t.k / 1.2) }));
  }, []);

  // Visibility of connections
  const visibleConnections = layout.connections.filter(c =>
    visibleProjectIds.has(c.from) && visibleProjectIds.has(c.to)
  );

  return (
    <div
      ref={containerRef}
      className="canvas-wrap"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="canvas-inner"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          transformOrigin: '0 0',
          width: layout.bounds.w,
          height: layout.bounds.h,
        }}
      >
        <YearMarkers yearBands={layout.yearBands} mcBlocks={layout.mcBlocks} clusters={clusters} boundsW={layout.bounds.w} />
        <ConnectionLayer
          connections={visibleConnections}
          positions={layout.positioned}
          people={people}
          clusters={clusters}
          projects={projects}
          hoverPersonId={hoverPersonId}
          activePersonId={activePersonId}
        />
        {projects.map(p => {
          const pos = layout.positioned[p.id];
          if (!pos) return null;
          const isVisible = visibleProjectIds.has(p.id);
          const isHighlight = highlightProjectIds && highlightProjectIds.has(p.id);
          return (
            <ProjectCard
              key={p.id}
              project={p}
              people={people}
              clusters={clusters}
              pos={pos}
              onClick={onSelect}
              onHoverPerson={(id, click) => {
                if (click) {
                  setActivePersonId(activePersonId === id ? null : id);
                } else {
                  setHoverPersonId(id);
                }
              }}
              hoverPersonId={hoverPersonId || activePersonId}
              dimmed={!isVisible || (highlightProjectIds && !isHighlight)}
              highlighted={isHighlight}
            />
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Canvas, ProjectCard, ConnectionLayer });
