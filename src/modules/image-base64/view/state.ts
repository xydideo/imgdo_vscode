import { createBase64State, type Base64UiState } from './types';

export let state: Base64UiState = createBase64State();

export function setBase64State(next: Base64UiState): void {
  state = next;
}

export function resetBase64State(): void {
  state = createBase64State();
}
