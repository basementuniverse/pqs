const crypto = require('crypto');
const path = require('path');
const os = require('os');

/**
 * Git utilities for handling remote template repositories
 */
class GitUtils {
  /**
   * Check if a location string is a git URL
   * @param {string} location - The location string to check
   * @returns {boolean} True if the location is a git URL
   */
  static isGitUrl(location) {
    // Check for common git URL patterns
    const gitPatterns = [
      /^https?:\/\/.*\.git$/, // https://example.com/repo.git
      /^https?:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+$/, // https://github.com/user/repo
      /^https?:\/\/gitlab\.com\/[\w\-\.]+\/[\w\-\.]+$/, // https://gitlab.com/user/repo
      /^https?:\/\/bitbucket\.org\/[\w\-\.]+\/[\w\-\.]+$/, // https://bitbucket.org/user/repo
      /^git@[\w\.-]+:[\w\-\.]+\/[\w\-\.]+\.git$/, // git@github.com:user/repo.git
      /^ssh:\/\/git@[\w\.-]+\/[\w\-\.]+\/[\w\-\.]+\.git$/, // ssh://git@example.com/user/repo.git
    ];

    return gitPatterns.some(pattern => pattern.test(location));
  }

  /**
   * Normalize a git URL by removing branch/tag references and ensuring consistent format
   * @param {string} gitUrl - The git URL to normalize
   * @returns {string} The normalized git URL
   */
  static normalizeGitUrl(gitUrl) {
    // Remove branch/tag references (e.g., #main, #v1.0.0)
    let normalized = gitUrl.split('#')[0];

    // Convert GitHub/GitLab/Bitbucket URLs to .git format if not already
    if (
      normalized.match(
        /^https?:\/\/(github|gitlab|bitbucket)\.(com|org)\/[\w\-\.]+\/[\w\-\.]+$/
      )
    ) {
      if (!normalized.endsWith('.git')) {
        normalized += '.git';
      }
    }

    return normalized;
  }

  /**
   * Extract branch or tag from git URL if specified
   * @param {string} gitUrl - The git URL
   * @returns {string|null} The branch/tag name or null if not specified
   */
  static extractBranch(gitUrl) {
    const parts = gitUrl.split('#');
    return parts.length > 1 ? parts[1] : null;
  }

  /**
   * Generate a cache key from a git URL
   * @param {string} gitUrl - The git URL
   * @returns {string} A filesystem-safe cache key
   */
  static generateCacheKey(gitUrl) {
    const normalized = this.normalizeGitUrl(gitUrl);

    // Create a hash of the URL for uniqueness
    const hash = crypto
      .createHash('md5')
      .update(normalized)
      .digest('hex')
      .substring(0, 8);

    // Create a human-readable part from the URL
    let readable = normalized
      .replace(/^https?:\/\//, '')
      .replace(/^git@/, '')
      .replace(/^ssh:\/\/git@/, '')
      .replace(/:/g, '-')
      .replace(/\//g, '-')
      .replace(/\.git$/, '')
      .replace(/[^a-zA-Z0-9\-]/g, '');

    // Combine readable part with hash
    return `${readable}-${hash}`;
  }

  /**
   * Get the cache directory path for a git URL
   * @param {string} gitUrl - The git URL
   * @returns {string} The absolute path to the cache directory
   */
  static getCachePath(gitUrl) {
    const cacheKey = this.generateCacheKey(gitUrl);
    return path.join(os.homedir(), '.pqs', 'cache', cacheKey);
  }

  /**
   * Get the main cache directory path
   * @returns {string} The absolute path to the main cache directory
   */
  static getMainCachePath() {
    return path.join(os.homedir(), '.pqs', 'cache');
  }

  /**
   * Validate that a git URL is accessible (basic format validation)
   * @param {string} gitUrl - The git URL to validate
   * @returns {boolean} True if the URL appears to be a valid git URL
   */
  static validateGitUrl(gitUrl) {
    if (!this.isGitUrl(gitUrl)) {
      return false;
    }

    // Additional validation checks
    try {
      // Check for common invalid patterns
      if (gitUrl.includes('..') || gitUrl.includes('//')) {
        return false;
      }

      // Check for minimum length
      if (gitUrl.length < 10) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract repository information from a git URL
   * @param {string} gitUrl - The git URL
   * @returns {object} Repository information including owner, name, host
   */
  static parseGitUrl(gitUrl) {
    const normalized = this.normalizeGitUrl(gitUrl);

    // Parse different URL formats
    let match;

    // HTTPS format: https://github.com/owner/repo.git
    match = normalized.match(
      /^https?:\/\/([\w\.-]+)\/([\w\-\.]+)\/([\w\-\.]+)\.git$/
    );
    if (match) {
      return {
        host: match[1],
        owner: match[2],
        name: match[3],
        full: `${match[2]}/${match[3]}`,
      };
    }

    // SSH format: git@github.com:owner/repo.git
    match = normalized.match(/^git@([\w\.-]+):([\w\-\.]+)\/([\w\-\.]+)\.git$/);
    if (match) {
      return {
        host: match[1],
        owner: match[2],
        name: match[3],
        full: `${match[2]}/${match[3]}`,
      };
    }

    // Fallback - return basic info
    return {
      host: 'unknown',
      owner: 'unknown',
      name: 'unknown',
      full: 'unknown/unknown',
    };
  }
}

module.exports = GitUtils;
