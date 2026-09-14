# The update screen tells a browser to open the App Store

`MIN_SUPPORTED_BUILD` applies to the web app, deliberately and consistently —
the floor is never raised past what is released, and the web client reports the
build number of the train it was cut from. So a browser **can** be shown
`UpdateRequiredView`, which says "Update from the App Store and everything will
be where you left it" and offers a button that opens `updateUrl`.

What a browser user must do is reload. The screen needs a web variant, which is
the smallest of the pieces here: the copy and the button, gated the way
`AudioDebugPanel` already gates itself on the platform. It was named as
required in WEB.md § *Required elsewhere* and did not get built before that
file was retired into decisions/ § *The web app is a versioned
client*.

The floor moved for the first time on 2026-09-13, 51 to 80, which is exactly
the event this was waiting for: a tab left open on a train cut below 80 now
meets `UpdateRequiredView` and is told to go to the App Store, which a browser
cannot do. It is no longer a screen waiting for a hypothetical.
