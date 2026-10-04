'use client';
import { useSyncExternalStore } from 'react';
const eventName = 'stillform-storage-change';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(eventName, callback);
  };
}
export function useBrowserValue(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
export function useBrowserReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
export function useStorageAvailable() {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        localStorage.getItem('stillform-storage-check');
        return true;
      } catch {
        return false;
      }
    },
    () => true,
  );
}
export function writeBrowserValue(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(eventName));
}
