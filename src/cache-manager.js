const fs = require('fs-extra');
const path = require('path');
const GitUtils = require('./git-utils');

/**
 * Cache management for remote git repositories
 */
class CacheManager {
  constructor() {
    this.cacheIndexFile = path.join(
      GitUtils.getMainCachePath(),
      '.cache-index.json'
    );
  }

  /**
   * Initialize the cache directory structure
   */
  async initializeCache() {
    const cachePath = GitUtils.getMainCachePath();
    await fs.ensureDir(cachePath);

    // Create cache index if it doesn't exist
    if (!(await fs.pathExists(this.cacheIndexFile))) {
      await this.saveCacheIndex({});
    }
  }

  /**
   * Load the cache index
   * @returns {object} The cache index object
   */
  async loadCacheIndex() {
    try {
      if (await fs.pathExists(this.cacheIndexFile)) {
        return await fs.readJson(this.cacheIndexFile);
      }
    } catch (error) {
      console.warn(`Warning: Failed to load cache index: ${error.message}`);
    }
    return {};
  }

  /**
   * Save the cache index
   * @param {object} index - The cache index object to save
   */
  async saveCacheIndex(index) {
    try {
      await fs.writeJson(this.cacheIndexFile, index, { spaces: 2 });
    } catch (error) {
      console.warn(`Warning: Failed to save cache index: ${error.message}`);
    }
  }

  /**
   * Check if a repository is cached and when it was last updated
   * @param {string} gitUrl - The git URL
   * @returns {object|null} Cache info or null if not cached
   */
  async getCacheInfo(gitUrl) {
    const cacheKey = GitUtils.generateCacheKey(gitUrl);
    const cachePath = GitUtils.getCachePath(gitUrl);
    const index = await this.loadCacheIndex();

    if (index[cacheKey] && (await fs.pathExists(cachePath))) {
      return {
        ...index[cacheKey],
        path: cachePath,
        exists: true,
      };
    }

    return null;
  }

  /**
   * Add or update cache entry
   * @param {string} gitUrl - The git URL
   * @param {object} info - Additional info to store
   */
  async updateCacheEntry(gitUrl, info = {}) {
    const cacheKey = GitUtils.generateCacheKey(gitUrl);
    const index = await this.loadCacheIndex();
    const repoInfo = GitUtils.parseGitUrl(gitUrl);

    index[cacheKey] = {
      url: GitUtils.normalizeGitUrl(gitUrl),
      branch: GitUtils.extractBranch(gitUrl),
      lastUpdated: new Date().toISOString(),
      host: repoInfo.host,
      owner: repoInfo.owner,
      name: repoInfo.name,
      ...info,
    };

    await this.saveCacheIndex(index);
  }

  /**
   * Remove a cache entry and its directory
   * @param {string} gitUrl - The git URL
   */
  async removeCacheEntry(gitUrl) {
    const cacheKey = GitUtils.generateCacheKey(gitUrl);
    const cachePath = GitUtils.getCachePath(gitUrl);
    const index = await this.loadCacheIndex();

    // Remove from index
    delete index[cacheKey];
    await this.saveCacheIndex(index);

    // Remove directory
    if (await fs.pathExists(cachePath)) {
      await fs.remove(cachePath);
    }
  }

  /**
   * Check if cache entry is stale (older than specified days)
   * @param {string} gitUrl - The git URL
   * @param {number} maxAgeDays - Maximum age in days (default: 7)
   * @returns {boolean} True if cache is stale
   */
  async isCacheStale(gitUrl, maxAgeDays = 7) {
    const cacheInfo = await this.getCacheInfo(gitUrl);

    if (!cacheInfo) {
      return true; // Not cached, so considered stale
    }

    const lastUpdated = new Date(cacheInfo.lastUpdated);
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
    const now = new Date();

    return now - lastUpdated > maxAge;
  }

  /**
   * List all cached repositories
   * @returns {array} Array of cache entries
   */
  async listCachedRepositories() {
    const index = await this.loadCacheIndex();
    const entries = [];

    for (const [cacheKey, info] of Object.entries(index)) {
      const cachePath = path.join(GitUtils.getMainCachePath(), cacheKey);
      const exists = await fs.pathExists(cachePath);

      entries.push({
        cacheKey,
        ...info,
        path: cachePath,
        exists,
      });
    }

    return entries;
  }

  /**
   * Clean up stale cache entries
   * @param {number} maxAgeDays - Maximum age in days
   * @returns {number} Number of entries cleaned up
   */
  async cleanupStaleEntries(maxAgeDays = 30) {
    const entries = await this.listCachedRepositories();
    let cleanedCount = 0;

    for (const entry of entries) {
      const lastUpdated = new Date(entry.lastUpdated);
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
      const now = new Date();

      if (now - lastUpdated > maxAge || !entry.exists) {
        await this.removeCacheEntry(entry.url);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Clean up orphaned cache directories (directories without index entries)
   * @returns {number} Number of orphaned directories cleaned up
   */
  async cleanupOrphanedDirectories() {
    const cachePath = GitUtils.getMainCachePath();
    const index = await this.loadCacheIndex();
    const indexKeys = new Set(Object.keys(index));

    if (!(await fs.pathExists(cachePath))) {
      return 0;
    }

    const entries = await fs.readdir(cachePath);
    let cleanedCount = 0;

    for (const entry of entries) {
      // Skip the index file
      if (entry === '.cache-index.json') {
        continue;
      }

      const entryPath = path.join(cachePath, entry);
      const stat = await fs.stat(entryPath);

      // If it's a directory and not in the index, remove it
      if (stat.isDirectory() && !indexKeys.has(entry)) {
        await fs.remove(entryPath);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  async getCacheStats() {
    const entries = await this.listCachedRepositories();
    const cachePath = GitUtils.getMainCachePath();

    let totalSize = 0;
    let validEntries = 0;
    let staleEntries = 0;

    for (const entry of entries) {
      if (entry.exists) {
        validEntries++;
        try {
          // Get directory size (simplified - just count files)
          const files = await fs.readdir(entry.path, { recursive: true });
          totalSize += files.length; // Rough approximation
        } catch (error) {
          // Ignore errors
        }

        if (await this.isCacheStale(entry.url)) {
          staleEntries++;
        }
      }
    }

    return {
      totalEntries: entries.length,
      validEntries,
      staleEntries,
      orphanedEntries: entries.length - validEntries,
      approximateSize: totalSize,
      cachePath,
    };
  }

  /**
   * Clear all cache
   */
  async clearAllCache() {
    const cachePath = GitUtils.getMainCachePath();

    if (await fs.pathExists(cachePath)) {
      await fs.remove(cachePath);
    }

    await this.initializeCache();
  }
}

module.exports = CacheManager;
