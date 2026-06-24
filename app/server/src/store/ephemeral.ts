type Item = {
  value: string;
  expiresAt: number;
};

class MemoryStore {
  private items = new Map<string, Item>();

  constructor() {
    setInterval(() => this.gc(), 60_000).unref();
  }

  async get(key: string) {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expiresAt > 0 && Date.now() > item.expiresAt) {
      this.items.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds = 0) {
    this.items.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  async del(key: string) {
    this.items.delete(key);
  }

  async scan(prefix: string) {
    const keys: string[] = [];
    for (const key of this.items.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  private gc() {
    const now = Date.now();
    for (const [key, item] of this.items) {
      if (item.expiresAt > 0 && now > item.expiresAt) this.items.delete(key);
    }
  }
}

export const ephemeral = new MemoryStore();
