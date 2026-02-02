const releaseNotesGenerator = require('@semantic-release/release-notes-generator');

module.exports = {
    branches: [
        "main"
    ],
    plugins: [
        "@semantic-release/commit-analyzer",
        {
            generateNotes: async (pluginConfig, context) => {
                const notes = await releaseNotesGenerator.generateNotes(pluginConfig, context);
                const dockerUsername = process.env.DOCKERHUB_USERNAME;
                if (dockerUsername) {
                    return `${notes}\n\n### Docker Images\n- [API](https://hub.docker.com/r/${dockerUsername}/pantry-api)\n- [UI](https://hub.docker.com/r/${dockerUsername}/pantry-ui)\n- [Kiosk](https://hub.docker.com/r/${dockerUsername}/pantry-kiosk)`;
                }
                return notes;
            }
        },
        [
            "@semantic-release/exec",
            {
                "prepareCmd": "npm version ${nextRelease.version} --prefix api --no-git-tag-version --allow-same-version && npm version ${nextRelease.version} --prefix ui/pantry-ui --no-git-tag-version --allow-same-version && npm version ${nextRelease.version} --prefix rpi-kiosk/bridge --no-git-tag-version --allow-same-version && node rpi-kiosk/scripts/bump-scale-version.js ${lastRelease.gitTag} && sed -i \"s/appVersion: '.*'/appVersion: '${nextRelease.version}'/g\" ui/pantry-ui/src/environments/environment.ts && sed -i \"s/appVersion: '.*'/appVersion: '${nextRelease.version}'/g\" ui/pantry-ui/src/environments/environment.development.ts && sed -i \"s/appVersion: '.*'/appVersion: '${nextRelease.version}'/g\" ui/pantry-ui/src/environments/environment.production.ts"
            }
        ],
        [
            "@semantic-release/git",
            {
                "assets": [
                    "api/package.json",
                    "api/package-lock.json",
                    "ui/pantry-ui/package.json",
                    "ui/pantry-ui/package-lock.json",
                    "ui/pantry-ui/src/environments/environment.ts",
                    "ui/pantry-ui/src/environments/environment.development.ts",
                    "ui/pantry-ui/src/environments/environment.production.ts",
                    "rpi-kiosk/bridge/package.json",
                    "rpi-kiosk/arduino/scale/scale.ino"
                ],
                "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
            }
        ],
        "@semantic-release/github"
    ]
};
