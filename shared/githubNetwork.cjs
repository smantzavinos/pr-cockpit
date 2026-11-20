// An explicit list, not a suffix match: PR content can point at arbitrary hosts.
const hosts = new Set([
  "github.com", "api.github.com", "codeload.github.com", "uploads.github.com",
  "avatars.githubusercontent.com", "camo.githubusercontent.com", "media.githubusercontent.com",
  "objects.githubusercontent.com", "private-user-images.githubusercontent.com",
  "raw.githubusercontent.com", "release-assets.githubusercontent.com", "user-images.githubusercontent.com",
]);

function isGithubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && hosts.has(url.hostname);
  } catch {
    return false;
  }
}

module.exports = { isGithubUrl };
