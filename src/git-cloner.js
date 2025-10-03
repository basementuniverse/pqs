const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs-extra');
const path = require('path');
const GitUtils = require('./git-utils');
const CacheManager = require('./cache-manager');

const execAsync = promisify(exec);

/**
 * Git clone operations for remote template repositories
 */
class GitCloner {
  constructor() {
    this.cacheManager = new CacheManager();
  }

  /**
   * Check if git is available on the system
   * @returns {boolean} True if git is available
   */
  async isGitAvailable() {
    try {
      await execAsync('git --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clone or get cached repository
   * @param {string} gitUrl - The git URL to clone
   * @param {object} options - Clone options
   * @param {boolean} options.force - Force re-clone even if cached
   * @param {boolean} options.quiet - Suppress output
   * @returns {string} Path to the local repository
   */
  async cloneOrGetCached(gitUrl, options = {}) {
    const { force = false, quiet = false } = options;

    // Validate git URL
    if (!GitUtils.validateGitUrl(gitUrl)) {
      throw new Error(`Invalid git URL: ${gitUrl}`);
    }

    // Check if git is available
    if (!(await this.isGitAvailable())) {
      throw new Error('Git is not installed or not available in PATH');
    }

    // Initialize cache
    await this.cacheManager.initializeCache();

    const cachePath = GitUtils.getCachePath(gitUrl);
    const cacheInfo = await this.cacheManager.getCacheInfo(gitUrl);

    // If cached and not forcing re-clone, return cached path
    if (!force && cacheInfo && cacheInfo.exists) {
      if (!quiet) {
        console.log(
          `Using cached template from ${GitUtils.parseGitUrl(gitUrl).full}`
        );
      }
      return cachePath;
    }

    // Remove existing cache if forcing re-clone
    if (force && cacheInfo && cacheInfo.exists) {
      await fs.remove(cachePath);
    }

    // Clone the repository
    if (!quiet) {
      console.log(
        `Downloading template from ${GitUtils.parseGitUrl(gitUrl).full}...`
      );
    }

    await this.cloneRepository(gitUrl, cachePath, options);

    // Update cache index
    await this.cacheManager.updateCacheEntry(gitUrl, {
      clonedAt: new Date().toISOString(),
    });

    if (!quiet) {
      console.log('✓ Template cached successfully');
    }

    return cachePath;
  }

  /**
   * Clone a git repository to a specific path
   * @param {string} gitUrl - The git URL to clone
   * @param {string} targetPath - The target path for cloning
   * @param {object} options - Clone options
   */
  async cloneRepository(gitUrl, targetPath, options = {}) {
    const { branch, quiet = false } = options;

    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(targetPath));

    // Build git clone command
    const normalizedUrl = GitUtils.normalizeGitUrl(gitUrl);
    const targetBranch = branch || GitUtils.extractBranch(gitUrl);

    let command = `git clone --depth 1`;

    // Add branch/tag if specified
    if (targetBranch) {
      command += ` --branch ${targetBranch}`;
    }

    // Add quiet flag if requested
    if (quiet) {
      command += ' --quiet';
    }

    command += ` "${normalizedUrl}" "${targetPath}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60 second timeout
      });

      // Git clone sometimes outputs to stderr even on success
      if (!quiet && (stdout || stderr)) {
        const output = (stdout + stderr).trim();
        if (output) {
          console.log(output);
        }
      }
    } catch (error) {
      // Clean up failed clone
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }

      throw new Error(`Failed to clone repository: ${error.message}`);
    }

    // Verify the clone was successful
    if (!(await fs.pathExists(targetPath))) {
      throw new Error('Repository was not cloned successfully');
    }

    // Remove .git directory to save space (optional)
    const gitDir = path.join(targetPath, '.git');
    if (await fs.pathExists(gitDir)) {
      await fs.remove(gitDir);
    }
  }

  /**
   * Update an existing cached repository
   * @param {string} gitUrl - The git URL to update
   * @param {object} options - Update options
   * @returns {string} Path to the updated repository
   */
  async updateCachedRepository(gitUrl, options = {}) {
    const cacheInfo = await this.cacheManager.getCacheInfo(gitUrl);

    if (!cacheInfo || !cacheInfo.exists) {
      throw new Error('Repository is not cached');
    }

    // For now, we'll just re-clone since we remove .git directory
    // In the future, we could keep .git and do a proper pull
    return await this.cloneOrGetCached(gitUrl, { ...options, force: true });
  }

  /**
   * Validate that a cloned repository contains a valid template
   * @param {string} repositoryPath - Path to the cloned repository
   * @returns {boolean} True if the repository contains valid templates
   */
  async validateTemplateRepository(repositoryPath) {
    const { glob } = require('glob');

    try {
      // Look for pqs.config.js files in the repository
      const configFiles = await glob('**/pqs.config.js', {
        cwd: repositoryPath,
        absolute: true,
        maxDepth: 2,
      });

      return configFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clone and validate a template repository
   * @param {string} gitUrl - The git URL to clone
   * @param {object} options - Clone options
   * @returns {string} Path to the validated repository
   */
  async cloneAndValidate(gitUrl, options = {}) {
    const repositoryPath = await this.cloneOrGetCached(gitUrl, options);

    const isValid = await this.validateTemplateRepository(repositoryPath);

    if (!isValid) {
      // Clean up invalid repository
      await this.cacheManager.removeCacheEntry(gitUrl);
      throw new Error(
        `Repository ${
          GitUtils.parseGitUrl(gitUrl).full
        } does not contain any valid templates (no pqs.config.js files found)`
      );
    }

    return repositoryPath;
  }

  /**
   * List all available templates in a git repository
   * @param {string} gitUrl - The git URL
   * @returns {array} Array of template configurations
   */
  async listRepositoryTemplates(gitUrl) {
    const repositoryPath = await this.cloneAndValidate(gitUrl);
    const { glob } = require('glob');
    const templates = [];

    try {
      // Look for pqs.config.js files
      const configFiles = await glob('**/pqs.config.js', {
        cwd: repositoryPath,
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
            source: gitUrl,
            isRemote: true,
          });
        } catch (error) {
          console.warn(
            `Warning: Failed to load template config at ${configFile}: ${error.message}`
          );
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to search for templates in ${repositoryPath}: ${error.message}`
      );
    }

    return templates;
  }
}

module.exports = GitCloner;
