const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { glob } = require('glob');
const GitUtils = require('./git-utils');
const GitCloner = require('./git-cloner');

/**
 * Unified interface for handling both local and remote template sources
 */
class TemplateSource {
  constructor(location) {
    this.location = location;
    this.isRemote = GitUtils.isGitUrl(location);
    this.gitCloner = this.isRemote ? new GitCloner() : null;
  }

  /**
   * Get the local path for this template source
   * For remote sources, this will be the cache path
   * For local sources, this will be the expanded path
   * @returns {string} The local path
   */
  getLocalPath() {
    if (this.isRemote) {
      return GitUtils.getCachePath(this.location);
    } else {
      return this.location.replace('~', os.homedir());
    }
  }

  /**
   * Ensure the template source is available locally
   * For remote sources, this will clone/update the repository
   * For local sources, this will check if the path exists
   * @param {object} options - Options for preparing the source
   * @param {boolean} options.force - Force refresh for remote sources
   * @param {boolean} options.quiet - Suppress output
   * @returns {string} The local path where templates can be found
   */
  async prepare(options = {}) {
    if (this.isRemote) {
      return await this.gitCloner.cloneAndValidate(this.location, options);
    } else {
      const localPath = this.getLocalPath();
      if (!(await fs.pathExists(localPath))) {
        throw new Error(
          `Local template directory does not exist: ${localPath}`
        );
      }
      return localPath;
    }
  }

  /**
   * Check if the template source is available/accessible
   * @returns {boolean} True if the source is available
   */
  async isAvailable() {
    try {
      if (this.isRemote) {
        // For remote sources, check if git is available and URL is valid
        return (
          GitUtils.validateGitUrl(this.location) &&
          (await this.gitCloner.isGitAvailable())
        );
      } else {
        // For local sources, check if the directory exists
        const localPath = this.getLocalPath();
        return await fs.pathExists(localPath);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Discover templates in this source
   * @param {object} options - Discovery options
   * @param {boolean} options.force - Force refresh for remote sources
   * @param {boolean} options.quiet - Suppress output
   * @returns {array} Array of template configurations
   */
  async discoverTemplates(options = {}) {
    try {
      const localPath = await this.prepare(options);
      return await this.findTemplatesInDirectory(localPath);
    } catch (error) {
      console.warn(
        `Warning: Failed to discover templates in ${this.location}: ${error.message}`
      );
      return [];
    }
  }

  /**
   * Find templates in a local directory
   * @param {string} directoryPath - The directory to search
   * @returns {array} Array of template configurations
   */
  async findTemplatesInDirectory(directoryPath) {
    const templates = [];

    try {
      // Look for pqs.config.js files in the location and immediate subdirectories
      const configFiles = await glob('**/pqs.config.js', {
        cwd: directoryPath,
        absolute: true,
        maxDepth: 2,
      });

      for (const configFile of configFiles) {
        try {
          // Clear require cache to get fresh config
          delete require.cache[configFile];
          const templateConfig = require(configFile);
          const templateDir = path.dirname(configFile);

          templates.push({
            ...templateConfig,
            path: templateDir,
            source: this.location,
            isRemote: this.isRemote,
            sourceType: this.isRemote ? 'git' : 'local',
            sourceInfo: this.isRemote
              ? GitUtils.parseGitUrl(this.location)
              : null,
          });
        } catch (error) {
          console.warn(
            `Warning: Failed to load template config at ${configFile}: ${error.message}`
          );
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to search for templates in ${directoryPath}: ${error.message}`
      );
    }

    return templates;
  }

  /**
   * Get display information for this source
   * @returns {object} Display information
   */
  getDisplayInfo() {
    if (this.isRemote) {
      const repoInfo = GitUtils.parseGitUrl(this.location);
      return {
        type: 'remote',
        display: `${repoInfo.host}/${repoInfo.full}`,
        full: this.location,
      };
    } else {
      return {
        type: 'local',
        display: this.location,
        full: this.getLocalPath(),
      };
    }
  }

  /**
   * Check if this source needs updating (for remote sources)
   * @returns {boolean} True if the source should be updated
   */
  async needsUpdate() {
    if (!this.isRemote) {
      return false; // Local sources don't need updating
    }

    const cacheManager = this.gitCloner.cacheManager;
    return await cacheManager.isCacheStale(this.location);
  }

  /**
   * Update this source (for remote sources)
   * @param {object} options - Update options
   * @returns {string} The updated local path
   */
  async update(options = {}) {
    if (!this.isRemote) {
      throw new Error('Cannot update local template source');
    }

    return await this.gitCloner.updateCachedRepository(this.location, options);
  }

  /**
   * Remove this source from cache (for remote sources)
   */
  async removeFromCache() {
    if (!this.isRemote) {
      throw new Error('Cannot remove local template source from cache');
    }

    const cacheManager = this.gitCloner.cacheManager;
    await cacheManager.removeCacheEntry(this.location);
  }

  /**
   * Get cache information for this source (for remote sources)
   * @returns {object|null} Cache information or null for local sources
   */
  async getCacheInfo() {
    if (!this.isRemote) {
      return null;
    }

    const cacheManager = this.gitCloner.cacheManager;
    return await cacheManager.getCacheInfo(this.location);
  }

  /**
   * Create a TemplateSource from a location string
   * @param {string} location - The location string (local path or git URL)
   * @returns {TemplateSource} A new TemplateSource instance
   */
  static from(location) {
    return new TemplateSource(location);
  }

  /**
   * Create multiple TemplateSources from an array of locations
   * @param {array} locations - Array of location strings
   * @returns {array} Array of TemplateSource instances
   */
  static fromArray(locations) {
    return locations.map(location => new TemplateSource(location));
  }
}

module.exports = TemplateSource;
