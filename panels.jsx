// Panel de detalle lateral + toolbar (filtros, búsqueda, leyenda)
const { useState: useStateUI, useEffect: useEffectUI } = React;

function DetailPanel({ project, people, projects, clusters, onClose, onSelect, onHoverPerson }) {
  if (!project) return null;
  const authors = project.authors.map(aid => people.find(p => p.id === aid)).filter(Boolean);
  const cluster = clusters[project.cluster];

  // proyectos relacionados: cualquier otro proyecto que comparta al menos un autor
  const related = projects.filter(p => p.id !== project.id &&
    p.authors.some(a => project.authors.includes(a))
  );

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <button className="btn-close" onClick={onClose}>×</button>
        <div className="detail-year">{project.year}</div>
      </div>
      <div className="detail-cluster" style={{ color: cluster.color }}>
        <span className="dot" style={{ background: cluster.color }} />
        {cluster.name}
      </div>
      <h2 className="detail-title">{project.title}</h2>
      {project.photo && (
        <div className="detail-photo">
          <img src={project.photo} alt={project.title} loading="lazy" />
        </div>
      )}
      <p className="detail-summary">{project.summary}</p>

      {project.link && (
        <a className="detail-repo" href={project.link} target="_blank" rel="noopener noreferrer">
          View repository →
        </a>
      )}

      <div className="detail-section">
        <div className="detail-label">By</div>
        <div className="detail-authors">
          {authors.map(a => (
            <div key={a.id} className="detail-author"
              onMouseEnter={() => onHoverPerson(a.id)}
              onMouseLeave={() => onHoverPerson(null)}
              onClick={() => onHoverPerson(a.id, true)}>
              <div className="author-avatar">{a.name.split(' ').map(n => n[0]).slice(0,2).join('')}</div>
              <div>
                <div className="author-name">{a.name}</div>
                <div className="author-bio">{a.bio}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(project.areas?.length || project.weakSignals?.length || project.knowledge?.length) && (
        <div className="detail-section">
          {project.areas?.length > 0 && (
            <>
              <div className="detail-label">Areas</div>
              <div className="detail-tags">
                {project.areas.map(t => <span key={'a-'+t} className="tag tag-area">{t}</span>)}
              </div>
            </>
          )}
          {project.weakSignals?.length > 0 && (
            <>
              <div className="detail-label" style={{ marginTop: 12 }}>Weak signals</div>
              <div className="detail-tags">
                {project.weakSignals.map(t => <span key={'w-'+t} className="tag tag-weak">{t}</span>)}
              </div>
            </>
          )}
          {project.knowledge?.length > 0 && (
            <>
              <div className="detail-label" style={{ marginTop: 12 }}>Knowledge</div>
              <div className="detail-tags">
                {project.knowledge.map(t => <span key={'k-'+t} className="tag tag-knowledge">{t}</span>)}
              </div>
            </>
          )}
        </div>
      )}

      {related.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">Connected projects ({related.length})</div>
          <div className="detail-related">
            {related.map(r => {
              const rc = clusters[r.cluster];
              const shared = r.authors.filter(a => project.authors.includes(a))
                .map(aid => people.find(p => p.id === aid)?.name).filter(Boolean);
              return (
                <div key={r.id} className="related-item" onClick={() => onSelect(r)}>
                  <div className="related-title">{r.title}</div>
                  <div className="related-meta">
                    <span style={{ color: rc.color }}>● {rc.name}</span>
                    <span>{r.year}</span>
                  </div>
                  <div className="related-shared">via {shared.join(', ')}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TagDropdown({ label, options, selected, onToggle, color = '#1a1409' }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const count = selected.size;
  return (
    <div className="tag-dd" ref={ref}>
      <button className={'chip' + (count > 0 ? ' on' : '')} onClick={() => setOpen(o => !o)}>
        {label}{count > 0 ? ` · ${count}` : ''}
        <span style={{ marginLeft: 6, opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div className="tag-dd-pop">
          <input
            className="tag-dd-search"
            placeholder={`Filter ${label.toLowerCase()}…`}
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          <div className="tag-dd-list">
            {filtered.map(o => (
              <label key={o.value} className="tag-dd-row">
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => onToggle(o.value)}
                />
                <span className="tag-dd-label">{o.label}</span>
                <span className="tag-dd-count">{o.count}</span>
              </label>
            ))}
            {!filtered.length && <div className="tag-dd-empty">No matches</div>}
          </div>
          {count > 0 && (
            <button className="tag-dd-clear" onClick={() => [...selected].forEach(onToggle)}>
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Toolbar({ projects, people, clusters, filters, setFilters, searchQuery, setSearchQuery, stats, groupMode, setGroupMode, viewMode, setViewMode }) {
  const allYears = [...new Set(projects.map(p => p.year))].sort((a, b) => b - a);
  const clusterKeys = Object.keys(clusters);

  const areaOptions = React.useMemo(() => {
    const m = new Map();
    projects.forEach(p => (p.areas || []).forEach(a => m.set(a, (m.get(a) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1])
      .map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [projects]);

  const weakOptions = React.useMemo(() => {
    const m = new Map();
    projects.forEach(p => (p.weakSignals || []).forEach(a => m.set(a, (m.get(a) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1])
      .map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [projects]);

  const toggleSet = (key, val) => {
    setFilters(f => {
      const cur = new Set(f[key] || []);
      if (cur.has(val)) cur.delete(val); else cur.add(val);
      return { ...f, [key]: cur };
    });
  };

  const toggleYear = (y) => {
    setFilters(f => {
      const next = new Set(f.years);
      if (next.has(y)) next.delete(y); else next.add(y);
      return { ...f, years: next };
    });
  };
  const toggleCluster = (c) => {
    setFilters(f => {
      const next = new Set(f.clusters);
      if (next.has(c)) next.delete(c); else next.add(c);
      return { ...f, clusters: next };
    });
  };

  return (
    <div className="toolbar">
      <div className="tb-left">
        <div className="brand">
          <div className="brand-mark">◉</div>
          <div>
            <div className="brand-title">MDEF Archive</div>
            <div className="brand-sub">Master in Design for Emergent Futures · {stats.years} years, {stats.projects} projects, {stats.people} people</div>
          </div>
        </div>
      </div>

      <div className="tb-center">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.45 }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search project, person, tag…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && <button className="x" onClick={() => setSearchQuery('')}>×</button>}
        </div>
      </div>

      <div className="tb-right">
        <div className="zoom-group">
          <button onClick={() => window.__zoomOut?.()}>−</button>
          <button onClick={() => window.__resetView?.()}>Fit</button>
          <button onClick={() => window.__zoomIn?.()}>+</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <div className="filter-label">Year</div>
          {allYears.map(y => {
            const active = filters.years.has(y);
            return (
              <button
                key={y}
                className={'chip' + (active ? ' on' : '')}
                onClick={() => toggleYear(y)}
              >
                {y}
              </button>
            );
          })}
        </div>
        {(filters.clusters.size > 0 || filters.years.size > 0 || (filters.areas && filters.areas.size > 0) || (filters.weakSignals && filters.weakSignals.size > 0)) && (
          <button className="chip-clear" onClick={() => setFilters({ clusters: new Set(), years: new Set(), areas: new Set(), weakSignals: new Set() })}>
            Clear all
          </button>
        )}
        <div className="filter-group">
          <div className="filter-label">Areas</div>
          <TagDropdown
            label="Area"
            options={areaOptions}
            selected={filters.areas || new Set()}
            onToggle={(v) => toggleSet('areas', v)}
          />
        </div>
        <div className="filter-group">
          <div className="filter-label">Weak signals</div>
          <TagDropdown
            label="Weak signal"
            options={weakOptions}
            selected={filters.weakSignals || new Set()}
            onToggle={(v) => toggleSet('weakSignals', v)}
          />
        </div>
        {setViewMode && (
          <div className="filter-group">
            <div className="filter-label">Show</div>
            {[
              { id: 'both', label: 'Both' },
              { id: 'projects', label: 'Projects' },
              { id: 'students', label: 'Students' },
            ].map(m => (
              <button key={m.id}
                className={'chip' + (viewMode === m.id ? ' on' : '')}
                onClick={() => setViewMode(m.id)}
              >{m.label}</button>
            ))}
          </div>
        )}
        {setGroupMode && (
          <div className="filter-group" style={{ marginLeft: 'auto' }}>
            <div className="filter-label">Cluster by</div>
            {[
              { id: 'year', label: 'Year' },
              { id: 'area', label: 'Area' },
              { id: 'photo', label: 'Photo' },
              { id: 'free', label: 'Free' },
            ].map(m => (
              <button key={m.id}
                className={'chip' + (groupMode === m.id ? ' on' : '')}
                onClick={() => setGroupMode(m.id)}
              >{m.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Hints({ activePersonId, hoverPersonId, people, onClearActive }) {
  const person = activePersonId ? people.find(p => p.id === activePersonId) : null;
  return (
    <div className="hints">
      {person ? (
        <div className="pinned-person">
          <span className="pin-dot" />
          <span>Following <strong>{person.name}</strong> across years</span>
          <button onClick={onClearActive}>unpin</button>
        </div>
      ) : (
        <div className="hint-text">
          Drag to pan · Scroll to zoom · Hover a name to trace a person · Click to pin
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DetailPanel, Toolbar, Hints });

function PersonProfile({ person, projects, people, clusters, onClose, onSelectProject, onSelectPerson }) {
  if (!person) return null;
  const myProjects = projects.filter(p => p.authors.includes(person.id));
  const collaboratorIds = new Set();
  myProjects.forEach(p => p.authors.forEach(a => { if (a !== person.id) collaboratorIds.add(a); }));
  const collaborators = [...collaboratorIds].map(id => people.find(p => p.id === id)).filter(Boolean);
  const tagSet = new Set();
  myProjects.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
  const tags = [...tagSet].slice(0, 12);
  const yearSpan = [...new Set(myProjects.map(p => p.year))].sort();

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <button className="btn-close" onClick={onClose}>×</button>
        <div className="detail-year">Student</div>
      </div>
      <div className="author-avatar" style={{ width: 64, height: 64, fontSize: 22, marginBottom: 16 }}>
        {person.name.split(' ').map(n => n[0]).slice(0,2).join('')}
      </div>
      <h2 className="detail-title">{person.name}</h2>
      <p className="detail-summary">
        {myProjects.length} project{myProjects.length !== 1 ? 's' : ''} · {yearSpan.join(' – ')} · {collaborators.length} collaborator{collaborators.length !== 1 ? 's' : ''}
      </p>
      {person.bio ? (
        <p className="detail-summary" style={{ fontStyle: 'italic', borderLeft: '2px solid var(--line)', paddingLeft: 14, marginTop: -8 }}>
          {person.bio}
        </p>
      ) : (
        <p className="detail-summary" style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', marginTop: -8 }}>
          No bio on file. Add a <code>bio</code> column in the source spreadsheet to populate this.
        </p>
      )}

      {tags.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">Themes worked on</div>
          <div className="detail-tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
        </div>
      )}

      <div className="detail-section">
        <div className="detail-label">Projects ({myProjects.length})</div>
        <div className="detail-related">
          {myProjects.map(r => {
            const rc = clusters[r.cluster];
            return (
              <div key={r.id} className="related-item" onClick={() => onSelectProject(r)}>
                <div className="related-title">{r.title}</div>
                <div className="related-meta">
                  <span style={{ color: rc.color }}>● {rc.name}</span>
                  <span>{r.year}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {collaborators.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">Collaborators ({collaborators.length})</div>
          <div className="detail-authors">
            {collaborators.map(c => (
              <div key={c.id} className="detail-author" onClick={() => onSelectPerson(c)}>
                <div className="author-avatar">{c.name.split(' ').map(n => n[0]).slice(0,2).join('')}</div>
                <div><div className="author-name">{c.name}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupModeSwitcher({ mode, setMode }) {
  const modes = [
    { id: 'year', label: 'Year' },
    { id: 'area', label: 'Area' },
    { id: 'photo', label: 'Photo' },
    { id: 'free', label: 'Free' },
  ];
  return (
    <div className="group-switch">
      <span className="filter-label">Cluster by</span>
      {modes.map(m => (
        <button key={m.id}
          className={'chip' + (mode === m.id ? ' on' : '')}
          onClick={() => setMode(m.id)}
        >{m.label}</button>
      ))}
    </div>
  );
}

Object.assign(window, { PersonProfile, GroupModeSwitcher });
