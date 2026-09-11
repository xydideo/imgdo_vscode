import { createIcoState, type IcoUiState } from './types';

export let state: IcoUiState = createIcoState();

export function setIcoState(next: IcoUiState): void {
  state = next;
}

export function resetIcoState(): void {
  state = createIcoState();
}
