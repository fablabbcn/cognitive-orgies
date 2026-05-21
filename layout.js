// Layout: cada año es una banda horizontal, dentro de la banda los proyectos
// se agrupan en 4 sub-filas (MC1, MC2, MC3, MC4). Esto da una matriz:
//   columna = tiempo secuencial del año (MC1 → MC4 más tarde en el curso)
//   fila = año
// Dentro de cada (año, MC) envolvemos en varias filas si hay muchos proyectos.

window.MDEF_LAYOUT = (function () {
  const CARD_W = 220;
  const CARD_H = 240;
  const COL_GAP = 36;       // separación horizontal entre tarjetas
  const ROW_GAP = 44;       // separación vertical entre tarjetas dentro de un MC
  const MC_GAP = 80;        // separación entre bloques MC dentro de un mismo año
  const YEAR_GAP = 160;     // separación entre años
  const MAX_PER_ROW = 6;    // tarjetas por fila dentro de un bloque MC
  const JITTER = 18;

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function computeLayout(projects, people) {
    // Agrupar por año
    const byYear = {};
    projects.forEach(p => {
      if (!byYear[p.year]) byYear[p.year] = [];
      byYear[p.year].push(p);
    });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a); // 2024 arriba

    const positioned = {};
    const yearBands = [];   // { year, y, h }
    const mcBlocks = [];    // { year, mc, x, y, w, h, count }

    let cursorY = 0;

    years.forEach(year => {
      const yearProjects = byYear[year];
      // Agrupar por cluster MC1..MC4
      const byMc = { MC1: [], MC2: [], MC3: [], MC4: [] };
      yearProjects.forEach(p => {
        if (byMc[p.cluster]) byMc[p.cluster].push(p);
        else byMc.MC1.push(p);
      });
      // ordenar alfabéticamente dentro de cada MC
      Object.values(byMc).forEach(arr => arr.sort((a, b) => a.title.localeCompare(b.title)));

      let bandStartY = cursorY;
      let cursorX = 0;

      ['MC1', 'MC2', 'MC3', 'MC4'].forEach((mc, mcIdx) => {
        const list = byMc[mc];
        const rows = Math.max(1, Math.ceil(list.length / MAX_PER_ROW));
        const blockW = MAX_PER_ROW * (CARD_W + COL_GAP) - COL_GAP;
        const blockH = rows * (CARD_H + ROW_GAP) - ROW_GAP;

        list.forEach((proj, i) => {
          const r = Math.floor(i / MAX_PER_ROW);
          const c = i % MAX_PER_ROW;
          const jitterY = ((hash(proj.id) % 1000) / 1000 - 0.5) * JITTER * 2;
          const jitterX = ((hash(proj.id + 'x') % 1000) / 1000 - 0.5) * JITTER;
          positioned[proj.id] = {
            x: cursorX + c * (CARD_W + COL_GAP) + jitterX,
            y: bandStartY + r * (CARD_H + ROW_GAP) + jitterY,
            w: CARD_W,
            h: CARD_H,
            year,
            mc,
          };
        });

        mcBlocks.push({
          year, mc,
          x: cursorX,
          y: bandStartY,
          w: blockW,
          h: blockH,
          count: list.length,
        });

        cursorX += blockW + MC_GAP;
      });

      // Calcular altura real de la banda (máximo entre los 4 MC)
      const bandH = Math.max(
        ...['MC1','MC2','MC3','MC4'].map(mc => {
          const cnt = byMc[mc].length;
          const rows = Math.max(1, Math.ceil(cnt / MAX_PER_ROW));
          return rows * (CARD_H + ROW_GAP) - ROW_GAP;
        })
      );

      yearBands.push({ year, y: bandStartY, h: bandH });

      cursorY = bandStartY + bandH + YEAR_GAP;
    });

    // Conexiones por persona
    const personIndex = {};
    projects.forEach(p => {
      p.authors.forEach(aid => {
        if (!personIndex[aid]) personIndex[aid] = [];
        personIndex[aid].push(p.id);
      });
    });

    const connections = [];
    Object.entries(personIndex).forEach(([personId, projIds]) => {
      if (projIds.length < 2) return;
      const sorted = [...projIds].sort((a, b) => {
        const pa = projects.find(p => p.id === a);
        const pb = projects.find(p => p.id === b);
        if (pb.year !== pa.year) return pb.year - pa.year;
        // within year, order by MC
        return pa.cluster.localeCompare(pb.cluster);
      });
      for (let i = 0; i < sorted.length - 1; i++) {
        connections.push({
          from: sorted[i],
          to: sorted[i + 1],
          person: personId,
        });
      }
    });

    // bounds
    let maxX = 0, maxY = 0;
    Object.values(positioned).forEach(p => {
      if (p.x + p.w > maxX) maxX = p.x + p.w;
      if (p.y + p.h > maxY) maxY = p.y + p.h;
    });

    return {
      positioned,
      connections,
      years,
      yearBands,
      mcBlocks,
      bounds: { w: maxX + 200, h: maxY + 80 },
      CARD_W, CARD_H, MC_GAP, YEAR_GAP,
    };
  }

  return { computeLayout };
})();
