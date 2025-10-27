const state = {
  cfg: null,
  products: [],
  planned: new Map(),
  toggles: {
    includeAmazon: true,
    includeAdditional: true,
    includeSimulations: false,
    includeFuture: false,
  },
  targetDate: null,
};

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function todayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function parseISODate(value) {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCHours(12, 0, 0, 0);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatISODate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffInWeeks(laterDate, earlierDate) {
  const diffMs = laterDate.getTime() - earlierDate.getTime();
  return diffMs <= 0 ? 0 : diffMs / (7 * 24 * 60 * 60 * 1000);
}

function sumBy(list, iteratee) {
  return list.reduce((total, item) => total + iteratee(item), 0);
}

function formatWeeks(value) {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '∞';
  return `${numberFormatter.format(value)} wks`;
}

function formatPairs(value) {
  return `${integerFormatter.format(Math.round(value))} pairs`;
}

function formatBoxes(value) {
  return `${numberFormatter.format(value)} boxes`;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchJSON(url, options = {}) {
  const fetchOptions = {
    credentials: 'same-origin',
    ...options,
  };
  const response = await fetch(url, fetchOptions);
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }
  return response.json();
}

export function getSeasonFactor(product, selectedMonth) {
  const monthKey = String(selectedMonth);
  if (!product || !product.seasonal_factors) {
    return 1;
  }
  const factors = product.seasonal_factors;
  if (Array.isArray(factors)) {
    const idx = selectedMonth - 1;
    return Number(factors[idx]) || 1;
  }
  return Number(factors[monthKey]) || Number(factors[selectedMonth]) || 1;
}

export function computeWeeklyDemand(aws, pairsPerBox, seasonFactor, awsUnit) {
  const baseAws = safeNumber(aws);
  const pairs = awsUnit === 'pairs'
    ? baseAws * seasonFactor
    : baseAws * safeNumber(pairsPerBox) * seasonFactor;
  return pairs > 0 ? pairs : 0;
}

export function mergePlannedAdditional(products, plannedRows) {
  const productMap = new Map(products.map((product) => [product.product_id, product]));
  const grouped = new Map();
  if (!Array.isArray(plannedRows)) {
    return grouped;
  }
  plannedRows.forEach((row) => {
    const product = productMap.get(row.product_id);
    if (!product) return;
    const quantityBoxes = safeNumber(row.quantity_boxes);
    const pairs = quantityBoxes * safeNumber(product.pairs_per_box);
    const entry = {
      id: row.id,
      product_id: row.product_id,
      scope: row.scope,
      eta_date: row.eta_date ? parseISODate(row.eta_date) : null,
      is_active: row.is_active !== 0,
      label: row.label || 'Additional',
      boxes: quantityBoxes,
      pairs,
    };
    if (!grouped.has(row.product_id)) {
      grouped.set(row.product_id, []);
    }
    grouped.get(row.product_id).push(entry);
  });
  return grouped;
}

export function computeCoverage(productRow, plannedEntries, cfg, month, toggles) {
  const today = todayStart();
  const pairsPerBox = safeNumber(productRow.pairs_per_box) || 0;
  const aws = safeNumber(productRow.average_weekly_sales);
  const seasonFactor = getSeasonFactor(productRow, month);
  const weeklyDemand = computeWeeklyDemand(aws, pairsPerBox, seasonFactor, cfg.AWS_UNIT);
  const includeAmazon = toggles.includeAmazon !== false;
  const includeAdditional = toggles.includeAdditional !== false;
  const includeSimulations = toggles.includeSimulations === true;
  const includeFuture = toggles.includeFuture === true;
  const targetDate = toggles.targetDate instanceof Date ? toggles.targetDate : today;

  const baseSegments = [
    { key: 'incoming', label: 'Incoming', pairs: safeNumber(productRow.incoming_pairs) },
    { key: 'wml', label: 'WML', pairs: safeNumber(productRow.wml_pairs) },
    { key: 'gmr', label: 'GMR', pairs: safeNumber(productRow.gmr_pairs) },
    { key: 'amz', label: 'Amazon', pairs: safeNumber(productRow.amz_pairs), include: includeAmazon },
  ];

  const segments = [];
  let totalPairsAll = 0;
  let totalPairsInternal = 0;
  let totalPairsForCoverage = 0;

  baseSegments.forEach((segment) => {
    const includeSegment = segment.include !== false;
    const weeks = weeklyDemand > 0 ? segment.pairs / weeklyDemand : 0;
    const boxes = pairsPerBox > 0 ? segment.pairs / pairsPerBox : 0;
    segments.push({
      key: segment.key,
      label: segment.label,
      pairs: segment.pairs,
      plannedPairs: 0,
      boxes,
      weeks,
      hatched: false,
      include: includeSegment,
    });
    if (segment.key !== 'amz') {
      totalPairsInternal += segment.pairs;
    }
    if (includeSegment) {
      totalPairsForCoverage += segment.pairs;
      totalPairsAll += segment.pairs;
    }
  });

  let additionalPairs = 0;
  let additionalBoxes = 0;
  let additionalWeeks = 0;
  let additionalHatched = false;

  if (includeAdditional && Array.isArray(plannedEntries) && plannedEntries.length > 0) {
    const filtered = plannedEntries.filter((entry) => {
      if (!entry.is_active) return false;
      if (!includeSimulations && entry.scope === 'simulation') return false;
      if (!includeFuture && entry.eta_date instanceof Date && entry.eta_date > today) return false;
      return true;
    });
    additionalPairs = sumBy(filtered, (entry) => entry.pairs);
    additionalBoxes = pairsPerBox > 0 ? additionalPairs / pairsPerBox : 0;
    additionalWeeks = weeklyDemand > 0 ? additionalPairs / weeklyDemand : 0;
    additionalHatched = filtered.some((entry) => entry.scope === 'simulation' || (entry.eta_date instanceof Date && entry.eta_date > today));

    if (additionalPairs > 0) {
      segments.push({
        key: 'additional',
        label: 'Additional',
        pairs: additionalPairs,
        plannedPairs: additionalPairs,
        boxes: additionalBoxes,
        weeks: additionalWeeks,
        hatched: additionalHatched,
        include: true,
      });
      totalPairsInternal += additionalPairs;
      totalPairsForCoverage += additionalPairs;
      totalPairsAll += additionalPairs;
    }
  }

  const amazonSegment = segments.find((segment) => segment.key === 'amz');
  if (amazonSegment && !includeAmazon) {
    totalPairsAll -= amazonSegment.pairs;
    totalPairsForCoverage -= amazonSegment.pairs;
  }

  const totalWeeks = weeklyDemand > 0 ? totalPairsForCoverage / weeklyDemand : null;
  const internalWeeks = weeklyDemand > 0 ? totalPairsInternal / weeklyDemand : null;
  const allWeeks = weeklyDemand > 0 ? totalPairsAll / weeklyDemand : null;

  const stockoutDate = weeklyDemand > 0 && totalWeeks != null
    ? addDays(today, Math.ceil(totalWeeks * 7))
    : null;

  const weeksToTarget = diffInWeeks(targetDate, today);
  const neededPairs = weeklyDemand > 0 && totalWeeks != null
    ? Math.max(0, (weeksToTarget - totalWeeks) * weeklyDemand)
    : 0;
  const neededBoxes = pairsPerBox > 0 ? neededPairs / pairsPerBox : 0;

  return {
    product_id: productRow.product_id,
    name: productRow.name,
    weeklyDemand,
    seasonFactor,
    noDemand: weeklyDemand <= 0,
    segments,
    totals: {
      pairsInternal: totalPairsInternal,
      pairsAll: totalPairsAll,
      weeklyDemand,
      totalWeeks,
      internalWeeks,
      allWeeks,
    },
    stockoutDate,
    toOrder: {
      pairs: neededPairs,
      boxes: neededBoxes,
      weeksToTarget,
    },
  };
}

export function renderDashboard(currentState) {
  const container = document.getElementById('dashboard-bars');
  if (!container || !currentState.cfg) {
    return;
  }

  const today = todayStart();
  const targetDate = currentState.targetDate instanceof Date ? currentState.targetDate : today;
  const selectedMonth = targetDate.getMonth() + 1;

  const coverages = currentState.products.map((product) => {
    const planned = currentState.planned.get(product.product_id) || [];
    return computeCoverage(product, planned, currentState.cfg, selectedMonth, {
      ...currentState.toggles,
      targetDate,
    });
  });

  let maxWeeksInView = currentState.cfg.LEAD_TIME_WEEKS || 0;
  let aggregateDemand = 0;
  let aggregateInternalPairs = 0;
  let aggregateAllPairs = 0;

  coverages.forEach((coverage) => {
    if (coverage.totals.totalWeeks != null && Number.isFinite(coverage.totals.totalWeeks)) {
      maxWeeksInView = Math.max(maxWeeksInView, coverage.totals.totalWeeks);
    }
    if (coverage.totals.allWeeks != null && Number.isFinite(coverage.totals.allWeeks)) {
      maxWeeksInView = Math.max(maxWeeksInView, coverage.totals.allWeeks);
    }
    if (!coverage.noDemand) {
      aggregateDemand += coverage.totals.weeklyDemand;
      aggregateInternalPairs += coverage.totals.pairsInternal;
      aggregateAllPairs += coverage.totals.pairsAll;
    }
  });

  const weeksToTarget = diffInWeeks(targetDate, today);
  maxWeeksInView = Math.max(maxWeeksInView, weeksToTarget);
  if (maxWeeksInView <= 0) {
    maxWeeksInView = 1;
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  coverages.forEach((coverage, index) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `Product ${coverage.name}`);
    if (coverage.noDemand) {
      row.classList.add('bar-row--no-demand');
    }

    const header = document.createElement('div');
    header.className = 'bar-row__header';

    const title = document.createElement('h3');
    title.className = 'bar-row__title';
    title.textContent = coverage.name;
    header.appendChild(title);

    const summary = document.createElement('div');
    summary.className = 'bar-row__summary';

    const totalSpan = document.createElement('span');
    totalSpan.className = 'metric metric--total';
    totalSpan.textContent = `Total: ${formatWeeks(coverage.totals.totalWeeks)}`;
    summary.appendChild(totalSpan);

    const stockoutSpan = document.createElement('span');
    stockoutSpan.className = 'metric metric--stockout';
    stockoutSpan.textContent = coverage.stockoutDate
      ? `Stockout: ${dateFormatter.format(coverage.stockoutDate)}`
      : 'Stockout: —';
    summary.appendChild(stockoutSpan);

    const orderSpan = document.createElement('span');
    orderSpan.className = 'metric metric--order';
    orderSpan.textContent = coverage.toOrder.pairs > 0
      ? `To order: ${formatPairs(coverage.toOrder.pairs)} (${formatBoxes(coverage.toOrder.boxes)})`
      : 'To order: 0';
    summary.appendChild(orderSpan);

    header.appendChild(summary);
    row.appendChild(header);

    const bar = document.createElement('div');
    bar.className = 'bar-row__bar';

    coverage.segments
      .filter((segment) => segment.include !== false && segment.pairs > 0)
      .forEach((segment) => {
        const segmentEl = document.createElement('div');
        segmentEl.className = `seg seg--${segment.key}`;
        if (segment.hatched) {
          segmentEl.classList.add('seg--hatched');
        }
        const widthPercent = Math.min(100, (segment.weeks / maxWeeksInView) * 100);
        segmentEl.style.setProperty('--w', String(widthPercent));

        const tooltipId = `seg-tip-${coverage.product_id}-${segment.key}-${index}`;
        const hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'seg__hit';
        hit.setAttribute('aria-describedby', tooltipId);
        hit.textContent = segment.label;

        const tooltip = document.createElement('div');
        tooltip.className = 'seg__tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.id = tooltipId;
        tooltip.innerHTML = `
          <strong>${segment.label}</strong><br>
          ${formatPairs(segment.pairs)}<br>
          ${formatBoxes(segment.boxes)}<br>
          ${formatWeeks(segment.weeks)}
        `;

        segmentEl.appendChild(hit);
        segmentEl.appendChild(tooltip);
        bar.appendChild(segmentEl);
      });

    const leadGuide = document.createElement('div');
    leadGuide.className = 'guide guide--min';
    const leadPos = Math.min(100, (currentState.cfg.LEAD_TIME_WEEKS / maxWeeksInView) * 100);
    leadGuide.style.setProperty('--pos', String(leadPos));
    leadGuide.setAttribute('aria-label', `Lead time minimum ${currentState.cfg.LEAD_TIME_WEEKS} weeks`);
    bar.appendChild(leadGuide);

    const targetGuide = document.createElement('div');
    targetGuide.className = 'guide guide--target';
    const targetPos = Math.min(100, (weeksToTarget / maxWeeksInView) * 100);
    targetGuide.style.setProperty('--pos', String(targetPos));
    targetGuide.setAttribute('aria-label', `Target date coverage ${numberFormatter.format(weeksToTarget)} weeks`);
    bar.appendChild(targetGuide);

    row.appendChild(bar);
    fragment.appendChild(row);
  });

  container.appendChild(fragment);

  const totalsInternalEl = document.getElementById('totalsInternal');
  const totalsAllEl = document.getElementById('totalsAll');
  const leadTimeEl = document.getElementById('leadTimeWeeks');

  const internalWeeks = aggregateDemand > 0 ? aggregateInternalPairs / aggregateDemand : null;
  const allWeeks = aggregateDemand > 0 ? aggregateAllPairs / aggregateDemand : null;

  if (totalsInternalEl) {
    totalsInternalEl.textContent = formatWeeks(internalWeeks);
  }
  if (totalsAllEl) {
    totalsAllEl.textContent = formatWeeks(allWeeks);
  }
  if (leadTimeEl) {
    leadTimeEl.textContent = numberFormatter.format(currentState.cfg.LEAD_TIME_WEEKS);
  }
}

async function loadDashboard() {
  try {
    const [cfg, products] = await Promise.all([
      fetchJSON('/api/config.php'),
      fetchJSON('/api/get_all.php'),
    ]);

    if (!cfg || !Array.isArray(products)) {
      return;
    }

    state.cfg = cfg;
    state.products = products;

    const plannedUrl = '/api/planned_stock/get_planned_stock.php?include_simulations=1&include_future=1&include_inactive=0';
    let plannedRows = [];
    try {
      const response = await fetchJSON(plannedUrl);
      if (Array.isArray(response)) {
        plannedRows = response;
      }
    } catch (error) {
      if (error.status !== 404) {
        console.error('Failed to load planned stock', error);
      }
    }

    state.planned = mergePlannedAdditional(products, plannedRows);

    const targetInput = document.getElementById('coverageTarget');
    const defaultTarget = addDays(todayStart(), (cfg.LEAD_TIME_WEEKS || 0) * 7);
    state.targetDate = defaultTarget;
    if (targetInput && !targetInput.value) {
      targetInput.value = formatISODate(defaultTarget);
    }

    const amazonToggle = document.getElementById('toggleAmazon');
    if (amazonToggle instanceof HTMLInputElement) {
      state.toggles.includeAmazon = amazonToggle.checked;
    }
    const additionalToggle = document.getElementById('toggleAdditional');
    if (additionalToggle instanceof HTMLInputElement) {
      state.toggles.includeAdditional = additionalToggle.checked;
    }
    const simToggle = document.getElementById('toggleSim');
    if (simToggle instanceof HTMLInputElement) {
      state.toggles.includeSimulations = simToggle.checked;
    }
    const futureToggle = document.getElementById('toggleFuture');
    if (futureToggle instanceof HTMLInputElement) {
      state.toggles.includeFuture = futureToggle.checked;
    }

    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
      dashboard.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        switch (target.id) {
          case 'toggleAmazon':
            state.toggles.includeAmazon = target.checked;
            break;
          case 'toggleAdditional':
            state.toggles.includeAdditional = target.checked;
            break;
          case 'toggleSim':
            state.toggles.includeSimulations = target.checked;
            break;
          case 'toggleFuture':
            state.toggles.includeFuture = target.checked;
            break;
          case 'coverageTarget':
            state.targetDate = parseISODate(target.value) || todayStart();
            break;
          default:
            break;
        }
        renderDashboard(state);
      });
    }

    const targetInputListener = document.getElementById('coverageTarget');
    if (targetInputListener) {
      targetInputListener.addEventListener('input', (event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement) {
          state.targetDate = parseISODate(input.value) || todayStart();
          renderDashboard(state);
        }
      });
    }

    renderDashboard(state);
  } catch (error) {
    console.error('Failed to initialize dashboard', error);
  }
}

document.addEventListener('DOMContentLoaded', loadDashboard);

