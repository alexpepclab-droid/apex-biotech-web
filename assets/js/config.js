/**
 * Apex Biotechnology Co., Ltd. 全局商务、交互选型与跨平台追踪配置文件
 * [2026-11-20 需求变更]：
 * - 适配 FB / IG (Meta) 与 TikTok 双平台投放，扩展 `gaMeasurementId` 及 `siteBaseUrl` 分享元数据支持
 * - 新增 12 色阳极氧化铝盖标准色板 (`CAP_SWATCHES`) 与 4 种瓶型 (`VIAL_FORMATS`) 供前端实时交互预览
 * - 升级 `buildInquiryMessage()`，支持自动带入用户选中的瓶盖配色规格与广告来源追踪 (`refSource`)
 *
 * @date 2026-11-20
 * @author Apex Biotechnology Engineering
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exported = factory();
    root.APEX_CONFIG = exported.APEX_CONFIG;
    root.CAP_SWATCHES = exported.CAP_SWATCHES;
    root.VIAL_FORMATS = exported.VIAL_FORMATS;
    root.buildWhatsAppUrl = exported.buildWhatsAppUrl;
    root.buildLineUrl = exported.buildLineUrl;
    root.buildInquiryMessage = exported.buildInquiryMessage;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  /**
   * 12 色标准库存阳极氧化铝盖色卡（用于包材交互预览器与简报回写）
   */
  const CAP_SWATCHES = [
    { id: 'glacier-cyan', name: 'Glacier Cyan', color: '#0ea5e9', rim: '#0284c7' },
    { id: 'cobalt-blue', name: 'Cobalt Blue', color: '#1d4ed8', rim: '#1e3a8a' },
    { id: 'titanium-silver', name: 'Titanium Silver', color: '#cbd5e1', rim: '#94a3b8' },
    { id: 'matte-black', name: 'Matte Obsidian', color: '#1e293b', rim: '#0f172a' },
    { id: 'champagne-gold', name: 'Champagne Gold', color: '#d4af37', rim: '#a17c1a' },
    { id: 'mint-teal', name: 'Bio Mint', color: '#10b981', rim: '#047857' },
    { id: 'pearl-white', name: 'Pearl Frost', color: '#f8fafc', rim: '#cbd5e1' },
    { id: 'rose-quartz', name: 'Rose Quartz', color: '#f43f5e', rim: '#be123c' },
    { id: 'slate-violet', name: 'Slate Violet', color: '#8b5cf6', rim: '#6d28d9' },
    { id: 'amber-bronze', name: 'Amber Bronze', color: '#d97706', rim: '#92400e' },
    { id: 'crimson-red', name: 'Ruby Red', color: '#dc2626', rim: '#991b1b' },
    { id: 'navy-ink', name: 'Deep Navy', color: '#0f2942', rim: '#071729' },
  ];

  /**
   * 标准硼硅玻璃西林瓶容量与瓶口口径映射
   */
  const VIAL_FORMATS = [
    { id: '2ml', label: '2mL', neck: '13mm Crimp', heightPx: 88, widthPx: 46 },
    { id: '3ml', label: '3mL', neck: '13mm Crimp', heightPx: 98, widthPx: 50 },
    { id: '5ml', label: '5mL', neck: '20mm Crimp', heightPx: 112, widthPx: 58 },
    { id: '10ml', label: '10mL', neck: '20mm Crimp', heightPx: 128, widthPx: 66 },
  ];

  /**
   * 站点核心商务与多像素配置常量
   */
  const APEX_CONFIG = {
    companyName: 'Apex Biotechnology Co., Ltd.',
    brandShort: 'APEX BIOTECH',
    whatsappDisplay: '+852 4437 9192',
    whatsappDigits: '85244379192',
    // [2026-11-18 对接系统: LINE Official Invite URL https://line.me/ti/p/F6s-63sxJf]
    lineUrl: 'https://line.me/ti/p/F6s-63sxJf',
    lineDisplay: 'LINE Official (+852 4437 9192)',
    // [2026-11-20 跨平台实体地址提示：绑定正式域名上线 Meta 投流前请补充具体写字楼/厂房门牌号]
    officeAddress: 'Export Desk: Kwun Tong, Kowloon, Hong Kong · Cleanroom Facility: Mainland China',
    exportDeskHours: 'US EST · UK GMT · APAC Live Desk',
    // [2026-11-20 部署正式 HTTPS 域名后可填写 https://yourdomain.com，用于补全绝对分享地址]
    siteBaseUrl: '',
    // [2026-11-20 对接系统: Meta Pixel / TikTok Pixel / GA4 — 需获 Cookie 同意后激活]
    metaPixelId: '',
    tiktokPixelId: '',
    gaMeasurementId: '',
  };

  /**
   * 构造含选型参数、自定义瓶盖规格及广告归因标记的简洁 B2B 询盘文本
   * [2026-11-20 对接系统: WhatsApp Pre-fill / LINE Clipboard / Cross-Platform UTM Tracking]
   *
   * @param {Object} [opts] - 可选选型与来源参数
   * @param {string} [opts.productLine] - 产品或 OEM 产线
   * @param {string} [opts.quantity] - 预估数量
   * @param {string} [opts.market] - 目的市场
   * @param {string} [opts.capSpec] - 交互预览器选定的容量与瓶盖配色
   * @param {string} [opts.refSource] - 广告 UTM / Click-ID 归因标签
   * @returns {string} 格式化询盘正文
   */
  function buildInquiryMessage(opts) {
    const o = opts || {};
    const product = (o.productLine && String(o.productLine).trim()) || 'Blue Copper (GHK-Cu) Topical Kits';
    const qty = (o.quantity && String(o.quantity).trim()) || '1–5 Sample Boxes (Trial)';
    const market = (o.market && String(o.market).trim()) || 'United States';
    const capSpec = (o.capSpec && String(o.capSpec).trim()) || '';
    const refSource = (o.refSource && String(o.refSource).trim()) || '';

    const lines = [
      'Hi Apex Biotech, quick inquiry from your portal:',
      `• Line: ${product}`,
      `• Volume: ${qty}`,
      `• Market: ${market}`,
    ];
    if (capSpec) {
      lines.push(`• Vial/Cap: ${capSpec}`);
    }
    if (refSource) {
      lines.push(`• Ad Ref: ${refSource}`);
    }
    lines.push('Please share factory pricing & sample COA.');
    return lines.join('\n');
  }

  /**
   * 构造带预填询盘信息的 WhatsApp Business 跳转 URL
   * [2026-11-20 对接系统: WhatsApp Click-to-Chat https://wa.me/85244379192]
   *
   * @param {string} [customMessage] - 询盘规格或留言内容
   * @returns {string} 完整 WhatsApp 对话链接
   */
  function buildWhatsAppUrl(customMessage) {
    const base = `https://wa.me/${APEX_CONFIG.whatsappDigits}`;
    const text =
      (customMessage && String(customMessage).trim()) ||
      `Hi ${APEX_CONFIG.companyName}, I'd like factory pricing & COA for Blue Copper (GHK-Cu) skincare kits / custom vial packaging.`;
    return `${base}?text=${encodeURIComponent(text)}`;
  }

  /**
   * 返回官方 LINE 加好友直达链接
   * [2026-11-20 对接系统: LINE Official URL https://line.me/ti/p/F6s-63sxJf]
   *
   * @returns {string} 官方 LINE 跳转链接
   */
  function buildLineUrl() {
    return APEX_CONFIG.lineUrl;
  }

  return {
    APEX_CONFIG,
    CAP_SWATCHES,
    VIAL_FORMATS,
    buildWhatsAppUrl,
    buildLineUrl,
    buildInquiryMessage,
  };
});
