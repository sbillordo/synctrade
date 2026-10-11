// HTML page rendered inside a WebView (iOS) or an iframe (web). It exposes window.render(payload).
// Lightweight Charts 4.2: candles + fib levels + swing POC + all-time POC + open gaps + long-position
// projection (green target box, red stop box, like TradingView's position tool) + RSI and EWO panes.
import type { Chart } from './api';
import type { Colors } from './theme';

export type ChartPayload = {
  chart: Chart;
  colors: Colors;
  histPoc: number | null;
  showHistPoc: boolean;
  position: null | { entry: number; stop: number; tp: number; targetLabel: string; stopLabel: string; entryLabel: string };
};

export const CHART_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
  #wrap{display:flex;flex-direction:column;height:100%}
  #main{flex:1;min-height:0}
  .lbl{display:flex;justify-content:space-between;padding:6px 12px 0;font-size:11px;font-weight:600;letter-spacing:.04em}
  .pane{height:78px}
</style>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
</head><body><div id="wrap"><div id="main"></div>
<div class="lbl" id="l-rsi"><span>RSI 14</span><span id="v-rsi"></span></div><div class="pane" id="rsi"></div>
<div class="lbl" id="l-ewo"><span>EWO 5/35</span><span id="v-ewo"></span></div><div class="pane" id="ewo"></div></div>
<script>
(function(){
  var charts = [];
  function boxes(chart, series, list){
    var view = { zOrder: function(){ return 'bottom'; }, renderer: function(){ return { draw: function(target){
      target.useBitmapCoordinateSpace(function(scope){
        var ctx = scope.context, hr = scope.horizontalPixelRatio, vr = scope.verticalPixelRatio, ts = chart.timeScale();
        list.forEach(function(b){
          var x1 = ts.logicalToCoordinate(b.l1), x2 = ts.logicalToCoordinate(b.l2);
          var y1 = series.priceToCoordinate(b.p1), y2 = series.priceToCoordinate(b.p2);
          if (x1 == null || x2 == null || y1 == null || y2 == null) return;
          var left = Math.min(x1, x2), top = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
          ctx.fillStyle = b.fill; ctx.fillRect(left * hr, top * vr, w * hr, Math.max(h, 1) * vr);
          if (b.edge) { ctx.fillStyle = b.edge; ctx.fillRect(left * hr, (b.edgeTop ? top : top + h - 1) * vr, w * hr, Math.max(1, vr)); }
          if (b.label) {
            // one or two lines, kept inside the visible part of the box
            ctx.fillStyle = b.labelColor; ctx.font = '600 ' + Math.round(11 * vr) + 'px -apple-system,system-ui,sans-serif';
            var lines = String(b.label).split('\\n'), lx = Math.max(left, 0) + 6;
            lines.forEach(function(line, k){
              var ty = b.labelTop ? top + 14 + k * 13 : top + h - 6 - (lines.length - 1 - k) * 13;
              ctx.fillText(line, lx * hr, ty * vr);
            });
          }
        });
      });
    } }; } };
    series.attachPrimitive({ updateAllViews: function(){}, paneViews: function(){ return [view]; } });
  }
  window.render = function(p){
    charts.forEach(function(c){ c.remove(); }); charts = [];
    var LC = window.LightweightCharts, C = p.colors, ch = p.chart, res = ch.result, pos = p.position;
    if (!LC) { document.getElementById('main').innerHTML = '<p style="color:' + C.ink2 + ';padding:16px">Chart library could not load. Check the connection.</p>'; return; }
    document.querySelectorAll('.lbl').forEach(function(el){ el.style.color = C.ink2; el.style.borderTop = '1px solid ' + C.hairline; });
    var intraday = ch.tf !== '1d';
    function make(el, extra){
      return LC.createChart(el, Object.assign({
        autoSize: true,
        layout: { background: { type: 'solid', color: C.surface }, textColor: C.ink2, fontFamily: '-apple-system,system-ui,sans-serif', fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: C.hairline } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
        crosshair: { mode: LC.CrosshairMode.Normal },
        localization: { locale: 'en-US', dateFormat: "dd MMM 'yy" },
        handleScale: { axisPressedMouseMove: false }
      }, extra || {}));
    }
    var main = make(document.getElementById('main'));
    var candles = main.addCandlestickSeries({
      upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false,
      autoscaleInfoProvider: function(orig){
        var r = orig(); if (!r || !pos) return r;
        return { priceRange: { minValue: Math.min(r.priceRange.minValue, pos.stop), maxValue: Math.max(r.priceRange.maxValue, pos.tp) }, margins: r.margins };
      }
    });
    candles.setData(ch.candles);
    // a phone reads ~110 bars; with the position on, the box gets room to the right of the last bar
    var last = ch.candles.length - 1, lastClose = ch.candles[last].close, shown = [lastClose];
    var BARS = 100, AHEAD = pos ? 55 : 4;
    function room(price){ var ok = shown.every(function(q){ return Math.abs(price - q) / lastClose > 0.012; }); if (ok) shown.push(price); return ok; }
    var list = [];
    if (res) {
      candles.createPriceLine({ price: res.poc, color: C.warn, lineWidth: 2, lineStyle: LC.LineStyle.Solid, axisLabelVisible: room(res.poc), title: '' });
      var lvl = res.levels[String(res.fib)], lvlTag = room(lvl);
      Object.keys(res.levels).forEach(function(r){
        var target = Number(r) === res.fib;
        candles.createPriceLine({ price: res.levels[r], color: target ? C.accent : C.ink3, lineWidth: target ? 2 : 1,
          lineStyle: target ? LC.LineStyle.Solid : LC.LineStyle.Dashed, axisLabelVisible: target && lvlTag, title: '' });
      });
      if (ch.swing) {
        var m = [{ time: ch.swing.low.time, position: 'belowBar', color: C.ink, shape: 'arrowUp', text: 'Swing low' },
                 { time: ch.swing.high.time, position: 'aboveBar', color: C.ink, shape: 'arrowDown', text: 'Swing high' }]
          .filter(function(x){ return ch.candles.some(function(c){ return c.time === x.time; }); });
        m.sort(function(a, b){ return a.time < b.time ? -1 : 1; });
        candles.setMarkers(m);
      }
      (ch.gaps || []).forEach(function(g){
        var i = ch.candles.findIndex(function(c){ return c.time === g.time; });
        if (i < 0) i = 0;
        list.push({ l1: i, l2: last + AHEAD, p1: g.bottom, p2: g.top, fill: C.downSoft, label: 'Open gap', labelColor: C.down, labelTop: true });
      });
    }
    if (p.showHistPoc && p.histPoc) candles.createPriceLine({ price: p.histPoc, color: C.warn, lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: room(p.histPoc), title: 'All-time POC' });
    if (pos) {
      list.push({ l1: last, l2: last + AHEAD, p1: pos.entry, p2: pos.tp, fill: C.upSoft, edge: C.up, edgeTop: true, label: pos.targetLabel, labelColor: C.up, labelTop: true });
      list.push({ l1: last, l2: last + AHEAD, p1: pos.stop, p2: pos.entry, fill: C.downSoft, edge: C.down, edgeTop: false, label: pos.stopLabel, labelColor: C.down, labelTop: false });
      candles.createPriceLine({ price: pos.entry, color: C.ink2, lineWidth: 1, lineStyle: LC.LineStyle.Solid, axisLabelVisible: false, title: pos.entryLabel });
    }
    if (list.length) boxes(main, candles, list);

    var small = { timeScale: { visible: false, borderVisible: false, rightOffset: 4 }, rightPriceScale: { borderVisible: false, scaleMargins: { top: .12, bottom: .08 } } };
    var rsiC = make(document.getElementById('rsi'), small);
    var rsiS = rsiC.addLineSeries({ color: C.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    rsiS.setData(ch.rsi);
    [[30, C.down, true], [35, C.ink3, false], [50, C.hairlineStrong, false]].forEach(function(x){
      rsiS.createPriceLine({ price: x[0], color: x[1], lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: x[2], title: '' });
    });
    var ewoC = make(document.getElementById('ewo'), small);
    var ewoS = ewoC.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    ewoS.setData(ch.ewo.map(function(x){ return { time: x.time, value: x.value, color: x.value >= 0 ? C.up : C.down }; }));
    document.getElementById('v-rsi').textContent = res ? res.rsi.toFixed(1) : '';
    document.getElementById('v-ewo').textContent = res ? (res.ewo < 0 ? '−' : '') + Math.abs(res.ewo).toFixed(2) : '';
    charts = [main, rsiC, ewoC];
    var syncing = false;
    charts.forEach(function(c){ c.timeScale().subscribeVisibleLogicalRangeChange(function(r){
      if (syncing || !r) return; syncing = true;
      charts.forEach(function(o){ if (o !== c) o.timeScale().setVisibleLogicalRange(r); }); syncing = false;
    }); });
    main.timeScale().setVisibleLogicalRange({ from: Math.max(0, last - BARS), to: last + AHEAD });
  };
})();
</script></body></html>`;
