// Recovery Rate Dashboard — loaded via srcdoc, reads window.__D for data
(function() {

let currentFilter = 'abiMain';
let currentFY = null;
let chartInstance = null;
let ALL_DATA = {};
let FY_LIST = [];

function parseData() {
  const raw = window.__D;
  if (!raw || !Array.isArray(raw)) return {};
  const parseSeries = (s) => s ? s.split('|').map(v => (parseFloat(v)||0)*1000) : [];
  const result = {};
  raw.forEach(d => {
    if (!d.fy || !d.months) return;
    result[d.fy] = {
      months:       d.months.split('|'),
      abiMainBilled: parseSeries(d.amb),
      abiMainCash:   parseSeries(d.amc),
      abiMainRev:    parseSeries(d.amr),
      abiMainTarget: parseFloat(d.amt||0.74),
      abiPresBilled: parseSeries(d.apb),
      abiPresCash:   parseSeries(d.apc),
      abiPresRev:    parseSeries(d.apr),
      abiPresTarget: parseFloat(d.apt||0.78),
      nonMainBilled: parseSeries(d.nmb),
      nonMainCash:   parseSeries(d.nmc),
      nonMainRev:    parseSeries(d.nmr),
      nonMainTarget: parseFloat(d.nmt||0.65),
      nonPresBilled: parseSeries(d.npb),
      nonPresCash:   parseSeries(d.npc),
      nonPresRev:    parseSeries(d.npr),
      nonPresTarget: parseFloat(d.npt||0.63),
    };
  });
  return result;
}

function fmt(n) {
  if (isNaN(n)||n===0) return '£0';
  if (n>=1000000) return '£'+(n/1000000).toFixed(2)+'M';
  if (n>=1000) return '£'+(n/1000).toFixed(0)+'K';
  return '£'+Math.round(n).toLocaleString();
}
function fmtPct(n) { if(isNaN(n)||!isFinite(n)) return '0.0%'; return (n*100).toFixed(1)+'%'; }
function last(arr) { return arr&&arr.length ? arr[arr.length-1] : 0; }

function getFilterData(d, filter) {
  switch(filter) {
    case 'abiMain': return { billed:d.abiMainBilled, cash:d.abiMainCash, rev:d.abiMainRev, target:d.abiMainTarget };
    case 'abiPres': return { billed:d.abiPresBilled, cash:d.abiPresCash, rev:d.abiPresRev, target:d.abiPresTarget };
    case 'nonMain': return { billed:d.nonMainBilled, cash:d.nonMainCash, rev:d.nonMainRev, target:d.nonMainTarget };
    case 'nonPres': return { billed:d.nonPresBilled, cash:d.nonPresCash, rev:d.nonPresRev, target:d.nonPresTarget };
    default: return {
      billed: d.abiMainBilled.map((_,i)=>d.abiMainBilled[i]+d.abiPresBilled[i]+d.nonMainBilled[i]+d.nonPresBilled[i]),
      cash:   d.abiMainCash.map((_,i)=>d.abiMainCash[i]+d.abiPresCash[i]+d.nonMainCash[i]+d.nonPresCash[i]),
      rev:    d.abiMainRev.map((_,i)=>d.abiMainRev[i]+d.abiPresRev[i]+d.nonMainRev[i]+d.nonPresRev[i]),
      target: (d.abiMainTarget+d.abiPresTarget+d.nonMainTarget+d.nonPresTarget)/4
    };
  }
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateChart();
}

function setFY(fy) {
  currentFY = fy;
  document.querySelectorAll('.fy-btn').forEach(b=>b.classList.toggle('active', b.dataset.fy===fy));
  updateChart();
}

function buildFYSelector() {
  const sel = document.getElementById('fy-selector');
  sel.innerHTML = '';
  FY_LIST.forEach(fy => {
    const btn = document.createElement('button');
    btn.className = 'fy-btn'+(fy===currentFY?' active':'');
    btn.textContent = fy; btn.dataset.fy = fy;
    btn.onclick = () => setFY(fy);
    sel.appendChild(btn);
  });
}

function updateChart() {
  const d = ALL_DATA[currentFY];
  if (!d) { document.getElementById('pillar-grid').innerHTML = '<div class="no-data">No data</div>'; return; }

  const f = getFilterData(d, currentFilter);
  const totalBilled = last(f.billed), totalCash = last(f.cash), totalRev = last(f.rev);
  const totalPerf = totalRev > 0 ? totalCash / totalRev : 0;
  const variance = totalPerf - f.target, isAbove = variance >= 0;

  document.getElementById('kpi-billed').textContent    = fmt(totalBilled);
  document.getElementById('kpi-collected').textContent = fmt(totalCash);
  document.getElementById('kpi-perf').textContent      = fmtPct(totalPerf);
  document.getElementById('kpi-target').textContent    = fmtPct(f.target);
  document.getElementById('kpi-variance-sub').innerHTML =
    `<span class="${isAbove?'pos':'neg'}">${isAbove?'▲':'▼'} ${(Math.abs(variance)*100).toFixed(1)}%</span> vs Target`;
  document.getElementById('kpi-perf-card').className = 'kpi '+(isAbove?'above':'below');

  const collectionPct = f.cash.map(v => totalBilled > 0 ? v / totalBilled : 0);
  const perfLine      = f.rev.map((r,i) => r > 0 ? f.cash[i] / r : null);
  const targetLine    = d.months.map(() => f.target);

  const validPerf = perfLine.filter(v => v !== null && isFinite(v));
  const maxVal = Math.max(...validPerf, f.target), minVal = Math.min(...validPerf, f.target);
  const yRateMax = (Math.ceil(maxVal*10)/10)+0.1, yRateMin = Math.max(0,(Math.floor(minVal*10)/10)-0.1);

  if (chartInstance) {
    chartInstance.data.labels = d.months;
    chartInstance.data.datasets[0].data = collectionPct;
    chartInstance.data.datasets[1].data = targetLine;
    chartInstance.data.datasets[2].data = perfLine;
    chartInstance.options.scales.yRate.max = yRateMax;
    chartInstance.options.scales.yRate.min = yRateMin;
    chartInstance.update();
  } else {
    const canvas = document.getElementById('mainChart');
    canvas.width = canvas.parentElement.offsetWidth; canvas.height = 220;
    chartInstance = new Chart(canvas.getContext('2d'), {
      data: { labels: d.months, datasets: [
        { type:'bar',  label:'Collection %', data:collectionPct, backgroundColor:'rgba(174,235,89,0.9)', order:2, yAxisID:'yCollection', barPercentage:0.8, categoryPercentage:0.85 },
        { type:'line', label:'Target',       data:targetLine,    borderColor:'#FF7F00', borderDash:[5,3], borderWidth:1.5, pointRadius:0, order:0, yAxisID:'yRate', tension:0 },
        { type:'line', label:'Performance',  data:perfLine,      borderColor:'#242424', borderWidth:1.5, pointRadius:2, pointBackgroundColor:'#242424', pointBorderColor:'#F7F7F7', pointBorderWidth:1, order:1, yAxisID:'yRate', tension:0.3, spanGaps:false }
      ]},
      options: {
        responsive:false, maintainAspectRatio:false, animation:{duration:350},
        interaction:{mode:'index',intersect:false},
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#fff', borderColor:'#e0e0e0', borderWidth:1, titleColor:'#999', bodyColor:'#242424', titleFont:{family:'Inter',size:10}, bodyFont:{family:'Inter',size:10}, callbacks:{label(ctx){return ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}`;}} } },
        scales:{
          x:{grid:{color:'#ebebeb'},ticks:{color:'#999',font:{family:'Inter',size:9}},border:{color:'#e0e0e0'}},
          yCollection:{position:'right',min:0,max:1,grid:{display:false},ticks:{color:'#999',font:{family:'Inter',size:9},callback:v=>Math.round(v*100)+'%'},border:{color:'#e0e0e0'}},
          yRate:{position:'left',min:yRateMin,max:yRateMax,grid:{color:'#ebebeb'},ticks:{stepSize:0.1,color:'#999',font:{family:'Inter',size:9},callback:v=>Math.round(v*100)+'%'},border:{color:'#e0e0e0'}}
        }
      }
    });
  }

  const pillars = [
    {label:'ABI Mainstream',     billed:d.abiMainBilled, cash:d.abiMainCash, rev:d.abiMainRev, target:d.abiMainTarget},
    {label:'ABI Prestige',       billed:d.abiPresBilled, cash:d.abiPresCash, rev:d.abiPresRev, target:d.abiPresTarget},
    {label:'Non-ABI Mainstream', billed:d.nonMainBilled, cash:d.nonMainCash, rev:d.nonMainRev, target:d.nonMainTarget},
    {label:'Non-ABI Prestige',   billed:d.nonPresBilled, cash:d.nonPresCash, rev:d.nonPresRev, target:d.nonPresTarget},
  ];
  const grid = document.getElementById('pillar-grid');
  grid.innerHTML = '';
  pillars.forEach(p => {
    const lb=last(p.billed), lc=last(p.cash), lr=last(p.rev);
    const perf=lr>0?lc/lr:0, vari=perf-p.target, isUp=vari>=0;
    const card = document.createElement('div');
    card.className = 'pillar-card';
    card.innerHTML = `
      <div class="pillar-name">${p.label}</div>
      <div class="progress-labels"><span>${fmt(lc)} collected</span><span>${fmt(lb)} billed</span></div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(perf*100,100).toFixed(1)}%"></div>
        <div class="target-marker" style="left:${Math.min(p.target*100,100).toFixed(1)}%"></div>
      </div>
      <div class="pillar-stats">
        <div><div class="pstat-val">${fmtPct(perf)}</div><div class="pstat-lbl">Performance</div></div>
        <div><div class="pstat-val">${fmtPct(p.target)}</div><div class="pstat-lbl">Target</div></div>
        <div><div class="pstat-val ${isUp?'pos':'neg'}">${isUp?'▲':'▼'} ${(Math.abs(vari)*100).toFixed(1)}%</div><div class="pstat-lbl">Variance</div></div>
      </div>`;
    grid.appendChild(card);
  });
}

function init() {
  ALL_DATA = parseData();
  FY_LIST  = Object.keys(ALL_DATA).sort();
  if (!FY_LIST.length) { document.getElementById('pillar-grid').innerHTML = '<div class="no-data">Waiting for data...</div>'; return; }
  currentFY = FY_LIST[FY_LIST.length-1];
  buildFYSelector();
  updateChart();
}

// Load Chart.js then init
const s = document.createElement('script');
s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
s.onload = init;
document.head.appendChild(s);

})();
