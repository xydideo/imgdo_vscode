import { requestRender } from '../../../../shell/runtime';
import { state } from '../state';

const SLOW_HINT_SEC = 10;
let itemTimerKey: string | undefined;
let itemTimerStartedAt = 0;
let itemTimerTick: number | undefined;

export function slowHintForSeconds(sec: number): string | undefined {
  if (sec >= 40) {
    return '受不了了，下个版本我给你优化程序！';
  }
  if (sec >= 30) {
    return '要不你喝口水';
  }
  if (sec >= 25) {
    return '快好了～';
  }
  if (sec >= 20) {
    return '这张是真的慢';
  }
  if (sec >= 15) {
    return '程序真没崩';
  }
  if (sec >= SLOW_HINT_SEC) {
    return '程序没崩，这张比较慢，请等下';
  }
  return undefined;
}

export function clearCompressItemTimer(): void {
  if (itemTimerTick != null) {
    window.clearInterval(itemTimerTick);
    itemTimerTick = undefined;
  }
  itemTimerKey = undefined;
  itemTimerStartedAt = 0;
  state.compressElapsedSec = 0;
  state.compressSlowHint = undefined;
}

/** 每张图从 0 重新计时；超时后按阶段切换慢图提示 */
export function ensureCompressItemTimer(key: string | undefined): void {
  if (!key || key === '完成' || key === '正在取消…') {
    if (key === '完成') {
      clearCompressItemTimer();
    } else if (key === '正在取消…' && itemTimerTick != null) {
      window.clearInterval(itemTimerTick);
      itemTimerTick = undefined;
    }
    return;
  }
  if (itemTimerKey === key) {
    return;
  }
  if (itemTimerTick != null) {
    window.clearInterval(itemTimerTick);
  }
  itemTimerKey = key;
  itemTimerStartedAt = Date.now();
  state.compressElapsedSec = 0;
  state.compressSlowHint = undefined;

  itemTimerTick = window.setInterval(() => {
    if (state.page !== 'compressing' || !itemTimerKey) {
      clearCompressItemTimer();
      return;
    }
    const sec = Math.floor((Date.now() - itemTimerStartedAt) / 1000);
    const hint = slowHintForSeconds(sec);
    const prev = state.compressSlowHint;
    state.compressElapsedSec = sec;
    state.compressSlowHint = hint;

    const hintEl = document.getElementById('compress-slow-hint');
    if (hintEl) {
      if (hint) {
        hintEl.hidden = false;
        hintEl.textContent = hint;
      } else {
        hintEl.hidden = true;
      }
    } else if (hint && hint !== prev) {
      requestRender();
    }
  }, 250);
}
