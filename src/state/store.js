import { initialState } from './initialState.js';

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  const seen = new WeakMap();
  const visit = (input) => {
    if (input === null || typeof input !== 'object') {
      return input;
    }
    if (seen.has(input)) {
      return seen.get(input);
    }
    if (input instanceof Map) {
      const result = new Map();
      seen.set(input, result);
      input.forEach((v, k) => {
        result.set(k, visit(v));
      });
      return result;
    }
    if (input instanceof Set) {
      const result = new Set();
      seen.set(input, result);
      input.forEach(v => result.add(visit(v)));
      return result;
    }
    if (Array.isArray(input)) {
      const result = input.map(item => visit(item));
      seen.set(input, result);
      return result;
    }
    const result = {};
    seen.set(input, result);
    Object.entries(input).forEach(([key, val]) => {
      result[key] = visit(val);
    });
    return result;
  };
  return visit(value);
}

class Store {
  constructor(defaultState) {
    this._state = clone(defaultState);
    this._listeners = new Map();
    this._globalListeners = new Set();
    this.state = new Proxy({}, {
      get: (_, key) => this._state[key],
      set: (_, key, value) => {
        this._state[key] = value;
        this._emit(key, value);
        return true;
      }
    });
  }

  getState() {
    return this._state;
  }

  setState(patch) {
    Object.entries(patch || {}).forEach(([key, value]) => {
      this._state[key] = value;
      this._emit(key, value);
    });
  }

  update(key, updater) {
    const current = this._state[key];
    const next = typeof updater === 'function' ? updater(current, this._state) : updater;
    this._state[key] = next;
    this._emit(key, next);
    return next;
  }

  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    const bucket = this._listeners.get(key);
    bucket.add(callback);
    return () => {
      bucket.delete(callback);
      if (bucket.size === 0) {
        this._listeners.delete(key);
      }
    };
  }

  subscribeAll(callback) {
    this._globalListeners.add(callback);
    return () => this._globalListeners.delete(callback);
  }

  _emit(key, value) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      listeners.forEach(listener => listener(value, this._state));
    }
    this._globalListeners.forEach(listener => listener(key, value, this._state));
  }
}

export const store = new Store(initialState);
export const state = store.state;
export const getState = () => store.getState();
export const setState = patch => store.setState(patch);
export const updateState = (key, updater) => store.update(key, updater);
export const subscribe = (key, callback) => store.subscribe(key, callback);
export const subscribeAll = callback => store.subscribeAll(callback);
