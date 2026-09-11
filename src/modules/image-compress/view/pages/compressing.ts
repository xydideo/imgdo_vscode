import { state } from '../state';
import { escapeHtml } from '../../../../shared/webview/utils/html';

export function renderCompressing(): string {
  const p = state.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  const cancelling = p?.message === '正在取消…';
  return `
    <div class="compressing-wrap">
      <svg class="compress-svg" viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <linearGradient id="gPhoto" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4fbfad"/>
            <stop offset="100%" stop-color="#0d8f7c"/>
          </linearGradient>
        </defs>
        <rect class="frame" x="28" y="28" width="84" height="84" rx="14"/>
        <g class="photo">
          <rect x="40" y="40" width="60" height="60" rx="10" fill="url(#gPhoto)" opacity="0.9"/>
          <circle cx="58" cy="58" r="7" fill="#e6f7f4" opacity="0.9"/>
          <path d="M44 88 L62 68 L74 80 L86 66 L96 88 Z" fill="#c5ebe4" opacity="0.95"/>
        </g>
        <g class="arrow-l" fill="#0a7365">
          <path d="M18 70 L30 62 L30 78 Z"/>
        </g>
        <g class="arrow-r" fill="#0a7365">
          <path d="M122 70 L110 62 L110 78 Z"/>
        </g>
        <g class="spark" fill="#2aa996">
          <circle cx="70" cy="22" r="3"/>
          <circle cx="82" cy="26" r="2"/>
          <circle cx="58" cy="26" r="2"/>
        </g>
      </svg>
      <div>正在压缩… ${p ? `${p.done}/${p.total}` : ''}</div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="meta" style="margin:0">${escapeHtml(p?.message ? (cancelling ? p.message : `当前：${p.message}`) : '')}</div>
      <div id="compress-slow-hint" class="compress-slow-hint" ${state.compressSlowHint ? '' : 'hidden'}>${escapeHtml(state.compressSlowHint ?? '')}</div>
      <button type="button" class="secondary" data-action="cancel-compress" ${cancelling ? 'disabled' : ''}>${cancelling ? '取消中…' : '取消'}</button>
    </div>
  `;
}
