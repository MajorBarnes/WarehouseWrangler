const API_BASE = '/api';

const state = {
    config: null,
    products: [],
    planned: new Map(),
    rows: [],
    totals: {
        internalPairs: 0,
        internalWeeks: 0,
        allPairs: 0,
        allWeeks: 0
    },
    toggles: {
        includeAmazon: true,
        includeAdditional: true,
        includeSim: false,
        includeFuture: false
    },
    targetDate: null,
    weeksToTarget: 0,
    maxWeeks: 0,
    today: startOfDay(new Date())
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
});

const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0
});

const pairsFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
});

export async function fetchJSON(url, opts = {}) {
  const token = localStorage.getItem('ww_auth_token');
  if (!token) {
    window.location.href = '/login.html';
    throw new Error('Missing authentication token');
  }

  const options = { ...opts };
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  options.headers = headers;

  const response = await fetch(url, options);

  if (response.status === 401) {
    localStorage.removeItem('ww_auth_token');
    localStorage.removeItem('ww_user_data');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }

  if (response.status === 204) {
    // No content; treat as null/empty object depending on caller needs
    return null;
  }

  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    const err = new Error(`Request failed ${response.status} for ${url}. Body: ${txt.slice(0,200)}`);
    err.status = response.status;
    throw err;
  }

  try {
    return await response.json();
  } catch (e) {
    const txt = await response.text().catch(() => '');
    throw new Error(`Invalid JSON from ${url}: ${e.message}. Body: ${txt.slice(0,200)}`);
  }
}

export function getSeasonFactor(product, selectedMonth) {
    if (!product || !product.seasonal_factors) {
        return 1;
    }

    const monthKey = String(selectedMonth);
    const factors = product.seasonal_factors;

    if (Object.prototype.hasOwnProperty.call(factors, monthKey)) {
        const factor = Number(factors[monthKey]);
        return Number.isFinite(factor) && factor > 0 ? factor : 1;
    }

    if (Array.isArray(factors)) {
        const index = selectedMonth - 1;
        if (factors[index] != null) {
            const factor = Number(factors[index]);
            return Number.isFinite(factor) && factor > 0 ? factor : 1;
        }
    }

    const numericKey = Number(selectedMonth);
    if (Number.isFinite(numericKey) && numericKey >= 1 && numericKey <= 12) {
        const fallback = factors[numericKey];
        if (fallback != null) {
            const factor = Number(fallback);
            return Number.isFinite(factor) && factor > 0 ? factor : 1;
        }
    }

    return 1;
}

export function computeWeeklyDemand(aws, pairsPerBox, sf, awsUnit) {
    const averageSales = Number(aws) || 0;
    const factor = Number(sf) || 1;
    const unit = (awsUnit || '').toLowerCase();

    if (unit === 'pairs') {
        return averageSales * factor;
    }

    const ppb = Number(pairsPerBox) || 0;
    return averageSales * ppb * factor;
}

export function mergePlannedAdditional(products, plannedRows) {
    const map = new Map();
    const pairsPerBoxByProduct = new Map();

    products.forEach(product => {
        const pid = product.product_id != null ? product.product_id : product.id;
        pairsPerBoxByProduct.set(pid, Number(product.pairs_per_box) || 0);
    });

    (plannedRows || []).forEach(row => {
        const productId = row.product_id;
        if (productId == null) {
            return;
        }

        const pairsPerBox = pairsPerBoxByProduct.get(productId) || 0;
        const boxes = Number(row.quantity_boxes) || 0;
        const pairs = boxes * pairsPerBox;
        const etaDate = row.eta_date ? parseISODate(row.eta_date) : null;

        const entry = {
            id: row.id,
            product_id: productId,
            label: row.label || '',
            scope: row.scope || 'committed',
            isSimulation: (row.scope || '').toLowerCase() === 'simulation',
            isActive: row.is_active == null ? true : Number(row.is_active) === 1,
            etaDate,
            quantityBoxes: boxes,
            pairs
        };

        if (!map.has(productId)) {
            map.set(productId, { entries: [] });
        }

        map.get(productId).entries.push(entry);
    });

    return map;
}

export function computeCoverage(productRow, plannedMap, cfg, month, toggles) {
    const productId = productRow.product_id != null ? productRow.product_id : productRow.id;
    const name = productRow.name || productRow.product_name || `Product ${productId}`;
    const pairsPerBox = Number(productRow.pairs_per_box) || 0;
    const aws = Number(productRow.average_weekly_sales) || 0;
    const seasonFactor = getSeasonFactor(productRow, month);
    const weeklyDemand = computeWeeklyDemand(aws, pairsPerBox, seasonFactor, cfg.AWS_UNIT);
    const today = toggles.today || startOfDay(new Date());

    const result = {
        productId,
        name,
        pairsPerBox,
        seasonFactor,
        weeklyDemand,
        totalWeeks: 0,
        segments: [],
        totals: {
            internalPairs: 0,
            internalWeeks: 0,
            allPairs: 0,
            allWeeks: 0
        },
        stockoutDate: null,
        toOrder: {
            weeksToTarget: 0,
            pairs: 0,
            boxes: 0
        },
        noDemand: weeklyDemand <= 0,
        additionalDetails: {
            hasSimulation: false,
            hasFuture: false,
            pairs: 0
        }
    };

    const locations = {
        incoming: Number(productRow.incoming_pairs) || 0,
        wml: Number(productRow.wml_pairs) || 0,
        gmr: Number(productRow.gmr_pairs) || 0,
        amz: Number(productRow.amz_pairs) || 0
    };

    const planned = plannedMap.get(productId);
    const includeAdditional = !!toggles.includeAdditional;
    const includeAmazon = !!toggles.includeAmazon;

    let additionalPairs = 0;
    let hasSimulation = false;
    let hasFuture = false;

    if (includeAdditional && planned && Array.isArray(planned.entries)) {
        planned.entries.forEach(entry => {
            if (!entry.isActive) {
                return;
            }
            if (!toggles.includeSim && entry.isSimulation) {
                return;
            }
            const isFuture = entry.etaDate ? entry.etaDate > today : false;
            if (!toggles.includeFuture && isFuture) {
                return;
            }
            additionalPairs += entry.pairs;
            if (entry.isSimulation) {
                hasSimulation = true;
            }
            if (isFuture) {
                hasFuture = true;
            }
        });
    }

    result.additionalDetails.pairs = additionalPairs;
    result.additionalDetails.hasSimulation = hasSimulation;
    result.additionalDetails.hasFuture = hasFuture;

    const segments = [
        {
            type: 'incoming',
            label: 'Incoming',
            pairs: locations.incoming,
            plannedPairs: 0
        },
        {
            type: 'wml',
            label: 'WML',
            pairs: locations.wml,
            plannedPairs: 0
        },
        {
            type: 'gmr',
            label: 'GMR',
            pairs: locations.gmr,
            plannedPairs: 0
        }
    ];

    if (includeAmazon) {
        segments.push({
            type: 'amz',
            label: 'Amazon',
            pairs: locations.amz,
            plannedPairs: 0
        });
    }

    if (includeAdditional) {
        segments.push({
            type: 'additional',
            label: 'Additional',
            pairs: 0,
            plannedPairs: additionalPairs,
            hatched: hasSimulation || hasFuture
        });
    }

    const internalPairs = locations.incoming + locations.wml + locations.gmr;
    let totalPairs = internalPairs;

    if (includeAmazon) {
        totalPairs += locations.amz;
    }
    if (includeAdditional) {
        totalPairs += additionalPairs;
    }

    result.totals.internalPairs = internalPairs;
    result.totals.allPairs = totalPairs;

    if (weeklyDemand > 0) {
        segments.forEach(segment => {
            const coveragePairs = segment.plannedPairs || segment.pairs || 0;
            segment.weeks = coveragePairs / weeklyDemand;
        });

        result.totals.internalWeeks = internalPairs / weeklyDemand;
        result.totals.allWeeks = totalPairs / weeklyDemand;
        result.totalWeeks = result.totals.allWeeks;

        const stockout = addDays(today, Math.ceil(result.totalWeeks * 7));
        result.stockoutDate = stockout;
    } else {
        segments.forEach(segment => {
            segment.weeks = 0;
        });
        result.totals.internalWeeks = Infinity;
        result.totals.allWeeks = Infinity;
        result.totalWeeks = Infinity;
        result.stockoutDate = null;
    }

    const targetDate = toggles.targetDate instanceof Date ? toggles.targetDate : today;
    const weeksToTarget = diffInWeeks(targetDate, today);
    result.toOrder.weeksToTarget = weeksToTarget;

    if (weeklyDemand > 0) {
        const neededPairs = Math.max(0, (weeksToTarget - result.totalWeeks) * weeklyDemand);
        result.toOrder.pairs = neededPairs;
        result.toOrder.boxes = pairsPerBox > 0 ? neededPairs / pairsPerBox : 0;
    } else {
        result.toOrder.pairs = 0;
        result.toOrder.boxes = 0;
    }

    result.segments = segments;

    return result;
}

export function renderDashboard(currentState) {
    const container = document.getElementById('dashboard-bars');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    const maxWeeks = currentState.maxWeeks || 1;
    const leadTimeWeeks = Number(currentState.config?.LEAD_TIME_WEEKS) || 0;
    const targetDate = currentState.targetDate;
    const weekToTarget = currentState.weeksToTarget;

    currentState.rows.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'bar-row';
        rowEl.setAttribute('role', 'group');
        rowEl.setAttribute('aria-label', `Product ${row.name}`);

        const headerEl = document.createElement('div');
        headerEl.className = 'bar-row__header';

        const titleEl = document.createElement('h3');
        titleEl.className = 'bar-row__title';
        titleEl.textContent = row.name;
        headerEl.appendChild(titleEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'bar-row__meta';

        const demandText = row.noDemand
            ? 'No demand recorded'
            : `${numberFormatter.format(row.weeklyDemand)} pairs/week`;
        metaEl.appendChild(createMetaChip('Demand', demandText));

        if (!row.noDemand && row.stockoutDate instanceof Date) {
            const stockoutLabel = `${dateFormatter.format(row.stockoutDate)} (${numberFormatter.format(row.totalWeeks)}w)`;
            metaEl.appendChild(createMetaChip('Stockout', stockoutLabel));
        } else {
            metaEl.appendChild(createMetaChip('Stockout', '—'));
        }

        if (!row.noDemand) {
            const boxesNeeded = row.toOrder.boxes > 0 ? numberFormatter.format(row.toOrder.boxes) : '0';
            metaEl.appendChild(createMetaChip('To-order', `${boxesNeeded} boxes`));
        } else {
            metaEl.appendChild(createMetaChip('To-order', '—'));
        }

        headerEl.appendChild(metaEl);
        rowEl.appendChild(headerEl);

        const trackEl = document.createElement('div');
        trackEl.className = 'bar-row__track';

        const segmentsEl = document.createElement('div');
        segmentsEl.className = 'bar-row__segments';

        row.segments.forEach(segment => {
            if (!segment.pairs && !segment.plannedPairs) {
                return;
            }

            const segEl = document.createElement('div');
            const classes = ['seg', `seg--${segment.type}`];
            if (segment.hatched) {
                classes.push('seg--hatched');
            }
            segEl.className = classes.join(' ');

            const widthPercent = Math.min(100, (segment.weeks / maxWeeks) * 100);
            segEl.style.setProperty('--w', widthPercent.toString());
            segEl.style.width = `calc(var(--w, ${widthPercent}) * 1%)`;

            const tipId = `tip-${row.productId}-${segment.type}`;
            const button = document.createElement('button');
            button.className = 'seg__hit';
            button.type = 'button';
            button.setAttribute('aria-describedby', tipId);

            const tooltip = document.createElement('span');
            tooltip.className = 'seg__tooltip';
            tooltip.id = tipId;
            tooltip.setAttribute('role', 'tooltip');
            tooltip.textContent = buildTooltipContent(segment, row.weeklyDemand);

            segEl.appendChild(button);
            segEl.appendChild(tooltip);
            segmentsEl.appendChild(segEl);
        });

        trackEl.appendChild(segmentsEl);

        const guideMin = document.createElement('div');
        guideMin.className = 'guide guide--min';
        guideMin.setAttribute('role', 'separator');
        guideMin.setAttribute('aria-label', `${leadTimeWeeks} week minimum coverage`);
        guideMin.style.setProperty('--pos', Math.min(100, (leadTimeWeeks / maxWeeks) * 100).toString());
        trackEl.appendChild(guideMin);

        if (targetDate instanceof Date) {
            const guideTarget = document.createElement('div');
            guideTarget.className = 'guide guide--target';
            guideTarget.setAttribute('role', 'separator');
            guideTarget.setAttribute('aria-label', `Target coverage of ${numberFormatter.format(weekToTarget)} weeks`);
            guideTarget.style.setProperty('--pos', Math.min(100, (weekToTarget / maxWeeks) * 100).toString());
            trackEl.appendChild(guideTarget);
        }

        rowEl.appendChild(trackEl);
        container.appendChild(rowEl);
    });

    updateTotalsDisplay(currentState);
}

document.addEventListener('DOMContentLoaded', initializeDashboard);

async function initializeDashboard() {
    try {
        updateUserDisplay();
        const [config, productsResponse] = await Promise.all([
            fetchJSON(`${API_BASE}/config.php`),
            fetchJSON(`${API_BASE}/products/get_all.php`)
        ]);

        state.config = normalizeConfig(config);
        state.products = unwrapProducts(productsResponse);

        const targetInput = document.getElementById('coverageTarget');
        state.targetDate = defaultTargetDate(state.config.LEAD_TIME_WEEKS);
        if (targetInput) {
            targetInput.value = toInputValue(state.targetDate);
        }

        const leadTimeEl = document.getElementById('leadTimeWeeks');
        if (leadTimeEl) {
            leadTimeEl.textContent = `${state.config.LEAD_TIME_WEEKS}`;
        }

        await loadPlannedStock();
        recalcState();
        setupControls();
        renderDashboard(state);
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showDashboardError(error);
    }
}

function normalizeConfig(cfg) {
    const lead = Number(cfg?.LEAD_TIME_WEEKS);
    const unit = (cfg?.AWS_UNIT || 'boxes').toLowerCase();
    return {
        LEAD_TIME_WEEKS: Number.isFinite(lead) && lead > 0 ? lead : 8,
        AWS_UNIT: unit === 'pairs' ? 'pairs' : 'boxes'
    };
}

function unwrapData(res) {
  if (Array.isArray(res)) return res;
  if (res && res.success && Array.isArray(res.data)) return res.data;
  return [];
}

function unwrapProducts(res) {
  if (Array.isArray(res)) {
    return res;
  }

  if (res && typeof res === 'object') {
    if (Array.isArray(res.products)) {
      return res.products;
    }

    if (Array.isArray(res.data)) {
      return res.data;
    }
  }

  return [];
}

async function loadPlannedStock() {
  const params = new URLSearchParams({
    include_simulations: state.toggles.includeSim ? '1' : '0',
    include_future:      state.toggles.includeFuture ? '1' : '0',
    include_inactive:    '0'
  });

  try {
    const res = await fetchJSON(`${API_BASE}/planned_stock/get_planned_stock.php?${params.toString()}`);
    const plannedRows = unwrapData(res);
    state.planned = mergePlannedAdditional(state.products, plannedRows);
  } catch (error) {
    // 404 → endpoint not present yet; anything else → log and proceed without planned
    console.error('Unable to load planned stock:', error);
    state.planned = new Map();
  }
}

function recalcState() {
    const month = (state.targetDate?.getMonth?.() ?? state.today.getMonth()) + 1;
    const toggles = {
        ...state.toggles,
        targetDate: state.targetDate,
        today: state.today
    };

    const rows = state.products.map(product => computeCoverage(product, state.planned, state.config, month, toggles));
    rows.sort((a, b) => {
        const aWeeks = Number.isFinite(a.totalWeeks) ? a.totalWeeks : Number.POSITIVE_INFINITY;
        const bWeeks = Number.isFinite(b.totalWeeks) ? b.totalWeeks : Number.POSITIVE_INFINITY;
        return aWeeks - bWeeks;
    });

    state.rows = rows;

    const aggregates = rows.reduce((acc, row) => {
        if (row.weeklyDemand > 0) {
            acc.internalPairs += row.totals.internalPairs;
            acc.allPairs += row.totals.allPairs;
            acc.demand += row.weeklyDemand;
        }
        return acc;
    }, { internalPairs: 0, allPairs: 0, demand: 0 });

    state.totals.internalPairs = aggregates.internalPairs;
    state.totals.allPairs = aggregates.allPairs;

    if (aggregates.demand > 0) {
        state.totals.internalWeeks = aggregates.internalPairs / aggregates.demand;
        state.totals.allWeeks = aggregates.allPairs / aggregates.demand;
    } else {
        state.totals.internalWeeks = 0;
        state.totals.allWeeks = 0;
    }

    state.weeksToTarget = diffInWeeks(state.targetDate, state.today);

    const maxRowWeeks = rows.reduce((max, row) => {
        if (Number.isFinite(row.totalWeeks)) {
            return Math.max(max, row.totalWeeks);
        }
        return max;
    }, 0);

    const candidates = [state.config.LEAD_TIME_WEEKS, state.weeksToTarget, maxRowWeeks].filter(value => Number.isFinite(value) && value >= 0);
    state.maxWeeks = Math.max(1, ...candidates);
}

function setupControls() {
    const targetInput = document.getElementById('coverageTarget');
    if (targetInput) {
        targetInput.addEventListener('change', event => {
            const value = event.target.value;
            const parsed = value ? parseISODate(value) : null;
            if (parsed) {
                state.targetDate = startOfDay(parsed);
            } else {
                state.targetDate = defaultTargetDate(state.config.LEAD_TIME_WEEKS);
                targetInput.value = toInputValue(state.targetDate);
            }
            recalcState();
            renderDashboard(state);
        });
    }

    const toggleAmazon = document.getElementById('toggleAmazon');
    if (toggleAmazon) {
        toggleAmazon.addEventListener('change', event => {
            state.toggles.includeAmazon = event.target.checked;
            recalcState();
            renderDashboard(state);
        });
    }

    const toggleAdditional = document.getElementById('toggleAdditional');
    if (toggleAdditional) {
        toggleAdditional.addEventListener('change', event => {
            state.toggles.includeAdditional = event.target.checked;
            recalcState();
            renderDashboard(state);
        });
    }

    const toggleSim = document.getElementById('toggleSim');
    if (toggleSim) {
        toggleSim.addEventListener('change', async event => {
            state.toggles.includeSim = event.target.checked;
            await loadPlannedStock();
            recalcState();
            renderDashboard(state);
        });
    }

    const toggleFuture = document.getElementById('toggleFuture');
    if (toggleFuture) {
        toggleFuture.addEventListener('change', async event => {
            state.toggles.includeFuture = event.target.checked;
            await loadPlannedStock();
            recalcState();
            renderDashboard(state);
        });
    }
}

function updateTotalsDisplay(currentState) {
    const totalsInternal = document.getElementById('totalsInternal');
    const totalsAll = document.getElementById('totalsAll');

    if (totalsInternal) {
        const weeks = currentState.totals.internalWeeks;
        const pairs = currentState.totals.internalPairs;
        totalsInternal.textContent = `${numberFormatter.format(weeks)}w / ${pairsFormatter.format(pairs)} pairs`;
    }

    if (totalsAll) {
        const weeks = currentState.totals.allWeeks;
        const pairs = currentState.totals.allPairs;
        totalsAll.textContent = `${numberFormatter.format(weeks)}w / ${pairsFormatter.format(pairs)} pairs`;
    }
}

function showDashboardError(error) {
    const container = document.getElementById('dashboard-bars');
    if (!container) {
        return;
    }

    const message = document.createElement('div');
    message.className = 'dashboard-error';
    message.setAttribute('role', 'alert');
    message.textContent = `Unable to load dashboard data: ${error.message}`;
    container.innerHTML = '';
    container.appendChild(message);
}

function createMetaChip(label, value) {
    const chip = document.createElement('span');
    chip.className = 'bar-row__meta-chip';
    chip.innerHTML = `<strong>${label}:</strong> ${value}`;
    return chip;
}

function buildTooltipContent(segment, weeklyDemand) {
    const pairsValue = segment.plannedPairs || segment.pairs || 0;
    const pairsText = `${pairsFormatter.format(pairsValue)} pairs`;
    if (!weeklyDemand || weeklyDemand <= 0) {
        return `${segment.label}: ${pairsText}`;
    }
    const weeks = segment.weeks || 0;
    return `${segment.label}: ${pairsText} · ${numberFormatter.format(weeks)}w`;
}

function updateUserDisplay() {
    const userDisplay = document.getElementById('userDisplay');
    const loadingScreen = document.getElementById('loadingScreen');
    const mainApp = document.getElementById('mainApp');
    const token = localStorage.getItem('ww_auth_token');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const userDataStr = localStorage.getItem('ww_user_data');
    if (userDisplay) {
        userDisplay.textContent = 'User';
        if (userDataStr) {
            try {
                const userData = JSON.parse(userDataStr);
                if (userData?.username) {
                    userDisplay.textContent = userData.username;
                }
            } catch (error) {
                console.error('Failed to parse user data', error);
            }
        }
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('ww_auth_token');
                localStorage.removeItem('ww_user_data');
                window.location.href = '/login.html';
            }
        });
    }

    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    if (mainApp) {
        mainApp.classList.remove('hidden');
    }
}

function defaultTargetDate(leadWeeks) {
    const baseWeeks = Number(leadWeeks) || 0;
    const totalWeeks = Math.max(0, baseWeeks) + 13;
    const base = startOfDay(new Date());
    return addDays(base, Math.ceil(totalWeeks * 7));
}

function toInputValue(date) {
    return date ? date.toISOString().split('T')[0] : '';
}

function diffInWeeks(target, start) {
    if (!(target instanceof Date) || !(start instanceof Date)) {
        return 0;
    }

    const diff = target.getTime() - start.getTime();
    return diff <= 0 ? 0 : diff / (1000 * 60 * 60 * 24 * 7);
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return startOfDay(result);
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODate(value) {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

