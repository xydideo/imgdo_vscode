import type { ImageItem } from '../../panel/messages';
import {
  formatTargetWidth,
  isTargetSizeModified,
} from '../../scan/targetSize';
import { state } from '../state';
import { formatBytes } from '../../../../shared/webview/utils/format';
import { escapeHtml } from '../../../../shared/webview/utils/html';

function renderTargetSizeInput(item: ImageItem): string {
  const modified = isTargetSizeModified(item);
  const value = formatTargetWidth(item.targetWidth);
  return `<input
    class="target-size-input ${modified ? 'is-modified' : ''}"
    type="number"
    min="1"
    step="1"
    data-target-size="1"
    data-id="${escapeHtml(item.id)}"
    value="${escapeHtml(value)}"
    title="只改宽度，高度按原图比例自动计算（当前约 ${item.targetHeight}px）"
    spellcheck="false"
  />`;
}

function renderAllTableColgroup(): string {
  return `<colgroup>
    <col class="col-preview" />
    <col class="col-name" />
    <col class="col-path" />
    <col class="col-size" />
    <col class="col-target" />
    <col class="col-ext" />
    <col class="col-bytes" />
    <col class="col-action" />
  </colgroup>`;
}

function renderAllTableHead(): string {
  return `
    <table class="table table-fixed-cols table-head-only">
      ${renderAllTableColgroup()}
      <thead>
        <tr>
          <th>预览</th><th>名称</th><th>路径</th><th>尺寸</th><th>目标宽度</th><th>扩展名</th><th>大小</th><th></th>
        </tr>
      </thead>
    </table>
  `;
}

function renderAllTableBody(): string {
  const rows = state.items
    .map(
      (item) => `
      <tr data-id="${escapeHtml(item.id)}">
        <td><img class="thumb" src="${escapeHtml(item.previewUri ?? '')}" alt="" data-action="preview" data-id="${escapeHtml(item.id)}" /></td>
        <td>${escapeHtml(item.name)}</td>
        <td><div class="path" title="${escapeHtml(item.relativePath)}">${escapeHtml(item.relativePath)}</div></td>
        <td>${item.width}×${item.height}</td>
        <td>${renderTargetSizeInput(item)}</td>
        <td><span class="badge">${escapeHtml(item.ext)}</span></td>
        <td>${formatBytes(item.size)}</td>
        <td><button type="button" class="danger" data-action="exclude-queue" data-id="${escapeHtml(item.id)}">取消压缩</button></td>
      </tr>`
    )
    .join('');

  return `
    <table class="table table-fixed-cols table-body-only">
      ${renderAllTableColgroup()}
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTree(): string {
  type Node = { name: string; children: Map<string, Node>; files: ImageItem[] };
  const root: Node = { name: '', children: new Map(), files: [] };

  for (const item of state.items) {
    const parts = item.relativePath.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur.children.has(p)) {
        cur.children.set(p, { name: p, children: new Map(), files: [] });
      }
      cur = cur.children.get(p)!;
    }
    cur.files.push(item);
  }

  const countImages = (node: Node): number => {
    let total = node.files.length;
    for (const child of node.children.values()) {
      total += countImages(child);
    }
    return total;
  };

  const renderNode = (node: Node, depth: number): string => {
    const childDirs = [...node.children.values()]
      .map((c) => {
        const count = countImages(c);
        return `
        <div class="tree-row">
          <details open>
            <summary>
              <span class="tree-twisty" aria-hidden="true">▾</span>
              <span>📁 ${escapeHtml(c.name)}（${count}）</span>
            </summary>
            <div class="tree-children">
              ${renderNode(c, depth + 1)}
            </div>
          </details>
        </div>`;
      })
      .join('');
    const files = node.files
      .map(
        (item) => `
        <div class="tree-item">
          <img class="thumb" src="${escapeHtml(item.previewUri ?? '')}" alt="" data-action="preview" data-id="${escapeHtml(item.id)}" />
          <div class="tree-item-meta">
            <div>${escapeHtml(item.name)}</div>
            <div class="path">${item.width}×${item.height} · ${formatBytes(item.size)}</div>
          </div>
          <div class="tree-item-target" onclick="event.stopPropagation()">
            <label>目标宽</label>
            ${renderTargetSizeInput(item)}
          </div>
          <div class="tree-item-actions">
            <button type="button" class="danger" data-action="exclude-queue" data-id="${escapeHtml(item.id)}">取消压缩</button>
          </div>
        </div>`
      )
      .join('');
    return `${childDirs}${files}`;
  };

  return `<div class="tree">${renderNode(root, 0)}</div>`;
}

export function renderList(): string {
  const summary = state.summary;
  return `
    <div class="list-page">
      <div class="toolbar">
        <div class="tabs">
          <button type="button" class="tab ${state.listTab === 'all' ? 'active' : ''}" data-action="tab-all">所有图片<span class="count">${state.items.length}</span></button>
          <button type="button" class="tab ${state.listTab === 'tree' ? 'active' : ''}" data-action="tab-tree">目录结构</button>
        </div>
        <div class="actions">
          <button type="button" class="secondary" data-action="back-entry">重新选择</button>
          <button type="button" data-action="start-compress" ${state.items.length ? '' : 'disabled'}>开始压缩</button>
        </div>
      </div>
      <div class="meta list-meta">
        根目录：${escapeHtml(summary?.rootPath ?? '')} · 匹配: ${state.items.length} 张
        ${summary ? ` · 扫描: ${summary.scanned} · 小于阈值跳过: ${summary.skippedSmall}` : ''}
      </div>
      ${
        !state.items.length
          ? `<div class="empty">没有可压缩图片</div>`
          : state.listTab === 'all'
            ? `<div class="table-wrap list-table-shell">
                ${renderAllTableHead()}
                <div class="list-scroll">${renderAllTableBody()}</div>
              </div>`
            : `<div class="list-scroll">${renderTree()}</div>`
      }
    </div>
  `;
}
