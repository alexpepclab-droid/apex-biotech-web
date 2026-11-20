/**
 * Apex Biotechnology Co., Ltd. 跨平台交互、包材配色器、归因追踪与像素管理模块
 * [2026-11-20 需求变更]：
 * - 适配 FB / IG / TikTok App 内置浏览器（IAB WebView）跳转与剪贴板 `execCommand` 降级复制
 * - 自动采集 `utm_* / fbclid / ttclid / gclid` 并持久化写入 WhatsApp/LINE 询盘来源标签
 * - 按时区/语言或 `?channel=line|wa` 智能切换默认活跃渠道（欧美 WhatsApp / APAC LINE）
 * - 新增 12 色铝盖 + 4 种玻璃瓶身 SVG 实时交互预览与 RP-HPLC 样本 COA 弹窗
 *
 * @date 2026-11-20
 * @author Apex Biotechnology Engineering
 */
(function () {
  'use strict';

  const CONSENT_KEY = 'apex_cookie_consent_v1';
  const ATTR_KEY = 'apex_ad_attr_v1';

  const cfg = window.APEX_CONFIG || {
    companyName: 'Apex Biotechnology Co., Ltd.',
    whatsappDisplay: '+852 4437 9192',
    whatsappDigits: '85244379192',
    lineUrl: 'https://line.me/ti/p/F6s-63sxJf',
    officeAddress: 'Kwun Tong, Kowloon, Hong Kong · Cleanroom Base, Mainland China',
    siteBaseUrl: '',
    metaPixelId: '',
    tiktokPixelId: '',
    gaMeasurementId: '',
  };

  const CAP_LIST = Array.isArray(window.CAP_SWATCHES)
    ? window.CAP_SWATCHES
    : [{ id: 'glacier-cyan', name: 'Glacier Cyan', color: '#0ea5e9', rim: '#0284c7' }];

  const VIAL_LIST = Array.isArray(window.VIAL_FORMATS)
    ? window.VIAL_FORMATS
    : [{ id: '3ml', label: '3mL', neck: '13mm Crimp', heightPx: 98, widthPx: 50 }];

  const makeWaUrl =
    typeof window.buildWhatsAppUrl === 'function'
      ? window.buildWhatsAppUrl
      : function (msg) {
          const base = 'https://wa.me/' + cfg.whatsappDigits;
          return msg ? base + '?text=' + encodeURIComponent(msg) : base;
        };

  const makeLineUrl =
    typeof window.buildLineUrl === 'function'
      ? window.buildLineUrl
      : function () {
          return cfg.lineUrl || 'https://line.me/ti/p/F6s-63sxJf';
        };

  const makeBriefText =
    typeof window.buildInquiryMessage === 'function'
      ? window.buildInquiryMessage
      : function (opts) {
          const o = opts || {};
          return `Hi Apex Biotech, inquiry: ${o.productLine || 'Topical Kits'} | ${o.quantity || '1 Sample Box'}`;
        };

  let activeVial = VIAL_LIST.find(function (v) { return v.id === '3ml'; }) || VIAL_LIST[0];
  let activeCap = CAP_LIST[0];
  let cachedAdRef = '';
  let briefRefreshHook = null;

  /**
   * 展示底部轻量通知条
   *
   * @param {string} msg - 提示信息
   */
  function showToast(msg) {
    const toast = document.getElementById('copy-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.classList.remove('show');
    }, 2800);
  }

  /**
   * 传统 DOM 选区复制兜底（用于限制 navigator.clipboard 的移动端内置浏览器）
   *
   * @param {string} text - 待复制文本
   * @returns {boolean} 是否成功复制
   */
  function legacyExecCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_err) {
      return false;
    }
  }

  /**
   * 跨环境安全剪贴板复制：Clipboard API 优先 + execCommand 降级兜底
   * [2026-11-20 对接系统: FB / IG / TikTok In-App Browser WebView Compatibility]
   *
   * @param {string} text - 待复制文本
   * @param {string} [feedback] - 成功/提示反馈语
   */
  function copyText(text, feedback) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        function () {
          if (feedback) showToast(feedback);
        },
        function () {
          legacyExecCopy(text);
          if (feedback) showToast(feedback);
        }
      );
    } else {
      legacyExecCopy(text);
      if (feedback) showToast(feedback);
    }
  }

  /**
   * 判断当前是否运行于 FB / IG / TikTok / LINE App 内置浏览器
   *
   * @returns {boolean} 是否处于常见社媒 App WebView
   */
  function detectInAppBrowser() {
    const ua = String(navigator.userAgent || '');
    return /FBAN|FBAV|Instagram|BytedanceWebview|musical_ly|TikTok|Line\//i.test(ua);
  }

  /**
   * 捕获并持久化跨平台广告归因标签（支持 Meta `fbclid` / TikTok `ttclid` / Google `gclid` / `utm_*`）
   * [2026-11-20 对接系统: Multi-Platform Ad Attribution]
   *
   * @returns {string} 精简来源标识，若为直接自然流量则返回空字符串
   */
  function captureAdAttribution() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const src = params.get('utm_source') || '';
      const camp = params.get('utm_campaign') || params.get('utm_content') || '';
      let tag = '';

      if (src && camp) {
        tag = `${src}/${camp}`;
      } else if (src) {
        tag = src;
      } else if (params.get('fbclid')) {
        tag = 'meta-ads';
      } else if (params.get('ttclid')) {
        tag = 'tiktok-ads';
      } else if (params.get('gclid')) {
        tag = 'google-ads';
      }

      if (tag) {
        tag = tag.slice(0, 48);
        sessionStorage.setItem(ATTR_KEY, tag);
        return tag;
      }
      return sessionStorage.getItem(ATTR_KEY) || '';
    } catch (_e) {
      return '';
    }
  }

  /**
   * 识别访客默认偏好聊天渠道：支持 URL `?channel=line|wa` 或根据 APAC 时区/语言自动切至 LINE
   *
   * @returns {'wa' | 'line'} 默认首推聊天渠道
   */
  function detectPreferredChannel() {
    try {
      const q = new URLSearchParams(window.location.search || '').get('channel');
      if (q === 'line' || q === 'wa') return q;
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
      const lang = String(navigator.language || '').toLowerCase();
      if (
        /bangkok|taipei|tokyo|jakarta|seoul/.test(tz) ||
        /^th|^ja|^zh-tw|^zh-hant/.test(lang)
      ) {
        return 'line';
      }
    } catch (_e) {
      // 忽略环境限制回退至 WhatsApp
    }
    return 'wa';
  }

  /**
   * 激活站点配置的官方联系信息及可选绝对分享 Meta 标签
   */
  function hydrateDynamicMetadata() {
    document.querySelectorAll('[data-office-address]').forEach(function (el) {
      if (cfg.officeAddress) el.textContent = cfg.officeAddress;
    });
    const base = String(cfg.siteBaseUrl || '').replace(/\/+$/, '');
    if (base) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.setAttribute('content', `${base}/assets/images/photos/cosmetic-kit-oem.webp`);
    }
  }

  /**
   * 在访客同意 Cookie 后按配置初始化 Meta Pixel、TikTok Pixel 与 GA4
   * [2026-11-20 对接系统: Consent-Aware Meta / TikTok / GA4 Analytics Pool]
   */
  function loadConsentAwarePixels() {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    // 1. Meta Pixel
    const metaPid = String(cfg.metaPixelId || '').trim();
    if (/^\d{8,20}$/.test(metaPid) && !window.fbq) {
      /* eslint-disable */
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', metaPid);
      window.fbq('track', 'PageView');
    }

    // 2. TikTok Pixel
    const ttPid = String(cfg.tiktokPixelId || '').trim();
    if (/^[A-Za-z0-9]{10,32}$/.test(ttPid) && !window.ttq) {
      /* eslint-disable */
      !(function (w, d, t) {
        w.TiktokAnalyticsObject = t;
        var ttq = (w[t] = w[t] || []);
        ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
        ttq.setAndDefer = function (tObj, e) {
          tObj[e] = function () {
            tObj.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.load = function (e) {
          var s = d.createElement('script');
          s.type = 'text/javascript';
          s.async = true;
          s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + e + '&lib=' + t;
          var x = d.getElementsByTagName('script')[0];
          x.parentNode.insertBefore(s, x);
        };
        ttq.load(ttPid);
        ttq.page();
      })(window, document, 'ttq');
      /* eslint-enable */
    }

    // 3. Google Analytics 4
    const gaId = String(cfg.gaMeasurementId || '').trim();
    if (/^G-[A-Z0-9]{6,16}$/.test(gaId) && !window.gtag) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', gaId);
    }
  }

  /**
   * 统一向已授权像素上报转化点击事件
   *
   * @param {string} channel - 'whatsapp' 或 'line'
   * @param {string} source - 触发按钮位置标识
   */
  function trackContactEvent(channel, source) {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;
    const label = `${channel || 'chat'}:${source || 'cta'}`;
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Contact', { content_name: label });
    }
    if (window.ttq && typeof window.ttq.track === 'function') {
      window.ttq.track('Contact', { content_name: label });
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'generate_lead', { event_category: channel, event_label: source });
    }
  }

  /**
   * 绑定 Cookie 同意控制条（默认拦截广告像素，等权提供 Reject 与 Accept）
   */
  function bindCookieConsent() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;

    const current = localStorage.getItem(CONSENT_KEY);
    if (!current) {
      banner.classList.add('open');
    } else if (current === 'accepted') {
      loadConsentAwarePixels();
    }

    const acceptBtn = document.getElementById('btn-cookie-accept');
    const rejectBtn = document.getElementById('btn-cookie-reject');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        localStorage.setItem(CONSENT_KEY, 'accepted');
        banner.classList.remove('open');
        loadConsentAwarePixels();
        showToast('Preferences saved: Analytics enabled.');
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        localStorage.setItem(CONSENT_KEY, 'rejected');
        banner.classList.remove('open');
        showToast('Preferences saved: Essential only.');
      });
    }

    document.querySelectorAll('[data-open-cookie-settings]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        banner.classList.add('open');
      });
    });
  }

  /**
   * 绑定全站 WhatsApp / LINE 链接与复制控件（针对社媒 IAB 内置浏览器优化跳转方式）
   */
  function bindContactLinks() {
    const inApp = detectInAppBrowser();

    document.querySelectorAll('[data-wa-link]').forEach(function (el) {
      const topic = el.getAttribute('data-wa-topic') || '';
      const source = el.getAttribute('data-wa-source') || 'page_wa';
      const defaultMsg = topic || (cachedAdRef ? `Hi Apex Biotech! (Ref: ${cachedAdRef})` : '');
      el.setAttribute('href', makeWaUrl(defaultMsg));
      if (!inApp) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.removeAttribute('target');
      }
      el.addEventListener('click', function () {
        trackContactEvent('whatsapp', source);
      });
    });

    document.querySelectorAll('[data-line-link]').forEach(function (el) {
      const topic = el.getAttribute('data-line-topic') || '';
      const source = el.getAttribute('data-line-source') || 'page_line';
      el.setAttribute('href', makeLineUrl());
      if (!inApp) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.removeAttribute('target');
      }
      el.addEventListener('click', function () {
        if (topic) {
          copyText(topic, 'Copied product note! Paste inside LINE chat.');
        }
        trackContactEvent('line', source);
      });
    });

    document.querySelectorAll('[data-copy-wa]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(cfg.whatsappDisplay, 'Copied WhatsApp: ' + cfg.whatsappDisplay);
      });
    });

    document.querySelectorAll('[data-copy-line]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(makeLineUrl(), 'Copied LINE Official link.');
      });
    });
  }

  /**
   * 绑定渠道选项卡并在加载时按访客时区或 URL 参数激活首推渠道
   *
   * @param {'wa' | 'line'} defaultChannel - 页面默认优先激活的通道
   */
  function bindTabGroups(defaultChannel) {
    document.querySelectorAll('[data-tab-group]').forEach(function (group) {
      const tabs = group.querySelectorAll('[data-tab-target]');
      const panes = group.querySelectorAll('[data-tab-pane]');

      function activate(target) {
        tabs.forEach(function (t) {
          const on = t.getAttribute('data-tab-target') === target;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panes.forEach(function (p) {
          p.classList.toggle('active', p.getAttribute('data-tab-pane') === target);
        });
      }

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          activate(tab.getAttribute('data-tab-target'));
        });
      });

      if (defaultChannel) {
        activate(defaultChannel);
      }
    });
  }

  /**
   * 绑定 12 色铝盖与 4 种西林瓶身实时交互预览器
   * [2026-11-20 交互增强：选择配色或容量后实时重绘 SVG 并同步回写至即时简报]
   */
  function bindVialCustomizer() {
    const swatchContainer = document.getElementById('cap-swatch-grid');
    const sizeContainer = document.getElementById('vial-size-pills');
    const capTopEl = document.getElementById('svg-cap-top');
    const capSkirtEl = document.getElementById('svg-cap-rim');
    const vialGlassEl = document.getElementById('svg-vial-glass');
    const vialCakeEl = document.getElementById('svg-vial-cake');
    const stageBadgeEl = document.getElementById('vial-stage-tag');
    const colorNameEl = document.getElementById('selected-color-name');
    const applyBtn = document.getElementById('btn-apply-cap-spec');

    if (!swatchContainer || !sizeContainer) return;

    function updateSvgVisual() {
      if (capTopEl) capTopEl.setAttribute('fill', activeCap.color);
      if (capSkirtEl) capSkirtEl.setAttribute('fill', activeCap.rim);

      if (vialGlassEl && vialCakeEl) {
        const w = activeVial.widthPx;
        const h = activeVial.heightPx;
        const x = Math.round((140 - w) / 2);
        const y = 176 - h;
        vialGlassEl.setAttribute('x', String(x));
        vialGlassEl.setAttribute('y', String(y));
        vialGlassEl.setAttribute('width', String(w));
        vialGlassEl.setAttribute('height', String(h));

        const neckW = Math.round(w * 0.68);
        const neckX = Math.round((140 - neckW) / 2);
        const capGroup = document.getElementById('svg-cap-group');
        if (capGroup) {
          capGroup.setAttribute('transform', `translate(${neckX - 2}, ${y - 22}) scale(${(neckW + 4) / 40}, 1)`);
        }

        vialCakeEl.setAttribute('x', String(x + 4));
        vialCakeEl.setAttribute('y', String(176 - Math.round(h * 0.34) - 4));
        vialCakeEl.setAttribute('width', String(w - 8));
        vialCakeEl.setAttribute('height', String(Math.round(h * 0.34)));
      }

      const specText = `${activeVial.label} (${activeVial.neck}) · ${activeCap.name}`;
      if (stageBadgeEl) stageBadgeEl.textContent = specText;
      if (colorNameEl) colorNameEl.textContent = `${activeCap.name} Cap`;
      if (typeof briefRefreshHook === 'function') briefRefreshHook();
    }

    sizeContainer.innerHTML = '';
    VIAL_LIST.forEach(function (vf) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-pill-btn' + (vf.id === activeVial.id ? ' active' : '');
      btn.setAttribute('data-vial-size', vf.id);
      btn.textContent = `${vf.label} (${vf.neck.split(' ')[0]})`;
      btn.addEventListener('click', function () {
        activeVial = vf;
        sizeContainer.querySelectorAll('.size-pill-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        updateSvgVisual();
      });
      sizeContainer.appendChild(btn);
    });

    swatchContainer.innerHTML = '';
    CAP_LIST.forEach(function (sw) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn' + (sw.id === activeCap.id ? ' active' : '');
      btn.style.backgroundColor = sw.color;
      btn.setAttribute('data-cap-id', sw.id);
      btn.setAttribute('aria-label', sw.name);
      btn.setAttribute('title', sw.name);
      btn.addEventListener('click', function () {
        activeCap = sw;
        swatchContainer.querySelectorAll('.swatch-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        updateSvgVisual();
      });
      swatchContainer.appendChild(btn);
    });

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        const lineSelect = document.getElementById('rfq-line');
        if (lineSelect) lineSelect.value = 'Custom Glass Vials & 12-Color Caps';
        if (typeof briefRefreshHook === 'function') briefRefreshHook();
        const contactSec = document.getElementById('contact');
        if (contactSec) contactSec.scrollIntoView({ behavior: 'smooth' });
        showToast(`Applied ${activeVial.label} · ${activeCap.name} to quote!`);
      });
    }

    updateSvgVisual();
  }

  /**
   * 移动端导航抽屉开关
   */
  function bindMobileNav() {
    const toggle = document.getElementById('mobile-menu-toggle');
    const drawer = document.getElementById('mobile-nav-drawer');
    if (!toggle || !drawer) return;

    toggle.addEventListener('click', function () {
      const open = drawer.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    drawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        drawer.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /**
   * 统一弹窗管理：处理 QR 双码弹窗与样本 COA 弹窗的打开/关闭
   *
   * @param {string} preferredChannel - 默认激活的 QR Tab ('wa' 或 'line')
   */
  function bindModals(preferredChannel) {
    const qrModal = document.getElementById('qr-modal');
    const coaModal = document.getElementById('coa-modal');

    function closeAll() {
      [qrModal, coaModal].forEach(function (m) {
        if (m) m.classList.remove('open');
      });
      document.body.style.overflow = '';
    }

    document.querySelectorAll('[data-open-qr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!qrModal) return;
        const target = btn.getAttribute('data-open-qr') || preferredChannel || 'wa';
        const tabBtn = qrModal.querySelector(`[data-tab-target="${target}"]`);
        if (tabBtn) tabBtn.click();
        qrModal.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    document.querySelectorAll('[data-open-coa]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!coaModal) return;
        coaModal.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
      backdrop.querySelectorAll('[data-close-modal]').forEach(function (btn) {
        btn.addEventListener('click', closeAll);
      });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) closeAll();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });
  }

  /**
   * 3 步极简实时简报器：同步产品线、数量、市场、交互器选定瓶盖与跨平台 UTM 归因
   * [2026-11-20 对接系统: WhatsApp Pre-fill + LINE Clipboard + Attribution Tagging]
   */
  function bindExpressBriefBuilder() {
    const form = document.getElementById('oem-rfq-form');
    if (!form) return;

    const lineSelect = document.getElementById('rfq-line');
    const qtySelect = document.getElementById('rfq-qty');
    const regionSelect = document.getElementById('rfq-region');
    const summaryText = document.getElementById('rfq-summary-text');
    const refBadge = document.getElementById('rfq-ref-code');
    const sendWaBtn = document.getElementById('btn-send-brief-wa');
    const sendLineBtn = document.getElementById('btn-send-brief-line');

    const refId = 'APX-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);
    if (refBadge) refBadge.textContent = refId;

    let latestBrief = '';

    function refreshBrief() {
      const capSpecStr = activeVial && activeCap ? `${activeVial.label} · ${activeCap.name}` : '';
      latestBrief =
        `[${refId}] ` +
        makeBriefText({
          productLine: lineSelect ? lineSelect.value : '',
          quantity: qtySelect ? qtySelect.value : '',
          market: regionSelect ? regionSelect.value : '',
          capSpec: capSpecStr,
          refSource: cachedAdRef,
        });
      if (summaryText) summaryText.textContent = latestBrief;
      if (sendWaBtn) sendWaBtn.setAttribute('href', makeWaUrl(latestBrief));
      if (sendLineBtn) sendLineBtn.setAttribute('href', makeLineUrl());
    }

    briefRefreshHook = refreshBrief;

    [lineSelect, qtySelect, regionSelect].forEach(function (el) {
      if (el) el.addEventListener('change', refreshBrief);
    });

    document.querySelectorAll('[data-prefill-line]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const val = btn.getAttribute('data-prefill-line');
        if (lineSelect && val) lineSelect.value = val;
        refreshBrief();
        const contactSec = document.getElementById('contact');
        if (contactSec) contactSec.scrollIntoView({ behavior: 'smooth' });
      });
    });

    if (sendWaBtn) {
      sendWaBtn.addEventListener('click', function () {
        refreshBrief();
        trackContactEvent('whatsapp', 'express_brief_wa');
      });
    }

    if (sendLineBtn) {
      sendLineBtn.addEventListener('click', function () {
        refreshBrief();
        copyText(latestBrief, 'Brief copied! Paste in LINE chat.');
        trackContactEvent('line', 'express_brief_line');
      });
    }

    refreshBrief();
  }

  /**
   * 紧凑型 FAQ 折叠交互
   */
  function bindFaq() {
    document.querySelectorAll('.faq-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const card = btn.closest('.faq-item');
        if (!card) return;
        const isOpen = card.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cachedAdRef = captureAdAttribution();
    const preferred = detectPreferredChannel();
    hydrateDynamicMetadata();
    bindCookieConsent();
    bindContactLinks();
    bindTabGroups(preferred);
    bindMobileNav();
    bindModals(preferred);
    bindExpressBriefBuilder();
    bindVialCustomizer();
    bindFaq();
  });
})();
