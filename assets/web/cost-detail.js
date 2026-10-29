/* Cost review surface. Research snapshots remain immutable; decisions are saved separately. */
window.CostDetail = (() => {
  'use strict';
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bound = (value, upper = false) => {
    const digits = value !== 0 && Math.abs(value) < 1 ? Math.max(4, 1 - Math.floor(Math.log10(Math.abs(value)))) : 2;
    const fractionDigits = digits > 100 ? 4 : digits;
    return new Intl.NumberFormat('zh-CN', {minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, notation: digits > 100 ? 'scientific' : 'standard', roundingMode: upper ? 'ceil' : 'floor'}).format(value === 0 ? 0 : value);
  };
  const exactNumber = value => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 6}).format(value);
  const safeURL = value => window.CostOffline ? window.CostOffline.url(value) : typeof value === 'string' && (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) ? value : '';
  const link = (url, text, css = '') => safeURL(url) ? `<a class="${h(css)}" href="${h(safeURL(url))}" target="_blank" rel="noopener noreferrer">${h(text)} <span aria-hidden="true">↗</span></a>` : h(text);
  const localLink = (path, text) => typeof path === 'string' && path && !/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(path) && !path.split(/[\\/]/).includes('..') ? link('/' + path, text) : '';
  const plain = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(plain).join('；') : value && typeof value === 'object' ? Object.entries(value).map(([key, val]) => `${key}：${plain(val)}`).join('；') : String(value ?? '');
  const reviewText = value => plain(value)
    .replaceAll('estimate.low/high、usagePerProduct、perProductEstimate均null','目标金额与每台用量暂未形成')
    .replaceAll('estimate.low/high与perProductEstimate均null','目标单价与每台金额暂未形成')
    .replaceAll('estimate.low/high=null','目标金额暂未形成')
    .replaceAll('comparisonGate=needs_review','对标条件待审核').replaceAll('weak/needs_review','弱对标、待审核')
    .replaceAll('coverage=complete','费用范围完整').replaceAll('active=false、status=unverified、costBoundary=pending','未采用、待核状态')
    .replaceAll('inferred、active=true','推断、已采用状态').replaceAll('active/status','采用状态').replaceAll('active=false和pending','未采用及待核状态')
    .replaceAll('null不是0','未形成金额不等于零').replaceAll('保持null待审','留空待审');
  const evidenceLabels = {
    weeklyCapacity:'周产能（件）',TT_UPH:'转盘式产能（件/小时）',TT_UVSeconds:'UV曝光（秒）',TT_startupSecondsLessThan:'启动时间上限（秒）',TT_fpsGreaterThan:'帧率下限',SmartProcessSecondsLessThan:'Smart工序时间上限（秒）',
    Hongjing_AA_CNY:'弘景AA设备单价（元）',Hongjing_quantity:'采购台数',Hongjing_prior_CNY:'弘景此前单价（元）',Shangfu_single_head_CNY:'上富单头设备价（元）',Tongxingda_four_station_CNY:'同兴达四工位设备价（元）',Haon_AEI_CNY:'豪恩AEI设备价（元）',
    finalCureTemperatureC:'最终固化温度（℃）',linearShrinkageLessThanPercent:'线性收缩率上限（%）',FOV_minDegrees:'最小视场（°）',FOV_maxDegrees:'最大视场（°）',collimatorCameraOptions:'准直仪数量选项',
    AD4950_30g_EUR:'AD4950胶30g包装价（EUR）',AD4950_600g_EUR:'AD4950胶600g包装价（EUR）',referenceConvertedCNYperGram:'参考折合（元/g）',packGrams:'包装质量（g）',listedUSD:'包装标价（USD）',USD_per_g:'单克价格（USD/g）',
    annualWageCNY:'统计年工资（元）',assumedHourlyLowCNY:'假设综合工时费下限（元/小时）',assumedHourlyHighCNY:'假设综合工时费上限（元/小时）',EUR_CNY:'人民币/欧元',EUR_USD:'美元/欧元',USD_CNY:'人民币/美元',rateDate:'汇率日期',
    HFOVdegrees:'水平视场（°）',EFLmm:'焦距（mm）',Fnumber:'光圈F数',widthMm:'宽度（mm）',lengthMm:'长度（mm）',fpsMax:'最高帧率',resolution:'分辨率',fps:'帧率',rawBits:'RAW位深',pocVoltage:'PoC电压（V）',hfovDegrees:'水平视场（°）',focusDistanceM:'对焦距离（m）',
    mtfMeasurementSecondsUpper:'MTF测量时间上限（秒）',chartMeasurementSecondsUpper:'图卡测量时间上限（秒）',particleDefectMeasurementSecondsUpper:'颗粒缺陷测量上限（秒）',shadingMeasurementSecondsUpper:'阴影测量上限（秒）',focusMeasurementSecondsUpper:'对焦测量上限（秒）',rdMeasurementSeconds:'研发测量时间（秒）',focusOemImageQualitySeconds:'OEM图像质量检测（秒）',
    manufacturingProductionAnnualWageCNY:'制造业生产人员年工资（元）',manufacturing_production_workers_annual_wage_CNY:'制造业生产人员年工资（元）',year:'统计年份',publicPriceUSD:'公开价格范围（USD）',onePortUsbStartingPriceUSD:'单口USB采集器起价（USD）',jetsonNanoNxKitStartingPriceUSD:'Nano/NX套件起价（USD）',agxOrinKitStartingPriceUSD:'AGX Orin套件起价（USD）',
    advertisedModulesPerWeekUpper:'宣传周产能上限（件）',labBookingUSD:'实验室预约价（USD）',bookingHours:'预约时长（小时）',automotiveRawReportUSD:'汽车RAW报告价（USD）',fullP2020ReportUSD:'完整P2020报告价（USD）',
    pressure_kPa:'测试压力（kPa）',fill_s:'充气时间（秒）',stabilization_s:'稳定时间（秒）',test_s:'检测时间（秒）',reported_test_s:'案例所列合计时间（秒）',programs:'程序数量',
    '2019_average_equipment_price_CNY':'2019年设备平均单价（元）','2018_average_equipment_price_CNY':'2018年设备平均单价（元）','2017_average_equipment_price_CNY':'2017年设备平均单价（元）',advertised_starting_price_CNY:'宣传起价（元）',advertised_fastest_result_s:'宣传最快检测（秒）',channels:'通道数选项'
  };
  const evidenceText = value => typeof value === 'number' ? exactNumber(value) : Array.isArray(value) ? value.map(evidenceText).join(' / ') : value && typeof value === 'object' ? Object.entries(value).map(([k,v])=>`${evidenceLabels[k]||k}：${evidenceText(v)}`).join('；') : String(value??'');
  const clip = (value, length = 145) => { const s = plain(value); return s.length > length ? s.slice(0, length).replace(/[，；、\s]+$/, '') + '…' : s; };
  const cleanName = name => String(name ?? '').replace(/（[^）]*(?:待核|待确认|未验证|未确认)[^）]*）/g, '');
  const amount = estimate => estimate && Number.isFinite(estimate.low) && Number.isFinite(estimate.high) ? `${bound(estimate.low)} <span>–</span> ${bound(estimate.high, true)}` : '待审核';
  const tierQuantity = tier => tier.minQty != null ? (tier.maxQty != null && tier.maxQty !== tier.minQty ? `${exactNumber(tier.minQty)}–${exactNumber(tier.maxQty)}` : tier.maxQty === tier.minQty ? `${exactNumber(tier.minQty)}` : `${exactNumber(tier.minQty)}+`) : tier.maxQty != null ? `不超过 ${exactNumber(tier.maxQty)}` : '数量未标明';
  const tierPrice = tier => Number.isFinite(tier.unitPrice) ? exactNumber(tier.unitPrice) : Number.isFinite(tier.unitPriceLow) && Number.isFinite(tier.unitPriceHigh) ? `${exactNumber(tier.unitPriceLow)}–${exactNumber(tier.unitPriceHigh)}` : '未标价';
  const sourceEvidence = row => row.evidenceLevel === 'page' ? '原页面已核验' : /search|index/.test(row.evidenceLevel || '') ? '含检索摘要，详情见依据' : '公开资料，核验情况见依据';
  const lastTier = row => (row.tiers || []).reduce((selected, tier) => !selected || (tier.minQty ?? 0) > (selected.minQty ?? 0) ? tier : selected, null);
  const endpointLabel = value => ({low:'区间下限', high:'区间上限', both:'区间上下限', reference:'补充参照'}[value] || '报价参照');
  const relationLabel = value => ({actual_supplier:'实际供应商取价', exact_model:'同型号取价', equivalent:'同类参照', weak:'可比性待核', model:'成本模型'}[value] || '取价关系见依据');
  const quoteKindLabel = value => ({actual_quote:'目标实报价', reference_quote:'参照报价', model_parameter:'模型参数价'}[value] || '价格性质见依据');
  const quoteDate = row => row.refreshedOn || row.verifiedOn ? `复核 ${row.refreshedOn || row.verifiedOn}` : row.capturedOn ? `采集 ${row.capturedOn}` : '日期未注明';
  const list = values => (values || []).length ? `<ul class="cd-list">${values.map(x => `<li>${h(plain(x))}</li>`).join('')}</ul>` : '';
  let project = null, data = null, callbacks = {}, dialog = null, currentId = null, trigger = null, loading = 0;
  const drafts = new Map();
  const staleDrafts = new Map();
  const itemFor = id => data?.items?.find(item => item.nodeId === id);

  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'cost-dialog';
    dialog.setAttribute('aria-labelledby', 'cd-title');
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); }
      const action = event.target.closest('[data-cd-action]');
      if (!action) return;
      const type = action.dataset.cdAction;
      if (type === 'close') close();
      if (type === 'edit') { const id = currentId; close(); callbacks.onEdit?.(id); }
      if (type === 'next' || type === 'prev') { const i = data.items.findIndex(x => x.nodeId === currentId); const next = data.items[i + (type === 'next' ? 1 : -1)]; if (next) open(next.nodeId); }
      if (type === 'save') save();
      if (type === 'price-jump') dialog.querySelector('#cd-prices')?.scrollIntoView({block:'start', behavior:'smooth'});
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('input', rememberDraft);
    dialog.addEventListener('change', rememberDraft);
  }

  async function load(value, options = {}) {
    const generation = ++loading;
    project = typeof value === 'string' ? {id:value} : value;
    callbacks = options;
    data = null;
    if (!project?.id) return null;
    const response = await fetch('/api/project-costs/' + encodeURIComponent(project.id));
    const result = await response.json();
    if (generation !== loading) return null;
    if (!response.ok) throw Error(result.error || '成本资料暂时无法载入');
    data = result;
    return data;
  }

  function benchmark(item) {
    const raw = item.raw || {};
    const targetGroups = new Map();
    (raw.targets || []).forEach(target => {
      const key = [target.model, target.maker, target.comparability, target.reason].join('|');
      if (!targetGroups.has(key)) targetGroups.set(key, {...target, sources:[...(target.sources || [])]});
      else { const prior=targetGroups.get(key); prior.differences=[...new Set([plain(prior.differences),plain(target.differences)])].filter(Boolean).join('；'); (target.sources || []).forEach(source=>{if(!prior.sources.some(s=>s.url===source.url))prior.sources.push(source);}); }
    });
    const targets = [...targetGroups.values()];
    if (!targets.length || item.domain === 'process') return '';
    const parameter = targets.every(t => t.comparability === 'model_parameter');
    const content = `<div class="cd-targets">${targets.map(t => {
      const labels = {exact:'准确基型号', equivalent:'同类功能与价值', weak:'可比性待审核', model_parameter:'费用模型参数'};
      return `<article class="cd-target"><div class="cd-target-top"><span class="cd-tag ${t.comparability === 'weak' ? 'cd-amber' : ''}">${h(labels[t.comparability] || '参考对象')}</span></div><h4>${h(t.model)}</h4><p class="cd-maker">${h(t.maker)}</p><p><b>${parameter ? '采用理由' : '可比理由'}</b> ${h(clip(t.reason, 160))}</p>${t.differences ? `<p class="cd-target-difference"><b>关键差异</b> ${h(clip(t.differences, 155))}</p>` : ''}<details class="cd-inline-detail"><summary>完整比对与依据</summary><p>${h(t.reason)}</p>${t.differences ? `<p>${h(t.differences)}</p>` : ''}<div class="cd-links">${(t.sources || []).map(s => link(s.url, s.title)).join('')}</div></details></article>`;
    }).join('')}</div>`;
    return parameter ? `<details class="cd-audit cd-coefficients"><summary>系数的取价对象与适用条件 · ${targets.length} 项</summary>${content}</details>` : `<section class="cd-section"><div class="cd-section-title"><h3>取价对象与对标依据</h3><span>先核对可比性，再看价格</span></div>${content}</section>`;
  }

  function offerTerms(row) {
    const labels = {taxIncluded:'是否含税', shippingIncluded:'是否含运费', tariff:'关税', scopeNote:'适用说明', quotedOn:'资料日期', priceNature:'价格性质', quantity:'数量口径', packaging:'包装', stockLeadTime:'库存与交期', taxFreight:'税运', bodySnapshotQuantity:'正文库存快照', otherSearchSnapshotQuantity:'其他缓存库存', currentAvailabilityConfirmed:'实时供货已核实', note:'说明', available:'页面可订购', exactLiveQty:'实时数量', cachedPageQty:'缓存数量', cachedPageQtyIsLive:'缓存量是否为实时量'};
    const describe = value => value == null ? '未核实' : typeof value === 'boolean' ? (value ? '是' : '否') : Array.isArray(value) ? value.map(describe).join('；') : typeof value === 'object' ? Object.entries(value).map(([key,v]) => `${labels[key] || key}：${describe(v)}`).join('；') : String(value);
    const fields = [
      ['包装', row.packaging], ['标准包装数量', row.standardPackageQuantity ?? row.standardPackageQuantityAsListed ?? row.standardReelQuantity],
      ['起订量', row.minimumOrderQuantity ?? row.moq], ['订购倍数', row.orderMultiple],
      ['库存', row.stock ?? row.stockDisplayed ?? row.inventory ?? row.availability], ['库存日期说明', row.stockDateNote],
      ['交期', row.leadTime ?? row.leadTimeDisplayed ?? (row.standardLeadTimeWeeks != null ? `${typeof row.standardLeadTimeWeeks === 'object' ? `${row.standardLeadTimeWeeks.low ?? '?'}–${row.standardLeadTimeWeeks.high ?? '?'}` : row.standardLeadTimeWeeks} 周` : null)],
      ['税运条件', row.taxAndShipping ?? row.taxAndFreight ?? row.taxShipping ?? row.taxTreatment], ['运费', row.shippingTreatment],
      ['交易条件', row.transactionConditions], ['原资料日期', row.sourceDate ?? row.originalPricePeriod],
      ['供货地依据', row.regionBasis], ['批次标识', row.dateCodeAdvertised], ['定制烧录', row.includesCustomProgramming],
      ['适用条件', row.terms ?? row.limitations ?? row.note], ['本次取舍', row.analysisUseReason]
    ].filter(([,value]) => value != null && value !== '');
    const fx = row.fxConversion;
    const converted = fx?.tiers?.length ? fx.tiers.reduce((a,b) => (b.minQty ?? -1) > (a.minQty ?? -1) ? b : a) : row.terminalConversion;
    if (converted && Number.isFinite(converted.convertedUnitPrice)) {
      const currency = converted.currency === 'CNY' ? 'CNY' : converted.convertedCurrency || fx?.toCurrency;
      fields.push(['末档换算', `${converted.minQty != null ? `${exactNumber(converted.minQty)}+` : '数量档未披露'}：${exactNumber(converted.convertedUnitPrice)} ${currency || '币种见依据'} / ${converted.unit || '件'}；汇率日期 ${fx?.date || converted.rateDate || '见依据'}。${fx?.purpose || '换算不改变报价的采用状态。'}`]);
    }
    if (!fields.length) return '';
    const urls = fx?.rateSourceUrls || converted?.rateSourceUrls || [];
    return `<details class="cd-inline-detail"><summary>供货、税运与换算条件</summary>${fields.map(([label,value]) => `<p><b>${h(label)}</b> ${h(describe(value))}</p>`).join('')}${urls.length ? `<div class="cd-links">${urls.map((url,i) => link(url, `汇率依据 ${i+1}`)).join('')}</div>` : ''}</details>`;
  }

  function sourceOffers(row, point = null) {
    const tiers = row.tiers || [];
    return `<article class="cd-offer"><div class="cd-offer-title"><strong>${h(row.name)}</strong>${link(row.url, '查看原价')}</div>${row.quoteKind ? `<span class="cd-tag">${h(quoteKindLabel(row.quoteKind))}</span>` : ''}${point ? `<span class="cd-tag ${point.endpoint === 'reference' ? '' : 'cd-endpoint'}">${h(endpointLabel(point.endpoint))} · 已选公开末档</span>` : ''}<p>${h(row.scope)}</p><p class="cd-offer-price">${h(row.priceText)}</p>${tiers.length ? `<div class="cd-tiers">${tiers.map(t => `<div><span><b>${h(tierQuantity(t))} ${h(t.unit || '件')}</b>${t.quantityBasis ? `<small>${h(t.quantityBasis)}</small>` : ''}</span><strong>${h(tierPrice(t))} ${h(t.currency)} / ${h(t.unit)}</strong></div>`).join('')}</div>` : ''}<div class="cd-source-meta"><span>${h(row.seller)}</span><span>${h(row.regionDetail || ({china:'中国', non_china:'中国以外'})[row.regionGroup] || row.regionGroup)}</span><span>${h(quoteDate(row))}</span>${(row.refreshedOn || row.verifiedOn) && row.capturedOn ? `<span>原采集 ${h(row.capturedOn)}</span>` : ''}<span>${h(sourceEvidence(row))}</span></div>${row.qualityTags?.length ? `<div class="cd-tags">${row.qualityTags.map(tag => `<span class="cd-tag">${h(tag)}</span>`).join('')}</div>` : ''}${row.qualityConditions ? `<p><b>品质与供货条件</b> ${h(plain(row.qualityConditions))}</p>` : ''}${offerTerms(row)}</article>`;
  }

  function purchaseSources(item) {
    const prices = item.raw?.prices || [];
    if (!prices.length) return '';
    return `<section class="cd-section" id="cd-prices"><div class="cd-section-title"><h3>价格来源</h3><span>保留原始币种和实际数量条件</span></div>${['china', 'non_china'].map(region => {
      const groups = new Map();
      prices.filter(p => p.regionGroup === region).forEach(p => { const key = p.sourceKey || p.seller || p.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
      if (!groups.size) return '';
      return `<div class="cd-region-label">${region === 'china' ? '中国' : '中国以外'} <span>${groups.size} 个独立报价源</span></div><div class="cd-source-list">${[...groups.values()].map(rows => {
        const first = rows[0];
        const usages = new Set(rows.map(r => r.usage));
        const badge = usages.has('estimate') ? '估价依据' : usages.has('parameter') ? '模型参数' : '仅供参照';
        const points = (item.estimate.pricePoints || []).filter(point => rows.some(row => row.id === point.priceId));
        const selected = points.find(point => ['low','high','both'].includes(point.endpoint)) || points[0];
        const best = rows.find(r => r.id === selected?.priceId) || rows.find(r => r.usage === 'estimate') || rows.find(r => r.usage === 'parameter') || first;
        const tier = selected ? best.tiers?.[selected.tierIndex] || lastTier(best) : lastTier(best);
        const compactPrice = tier?.minQty == null && tier?.maxQty == null ? clip(best.priceText, 82) : tier && Number.isFinite(tier.unitPrice) ? `${exactNumber(tier.unitPrice)} ${tier.currency} / ${tier.unit} · ${tierQuantity(tier)} ${tier.unit}` : clip(best.priceText, 82);
        const groupEndpoints = [...new Set(points.filter(point => ['low','high','both'].includes(point.endpoint)).map(point => endpointLabel(point.endpoint)))];
        const priceRole = groupEndpoints.length > 1 ? '含区间上下限来源' : groupEndpoints.length ? groupEndpoints[0] : badge;
        return `<details class="cd-price-source"><summary><div class="cd-source-who"><strong>${h(first.seller)}</strong><span>${h(clip(best.name, 62))}</span></div><div class="cd-source-price"><strong>${h(compactPrice)}</strong><span>${h(priceRole)} · ${h(sourceEvidence(best))}${rows.length > 1 ? ` · ${rows.length} 条记录` : ''}</span></div><span class="cd-expand" aria-hidden="true">＋</span></summary><div class="cd-source-expanded">${rows.map(row => sourceOffers(row, points.find(point => point.priceId === row.id))).join('')}</div></details>`;
      }).join('')}</div>`;
    }).join('')}<p class="cd-footnote">同一企业的多个页面合并展示。原始报价的税费、包装、库存及数量约束仍适用。</p></section>`;
  }

  function priceSelection(item) {
    const referenceOnly = !Number.isFinite(item.estimate?.low) || !Number.isFinite(item.estimate?.high);
    const inputs = item.estimate?.pricePoints?.length ? item.estimate.pricePoints : item.estimate?.referenceTerminalPoints || [];
    const points = inputs.map(point => {
      const row = item.raw?.prices?.find(price => price.id === point.priceId);
      const tier = row?.tiers?.[point.tierIndex] || row?.tiers?.find(t => t.minQty === point.minQty && t.currency === point.currency) || {};
      const convertedPrice = point.convertedPrice ?? point.convertedUnitPrice;
      const matches = side => !referenceOnly && Number.isFinite(item.estimate[side]) && Math.abs(convertedPrice - item.estimate[side]) < 1e-8;
      return {...tier, originalPrice:point.originalPrice ?? point.unitPrice ?? tier.unitPrice, ...point, convertedPrice, endpoint:referenceOnly ? 'reference' : point.endpoint || (matches('low') && matches('high') ? 'both' : matches('low') ? 'low' : matches('high') ? 'high' : 'reference')};
    });
    if (!points.length) return '';
    if (data.currentStudy && item.estimate.quantityStrategy !== 'published_terminal_tier') return '';
    return `<details class="cd-audit cd-price-selection"><summary>${referenceOnly ? '参照报价换算' : '区间端点如何选取'} · ${points.length} 条末档报价</summary><p class="cd-footnote">每条报价采用其公开最高数量门槛阶梯；不同来源的数量、包装和供货条件仍分别保留，不代表已取得统一批量的成交价。${referenceOnly ? '这些金额仅供参照，不构成目标件成本，不合并不同型号的极值。' : ''}</p>${item.estimate.formula ? `<p class="cd-formula">${h(item.estimate.formula)}</p>` : ''}<div class="cd-selected-points">${points.map(point => {
      const row = item.raw?.prices?.find(price => price.id === point.priceId);
      const unit = row?.tiers?.[point.tierIndex]?.unit || item.estimate.unit;
      const expression = Number.isFinite(point.originalPrice) && Number.isFinite(point.convertedPrice) ? `${exactNumber(point.originalPrice)} ${point.currency}${point.currency !== item.estimate.currency || point.conversionRate !== 1 ? ` × ${exactNumber(point.conversionRate)}` : ''} = ${exactNumber(point.convertedPrice)} ${item.estimate.currency} / ${unit}` : '换算详见来源';
      return `<article class="cd-selected-point"><div><strong>${h(row?.seller || point.priceId)}</strong><span class="cd-tag ${point.endpoint === 'reference' ? '' : 'cd-endpoint'}">${h(endpointLabel(point.endpoint))}</span></div><p class="cd-selected-quantity">原价档位 ${h(tierQuantity(point))} ${h(unit)} · ${h(row?.name || point.priceId)}</p><p class="cd-selected-math">${h(expression)}</p><p>${h(point.quantityBasis || point.scope || '')}</p><div class="cd-links">${(point.sourceUrls || (row?.url ? [row.url] : [])).map((url,i) => link(url, i === 0 ? '报价依据' : `报价依据 ${i + 1}`)).join('')}${(point.rateSourceUrls || []).map((url,i) => link(url, i === 0 ? '换算汇率依据' : `换算汇率依据 ${i + 1}`)).join('')}</div></article>`;
    }).join('')}</div></details>`;
  }

  function processSources(item) {
    const raw = item.raw || {};
    const all = raw.sources || [];
    const financial = all.filter(s => /price|listing|wage|purchase|labor|exchange_rate|cost|fee|disclosure/i.test(s.kind || '') && !/out_of_scope|noncomparable|rfq/i.test(s.kind || ''));
    const others = all.filter(s => !financial.includes(s));
    const render = source => `<details class="cd-price-source cd-process-source"><summary><div class="cd-source-who"><strong>${h(source.title)}</strong><span>${h(source.region || '地区见来源')}</span></div><div class="cd-source-price"><span>${h(clip(evidenceText(source.numericEvidence), 82))}</span></div><span class="cd-expand" aria-hidden="true">＋</span></summary><div class="cd-source-expanded"><p>${h(evidenceText(source.numericEvidence))}</p><p class="cd-footnote">${h(source.evidenceLevel)}${source.notes ? ' · ' + h(plain(source.notes)) : ''}</p>${link(source.url, '查看原始依据')}</div></details>`;
    return `<section class="cd-section" id="cd-prices"><div class="cd-section-title"><h3>费率与价格依据</h3><span>设备、工资及耗材资料</span></div><p class="cd-section-intro">本项未取得范围匹配的直接加工报价；以下资料用于构造制造成本。</p><div class="cd-source-list">${financial.map(render).join('')}</div>${others.length ? `<details class="cd-inline-detail cd-other-sources"><summary>技术资料与询价记录 · ${others.length} 条</summary>${others.map(render).join('')}</details>` : ''}</section>`;
  }

  function currentSources(item) {
    const raw = item.raw || {};
    const labels = {quote:'报价资料', model_parameter:'模型费率依据', technical:'技术与规格依据'};
    const kind = {conditional_model:'条件模型估计；公开价格、资源费率与工程假设分别保留。', purchase_reference:'公开采购参照；保留各来源的数量与交付条件。', supplier_quote:'本项实际报价，交付范围与报价条件仍适用。', unavailable:'尚无可采用金额；下列参照不自动计入目标成本。'}[item.estimate.kind];
    const groups = new Map();
    (raw.prices || []).forEach(row => {
      const region = ({china:'中国', non_china:'中国以外'})[row.regionGroup] || row.regionGroup || '供货地待核';
      const key = row.sourceKey || row.seller || row.name;
      if (!groups.has(key)) groups.set(key, {regions:new Set(), seller:row.seller || row.name, rows:[]});
      groups.get(key).regions.add(region);
      groups.get(key).rows.push(row);
    });
    const roleRank = group => group.rows.some(row => row.usage === 'estimate') ? 0 : group.rows.some(row => row.usage === 'parameter') ? 1 : 2;
    const offers = [...groups.values()].sort((a,b) => roleRank(a) - roleRank(b) || (a.regions.has('中国') ? 0 : 1) - (b.regions.has('中国') ? 0 : 1)).map(group => {
      const first = group.rows.find(row => row.usage === 'estimate') || group.rows[0], tier = lastTier(first);
      const quantity = tier && (tier.minQty != null || tier.maxQty != null) ? ` · ${tierQuantity(tier)} ${tier.unit}` : '';
      const price = tier ? `${tierPrice(tier)} ${tier.currency}/${tier.unit}${quantity}` : first.priceText;
      const kinds = [...new Set(group.rows.map(row => quoteKindLabel(row.quoteKind)))].join(' / ');
      const role = roleRank(group) === 0 ? '估价依据' : roleRank(group) === 1 ? '模型参数' : '仅供参照';
      return `<details class="cd-price-source"><summary><div class="cd-source-who"><strong>${h(group.seller)}</strong><span>${h([...group.regions].join(' / '))} · ${h(clip(first.name, 55))}</span></div><div class="cd-source-price"><strong>${h(price)}</strong><span>${h(role)} · ${h(kinds)} · ${h(quoteDate(first))}${group.rows.length > 1 ? ` · ${group.rows.length} 条记录` : ''}</span></div><span class="cd-expand" aria-hidden="true">＋</span></summary><div class="cd-source-expanded">${group.rows.map(row=>sourceOffers(row)).join('')}</div></details>`;
    }).join('');
    return `<section class="cd-section" id="cd-prices"><div class="cd-section-title"><h3>价格与依据</h3><span>同企业归并，参数价不等于目标报价</span></div><p>${h(kind)}</p>${offers}<details class="cd-inline-detail"><summary>完整资料、来源覆盖及取价说明 · ${(raw.sources || []).length}条</summary>${raw.coverageNote ? `<p>${h(raw.coverageNote)}</p>` : ''}<div class="cd-source-list">${(raw.sources || []).map(source => `<details class="cd-price-source"><summary><div class="cd-source-who"><strong>${h(source.title)}</strong><span>${h(labels[source.kind] || source.kind)}</span></div></summary><div class="cd-source-expanded"><p>${h(evidenceText(source.numericEvidence || source.notes || ''))}</p>${link(source.url, '查看来源')}</div></details>`).join('')}</div></details></section>`;
  }

  function pricingBasis(item, node) {
    if (!data.currentStudy) return '';
    const raw = item.raw || {}, identity = raw.identity, spread = raw.spreadAnalysis, gate = raw.comparisonGate;
    if (!identity && !spread && !gate) return '';
    const original = node.identification || item.nodeSnapshot?.identification;
    const gateLabel = {pass:'可比条件已通过', needs_review:'可比条件待审核', not_applicable:'不适用单品比对'}[gate?.status];
    const approval = gate?.humanApproval?.approved === true ? gate.humanApproval : null;
    const drivers = spread?.drivers || [];
    const classification=raw.classification;
    const classificationText=classification ? `${({commodity:"市场标准通用品",proprietary:"原厂专有商品",custom:"工艺定制包",unknown:"分类待核"})[classification.marketType] || "分类待核"} · ${classification.selfDeveloped === true ? "自研" : classification.selfDeveloped === false ? "非自研" : "自研状态未知"}` : "";
    return `<section class="cd-pricing-basis" aria-label="本次取价与价差依据">${classificationText ? `<p><strong>部件分类</strong>${h(classificationText)} · ${h(classification.basis)}</p>` : ''}${identity?.pricingObject ? `<div class="cd-pricing-object"><span>本次取价</span><strong>${h(identity.pricingObject)}</strong><span class="cd-tag ${identity.pricingRelation === 'weak' ? 'cd-amber' : ''}">${h(relationLabel(identity.pricingRelation))}</span></div>` : ''}${identity?.explanation ? `<p><strong>本次采用依据</strong>${h(clip(identity.explanation, 165))}</p>` : ''}${spread?.summary ? `<p><strong>为何有价差</strong>${h(clip(spread.summary, 180))}</p>` : ''}${gate?.status === 'needs_review' ? `<p class="cd-gate-note">${approval ? '可比性尚未闭合，金额按已记录的人工批准采用。' : '可比条件待审核，目标金额暂不采用。'}</p>` : ''}<details class="cd-inline-detail"><summary>展开采用理由与价差分析</summary>${identity ? `<p><b>实装信息</b> 型号：${h(identity.actualModel || '未确认')}；供应商：${h(identity.actualSupplier || '未确认')}</p><p>${h(identity.explanation)}</p>` : ''}${gateLabel ? `<p><b>${h(gateLabel)}</b> ${h(gate.reason)}</p>` : ''}${approval ? `<p><b>人工批准</b> ${h(approval.approvedBy)} · ${h(approval.approvedAt)} · ${h(approval.reason)}</p>` : ''}${spread?.primaryReason ? `<p><b>主要差异</b> ${h(spread.primaryReason)}</p>` : ''}${spread?.summary && spread.summary.length > 180 ? `<p>${h(spread.summary)}</p>` : ''}${drivers.length ? `<div class="cd-spread-drivers">${drivers.map(driver => `<article><div><strong>${h(driver.factor)}</strong><span class="cd-tag ${driver.status === 'unresolved' ? 'cd-amber' : ''}">${h({confirmed:'证据已确认', inferred:'推断', unresolved:'待核'}[driver.status] || '依据待核')}</span></div><p>${h(driver.explanation)}</p>${driver.impact ? `<p><b>价格影响</b> ${h(plain(driver.impact))}</p>` : ''}<div class="cd-links">${(driver.evidenceRefs || []).map(id => raw.sources?.find(source => source.id === id)).filter(Boolean).map(source => link(source.url, source.title)).join('')}</div></article>`).join('')}</div>` : ''}${spread?.unresolved?.length ? `<h4>仍未解释的差异</h4>${list(spread.unresolved)}` : ''}${spread?.followUp?.length ? `<h4>下一步核实</h4>${list(spread.followUp)}` : ''}${original?.referenceModel ? `<div class="cd-original-reference"><h4>第一步参考 · 拆解存档</h4><p>${h(original.referenceModel)}${original.referenceMaker ? ' · ' + h(original.referenceMaker) : ''}</p>${original.match ? `<p>${h(original.match)}</p>` : ''}<p class="cd-footnote">此处保留拆解阶段的参考；本次金额采用上方取价对象与依据。</p></div>` : ''}</details></section>`;
  }

  function researchRounds(item) {
    const rounds = item.raw?.researchRounds || [];
    if (!rounds.length) return '';
    return `<details class="cd-audit cd-research-rounds"><summary>分阶段提示词与结果 · ${rounds.length} 轮</summary><ol>${rounds.map((round, index) => `<li><span>${index + 1}. ${h(round.label || round.phase)}</span><div class="cd-links">${localLink(round.promptPath, '提示词')}${localLink(round.resultPath, '结果')}</div></li>`).join('')}</ol></details>`;
  }

  function productUsage(item) {
    if (!data.currentStudy) return '';
    const usage = item.usagePerProduct;
    const value = item.perProductEstimate;
    const partial = item.coverage?.status === 'partial';
    const coverage = partial ? `<p><strong>已估部分：</strong>${h(item.coverage.scopeText)}</p><p>未估范围不按零处理，完整金额待补。</p><details class="cd-inline-detail"><summary>查看具体缺口 · ${item.coverage.missing.length}条</summary>${list(item.coverage.missing)}</details>` : '';
    if (!usage) return `<section class="cd-section">${coverage}<p>每成品用量尚未明确，本项未进入成品金额合计。</p></section>`;
    return `<section class="cd-section"><div class="cd-section-title"><h3>折合每成品${partial ? ' · 已估部分' : ''}</h3><span>单价与用量分开</span></div>${coverage}<p>用量 ${h(usage.low === usage.high ? exactNumber(usage.low) : exactNumber(usage.low)+'–'+exactNumber(usage.high))} ${h(usage.unit)} / ${h(value?.unit || data.productTotal?.unit || '套')}。${h(usage.basis.replace('adoptedQuantityPerRobot', '每机器人用量'))}</p><p>${value?.low != null ? `${amount(value)} ${h(value.currency)} / ${h(value.unit)}${partial ? ' · 仅计入已估小计' : ''}` : '每成品金额尚未形成；未计入成品金额合计。'}</p></section>`;
  }

  function sharedModelDetails(item) {
    const model = item.raw?.sharedModel;
    if (!model || typeof model !== 'object') return '';
    const name = clip(model.name || model.modelName || model.familyName || (item.domain === 'process' ? '共享工艺模型' : '共享材料模型'), 48);
    const features = model.features ? evidenceText(model.features) : '';
    const applicable = model.applicability ? evidenceText(model.applicability) : '';
    const limitations = model.limitations ? evidenceText(model.limitations) : '';
    const calculation = model.calculation ? evidenceText(model.calculation) : item.estimate?.formula || '';
    return `<section class="cd-section"><div class="cd-section-title"><h3>${h(name)}</h3><span>相同特征复用系数，按本项用量计算</span></div>${applicable ? `<p>${h(applicable)}</p>` : ''}<details class="cd-inline-detail"><summary>本项如何套用共享模型</summary>${features ? `<p><strong>本项特征：</strong>${h(features)}</p>` : ''}${calculation ? `<p class="cd-formula">${h(calculation)}</p>` : ''}${limitations ? `<p><strong>适用限制：</strong>${h(limitations)}</p>` : ''}</details></section>`;
  }

  function conditionalDetails(item) {
    const raw = item.raw || {};
    const entries = [
      ['candidateEstimate', '候选估值：未计入合计'],
      ['conditionalReference', '条件参照：适用前需核对'],
      ['packageConstraint', '整套采购与排重关系'],
      ['applicationControl', '本项应用条件'],
      ['conditionalScenarios', '备选执行情景'],
      ['baselineAdoption', '主情景采用情况']
    ].filter(([key]) => raw[key] != null);
    if (!entries.length) return '';
    return `<section class="cd-section"><div class="cd-section-title"><h3>价格适用条件</h3><span>候选与整套价格不自动累计</span></div>${entries.map(([key, title]) => `<details class="cd-inline-detail"><summary>${h(title)}</summary><p>${h(evidenceText(raw[key]))}</p></details>`).join('')}</section>`;
  }

  function modelDetails(item) {
    const raw = item.raw || {};
    const parameters = (raw.parameters || []).map(p => ({...p, sourceUrls:p.sourceUrls || (p.sourceIds || []).map(id => raw.sources?.find(s => s.id === id)?.url).filter(Boolean)}));
    const scenarios = item.domain === 'process' && !data.currentStudy ? raw.scenarios : null;
    let breakdown = item.estimate?.breakdown || [];
    if (scenarios?.low && scenarios?.high) {
      const grouped = new Map();
      const category = name => /耗|棉签|胶水|针头/.test(name) ? '耗材' : /人工|操作|卸载/.test(name) ? '人工' : /设备|折旧|维护|工位|现场|共用.*站/.test(name) ? '设备与工位' : '其他单件资源';
      const add = (label, side, value) => { if (!grouped.has(label)) grouped.set(label, {label,low:0,high:0,currency:item.estimate.currency}); grouped.get(label)[side] += value; };
      ['low','high'].forEach(side => {
        (scenarios[side].variable || []).forEach(row => add(category(row.name || ''), side, (row.factors || []).reduce((product,x) => product*x,1) / (row.divisor || 1)));
        (scenarios[side].perBatch || []).forEach(row => add('周期批次摊销', side, row.cost / row.capacity));
      });
      const candidate = [...grouped.values()];
      if (['low','high'].every(side => Math.abs(candidate.reduce((sum,row) => sum + row[side],0) - item.estimate[side]) < 1e-7)) breakdown = candidate;
    }
    breakdown = breakdown.filter(row => row.low !== 0 || row.high !== 0);
    if (!parameters.length && !breakdown.length && !scenarios && !item.estimate?.formula) return '';
    return `<section class="cd-section"><div class="cd-section-title"><h3>单件成本怎样形成</h3><span>${data.currentStudy ? h(item.estimate.label) : item.domain === 'process' ? '成熟大批量制造' : item.estimate?.basis === 'published_bulk_reference' ? '换算与补充参数' : '费用模型'}</span></div>${breakdown.length ? `${breakdown.length > 8 ? `<details class="cd-inline-detail"><summary>展开逐项贡献 · ${breakdown.length}项</summary>` : ''}<div class="cd-breakdown">${breakdown.map(r => `<div><span>${h(r.label || r.name)}</span><strong>${bound(r.low)}–${bound(r.high, true)} <small>${h(r.currency || item.estimate.currency)}</small></strong></div>`).join('')}</div>${breakdown.length > 8 ? '</details>' : ''}` : ''}<details class="cd-inline-detail"><summary>展开计算参数与公式</summary>${item.estimate?.formula ? `<p class="cd-formula">${h(item.estimate.formula)}</p>` : ''}${parameters.length ? `<div class="cd-param-list">${parameters.map(p => `<article><div><strong>${h(p.name)}</strong><span>${h(exactNumber(p.low))}–${h(exactNumber(p.high))} ${h(p.unit)} · ${p.type === 'fact' ? '公开资料' : '工程假设'}</span></div><p>${h(p.basis)}</p><div class="cd-links">${(p.sourceUrls || []).map((u,i) => link(u, '依据 ' + (i + 1))).join('')}</div></article>`).join('')}</div>` : ''}${scenarios ? `<div class="cd-model-scenarios">${['low', 'high'].map(key => `<article><h4>${key === 'low' ? '下限情景' : '上限情景'}</h4>${(scenarios[key]?.variable || []).map(row => `<p><b>${h(row.name)}</b><br><code>${h((row.factors || []).join(' × '))} ÷ ${h(row.divisor || 1)}</code><br><span>${h(row.explanation)}</span></p>`).join('')}${(scenarios[key]?.perBatch || []).map(row => `<p><b>${h(row.name)}</b><br><code>${h(row.cost)} ÷ ${h(row.capacity)}</code><br>${h(row.explanation)}</p>`).join('')}</article>`).join('')}</div><p class="cd-footnote">每单准备费用在大量连续生产下趋近于零；周期性炉次等费用仍按批次容量折成每件。</p>` : ''}</details></section>`;
  }

  function audit(item) {
    const raw = item.raw || {};
    const research = item.domain === 'process' ? data.processAnalysis : data.componentAnalysis;
    const full = research?.currentBasis ? '/' + research.reportPath : item.domain === 'process' ? `/static/process-costs.html#${research?.id || ''}` : `/static/component-costs.html#${research?.id || ''}`;
    const prompt = research?.currentBasis ? research.promptIndex : item.domain === 'process' ? research?.runPath + '/index.html' : research?.promptIndex;
    return `<details class="cd-audit"><summary>范围、假设与研究存档</summary>${raw.scope?.length ? `<h4>承接的工序范围</h4>${list(raw.scope)}` : ''}${raw.exclusions?.length ? `<h4>排除重复费用</h4>${list(raw.exclusions)}` : ''}${raw.strategy?.assumptions?.length ? `<h4>估价前提</h4>${list(raw.strategy.assumptions)}` : ''}${raw.gaps?.length ? `<h4>尚待核实</h4>${list(raw.gaps)}` : ''}<div class="cd-links">${link(full, '完整研究结果')}${localLink(prompt, '子 Agent 提示词与运行记录')}</div><p class="cd-footnote">研究 ${h(research?.researchedOn || raw.researchDate || '日期见原始记录')} · ${research?.currentBasis ? '数量策略、用量、检索过程与完整证据保存在研究档案中。' : '原始数量档位、检索过程与完整证据保存在研究档案中。'}</p></details>`;
  }

  function manual(item) {
    const key = project.id + '/' + item.nodeId;
    const draft = drafts.get(key);
    if (draft && draft.basisKey !== item.basisKey) { staleDrafts.set(key, draft); drafts.delete(key); }
    const saved = drafts.get(key) || data.review?.ranges?.[item.nodeId] || {};
    const currency = item.estimate?.currency || saved.currency || 'CNY';
    const stale = data.review?.staleRanges?.[item.nodeId];
    return `<section class="cd-manual"><div class="cd-section-title"><h3>成本人员选定区间</h3><span>独立保存</span></div><p>结合上方报价和可比条件，填写本项采用值。</p>${stale ? '<p class="cd-stale">本项估算口径已更新，历史人工区间保留在存档中；请按当前口径重新确认。</p>' : ''}${staleDrafts.has(key) ? '<p class="cd-stale">未保存的旧口径草稿已隔离，未带入当前区间，请重新确认后填写。</p>' : ''}<div class="cd-manual-inputs"><label>下限<input data-cd-field="low" aria-label="成本下限" type="number" min="0" step="any" placeholder="待填写" value="${h(saved.low ?? '')}"></label><span>—</span><label>上限<input data-cd-field="high" aria-label="成本上限" type="number" min="0" step="any" placeholder="待填写" value="${h(saved.high ?? '')}"></label><label class="cd-currency-label">币种<input data-cd-field="currency" aria-label="成本币种" value="${h(currency)}" readonly></label></div><label class="cd-manual-note">采用依据<textarea data-cd-field="note" maxlength="2000" rows="2" placeholder="采用哪一来源、规格或系数">${h(saved.note || '')}</textarea></label><div class="cd-save-row"><span id="cd-save-status" role="status">${drafts.has(key) ? '有未保存的修改' : saved.low != null ? '已保存人工区间' : '尚未填写'}</span><button type="button" data-cd-action="save" class="cd-button cd-primary">保存本项</button></div></section>`;
  }

  function criticalNotes(item, review) {
    const notes = (item.critical || []).map(reviewText);
    if (!notes.length) return '';
    const expanded = notes.length > 2 || notes.some(note => note.length > 95);
    return `<div class="cd-critical ${review ? 'cd-critical-review' : ''}">${notes.slice(0,2).map(note => `<p><span aria-hidden="true">${review ? '!' : '·'}</span>${h(clip(note,95))}</p>`).join('')}${expanded ? `<details class="cd-inline-detail"><summary>完整前提与限制 · ${notes.length} 项</summary>${list(notes)}</details>` : ''}</div>`;
  }

  function open(id) {
    ensureDialog();
    const item = itemFor(id);
    if (!item) return false;
    if (!dialog.open) trigger = document.activeElement;
    currentId = id;
    const node = project.nodes?.find(n => n.id === id) || item.raw?.nodeSnapshot || {};
    const name = cleanName(node.name || item.raw?.name || id);
    const estimate = item.estimate || {};
    const index = data.items.indexOf(item);
    const review = estimate.low == null;
    const excluded = data.currentStudy && (node.active === false || (node.costBoundary && node.costBoundary !== 'independent'));
    const image = safeURL(node.imageUrl);
    const summary = reviewText(item.summary || item.raw?.displaySummary || item.raw?.strategy?.summary || node.description || '');
    const firstSentence = summary.indexOf('。');
    const shortSummary = clip(firstSentence >= 0 ? summary.slice(0, firstSentence + 1) : summary, 120);
    dialog.dataset.domain = item.domain;
    dialog.innerHTML = `<div class="cd-shell"><header class="cd-header"><div class="cd-breadcrumb">${h(project.productName || data.productName || '产品成本')} <span>/</span> ${item.domain === 'process' ? '工艺成本' : '部件成本'}</div><button class="cd-close" data-cd-action="close" type="button" aria-label="关闭成本详情">×</button></header><div class="cd-scroll">
      <div class="cd-hero">${image ? `<div class="cd-thumbnail"><img src="${h(image)}" alt="${h(node.imageLabel || name)}"></div>` : ''}<div class="cd-heading"><div class="cd-eyebrow">${h(id)} <span>· ${item.domain === 'process' ? '制造估算' : '独立成本项'}</span></div><h2 id="cd-title">${h(name)}</h2></div><div class="cd-hero-summary"><p>${h(shortSummary)}</p>${shortSummary !== summary ? `<details class="cd-inline-detail"><summary>完整估算摘要</summary><p>${h(summary)}</p></details>` : ''}</div></div>
      <div class="cd-price-hero ${review ? 'cd-review' : ''}"><div><div class="cd-eyebrow">${h(estimate.label || '成本参考区间')}${!review && item.coverage?.status === 'partial' ? ' · 已估部分' : ''}</div><div class="cd-big-amount">${amount(estimate)}${!review ? `<small>${h(estimate.currency)} / ${h(estimate.unit || '件')}</small>` : ''}</div><p>${h(clip(estimate.note || '', 105))}</p>${(estimate.note || '').length>105?`<details class="cd-inline-detail"><summary>完整口径说明</summary><p>${h(estimate.note)}</p></details>`:''}</div><button type="button" data-cd-action="price-jump" class="cd-button cd-quiet">查看${item.domain === 'process' ? '费率依据' : '价格来源'} ↓</button></div>
      ${excluded ? '<p class="cd-gate-note">本项不独立计入主合计；这里展示执行或采购该项的条件成本，采用关系沿用第一步。</p>' : ''}${pricingBasis(item, node)}${criticalNotes(item, review)}
      ${productUsage(item)}${benchmark(item)}${sharedModelDetails(item)}${conditionalDetails(item)}${modelDetails(item)}${priceSelection(item)}<details class="cd-method"><summary>估价路径 · ${(item.methodSteps || []).length} 步</summary><ol>${(item.methodSteps || []).map((step, i) => `<li><span>${i + 1}</span><p>${h(step)}</p></li>`).join('')}</ol></details>
      ${data.currentStudy ? currentSources(item) : item.domain === 'process' ? processSources(item) : purchaseSources(item)}${researchRounds(item)}${manual(item)}${audit(item)}<div class="cd-original-action"><button type="button" class="cd-link-button" data-cd-action="edit">编辑拆解信息</button><span>结构、数量与采购范围属于第一步</span></div></div><footer class="cd-footer"><span>${index + 1} / ${data.items.length} 个成本项</span><div><button type="button" class="cd-button cd-quiet" data-cd-action="prev" ${index === 0 ? 'disabled' : ''}>← 上一项</button><button type="button" class="cd-button cd-quiet" data-cd-action="next" ${index === data.items.length - 1 ? 'disabled' : ''}>下一项 →</button></div></footer></div>`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.cd-scroll').scrollTop = 0;
    dialog.querySelector('.cd-close').focus({preventScroll:true});
    return true;
  }

  function readManual() {
    const result = {};
    dialog.querySelectorAll('[data-cd-field]').forEach(el => {
      const field = el.dataset.cdField;
      result[field] = ['low','high'].includes(field) ? (el.value === '' ? null : Number(el.value)) : el.value;
    });
    result.basisKey = itemFor(currentId)?.basisKey || '';
    return result;
  }

  function rememberDraft(event) {
    if (!event.target.matches('[data-cd-field]')) return;
    drafts.set(project.id + '/' + currentId, readManual());
    const status = dialog.querySelector('#cd-save-status');
    if (status) { status.textContent = '有未保存的修改'; status.classList.remove('cd-error'); }
  }

  async function save() {
    const status = dialog.querySelector('#cd-save-status');
    const button = dialog.querySelector('[data-cd-action="save"]');
    try {
      const value = readManual();
      if ([...dialog.querySelectorAll('[data-cd-field]')].some(el => !el.checkValidity())) throw Error('请填写有效的非负金额');
      if ((value.low == null) !== (value.high == null) || value.low != null && (!Number.isFinite(value.low) || !Number.isFinite(value.high) || value.low > value.high)) throw Error('上下限需同时填写，且下限不大于上限');
      const savedId = currentId;
      const savedProject = project.id;
      button.disabled = true;
      status.textContent = '正在保存…';
      const ranges = {...data.review.ranges, [savedId]: value};
      const response = await fetch('/api/project-costs/' + encodeURIComponent(savedProject) + '/ranges', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({updatedAt:data.review.updatedAt, ranges})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '保存失败，请重试');
      if (project.id !== savedProject) return;
      data = result;
      drafts.delete(savedProject + '/' + savedId);
      staleDrafts.delete(savedProject + '/' + savedId);
      if (currentId === savedId) { status.textContent = '已保存'; status.classList.remove('cd-error'); }
      callbacks.onUpdate?.(data);
    } catch (error) { status.textContent = error.message; status.classList.add('cd-error'); }
    finally { button.disabled = false; }
  }

  function close() { if (dialog?.open) { dialog.close(); if (trigger?.isConnected) trigger.focus({preventScroll:true}); } }
  return {load, open, close, getData:() => data, getItem:itemFor, hasUnsavedChanges:() => drafts.size > 0};
})();
