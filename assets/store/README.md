# The store captures

**The originals, kept because they are the record of what a submission was
reviewed with.** `server/public/*.webp` are lossy derivatives of two of these,
resized for a web column; these are the source. If Apple ever queries a
screenshot, or a different size is needed, it is regenerated from here rather
than from the derivative.

**Captured 2026-09-14** in the simulator — iPhone 11 Pro Max at 1242×2688 and
iPad Pro 13-inch at 2064×2752, which are App Store Connect's own slot sizes.
The date is in every filename because that is the fact worth carrying: a
capture ages against the interface, and there is nothing inside a PNG that says
which build it came from. **Name the next set for its own date rather than
overwriting these.**

| File | Shows |
| --- | --- |
| `2026-09-14-iphone-home.png` | The channel list — presence, recency, an empty channel saying so |
| `2026-09-14-iphone-floor.png` | A roster where somebody *has the floor*, and Release in the footer |
| `2026-09-14-iphone-player.png` | The player, with the floor gating who can change what plays |
| `2026-09-14-ipad-invite.png` | Two panes on iPad, and the guest link |

**Two of the four serve the landing page** — home and floor, chosen because the
interface itself carries an argument in them rather than displaying a feature.
planning/MARKETING.md § *What is already built* says why the other two are good
store assets and not landing-page ones.

**This directory is excluded from `bin/deploy`.** It is 900 KB of source
material the server has no use for, and the box should not carry it.

## Regenerating the derivatives

```sh
cwebp -q 82 -resize 750 0 assets/store/2026-09-14-iphone-home.png \
  -o server/public/home.webp
```

**The served filenames are not hashed and are cached for a week**, so if the
content changes, rename the `.webp` rather than replacing it in place —
`landing.ts` says the same thing where the route is registered.
