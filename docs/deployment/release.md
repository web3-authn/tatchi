# Releasing @tatchi-xyz/sdk

This project publishes the SDK to npm via GitHub Actions whenever a git tag like `vX.Y.Z` is pushed.

The workflow lives at `.github/workflows/publish.yml` and uses npm provenance (OIDC) plus the workspace build.


## Manually tag releases

1) Tag the release
```
# Edit sdk/package.json → "version": "0.1.1"
git add sdk/package.json
git commit -m "release: v0.1.1"
git tag v0.1.1 -m "release: v0.1.1"
```

2) Push commits and the tag

```
git push origin dev
git push origin v0.1.1
```

3) Publish to NPM
```
npm login --scope=@tatchi-xyz --registry=https://registry.npmjs.org
npm publish --access public
```

## Reverting a bad publish

If you need to yank a version soon after release:
```
npm unpublish @tatchi-xyz/sdk@X.Y.Z --force
```
Use with caution — unpublishing can break consumers.

