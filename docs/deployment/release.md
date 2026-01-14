# Releasing @tatchi-xyz/sdk

There are two separate “publishes” in this repo:

- npm: the `@tatchi-xyz/sdk` package (currently manual)
- Cloudflare R2: signed `sdk/dist` runtime bundles (via `.github/workflows/publish-sdk-r2.yml`)

The Cloudflare Pages deploy workflows serve the SDK runtime assets from Pages under `/sdk/*`, so R2 publishing is optional unless you explicitly serve/proxy SDK assets from R2.

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
git push origin main
git push origin v0.1.1
```

3) (Optional) Publish bundles to Cloudflare R2

`publish-sdk-r2` runs on `workflow_run` after `ci` succeeds on `main`/`dev` and on `v*` tag pushes, and can also be triggered manually.

- `main`/tags publish to `releases/<sha>` (and `releases/<tag>` for `v*` tags)
- `dev` publishes to `releases-dev/<sha>`

4) Publish to npm (manual)
```
npm login --scope=@tatchi-xyz --registry=https://registry.npmjs.org
pnpm install
pnpm build:sdk-prod
cd sdk
npm publish --access public
```

## Reverting a bad publish

If you need to yank a version soon after release:
```
npm unpublish @tatchi-xyz/sdk@X.Y.Z --force
```
Use with caution — unpublishing can break consumers.
